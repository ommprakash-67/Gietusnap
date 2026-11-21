import { FormEvent, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

interface BatchAccessGateProps {
  onUnlocked: (session: { token: string; username: string }) => void;
}

export function BatchAccessGate({ onUnlocked }: BatchAccessGateProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter both Batch Grid username and password.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/batch-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok && data.token) {
        setPassword('');
        onUnlocked({
          token: data.token,
          username: data.username || username.trim(),
        });
        return;
      }

      setError(data.error || 'Invalid Batch Grid username or password.');
    } catch {
      setError('Unable to verify credentials right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-md border border-zinc-200/90 rounded-2xl p-6 sm:p-8 max-w-md mx-auto space-y-5">
      <div className="flex items-start gap-3.5">
        <div className="w-11 h-11 rounded-xl bg-zinc-100 border border-zinc-200/80 flex items-center justify-center text-zinc-800 shrink-0">
          <Lock className="w-5 h-5" strokeWidth={1.8} />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight text-zinc-950">
            Batch Grid Access Required
          </h3>
          <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
            Enter the unique Batch Square Grid username and password to unlock
            sequential roll number browsing.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="batch-auth-username"
            className="block text-xs font-semibold text-zinc-700"
          >
            Username
          </label>
          <input
            id="batch-auth-username"
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Enter unique username"
            autoComplete="off"
            className="w-full h-11 px-3.5 bg-white border border-zinc-300 rounded-xl font-mono text-sm font-medium text-zinc-950 placeholder:text-zinc-400 placeholder:font-sans focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="batch-auth-password"
            className="block text-xs font-semibold text-zinc-700"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="batch-auth-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Enter unique password"
              autoComplete="off"
              className="w-full h-11 pl-3.5 pr-10 bg-white border border-zinc-300 rounded-xl text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="w-8 h-8 rounded-md text-zinc-400 hover:text-zinc-900 flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-rose-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-11 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
        >
          {submitting ? 'Verifying…' : 'Unlock Batch Grid'}
        </button>
      </form>
    </div>
  );
}
