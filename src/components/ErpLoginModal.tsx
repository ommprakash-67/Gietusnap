import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, RefreshCw, X } from 'lucide-react';

interface ErpLoginModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (session: { sessionId: string; username: string }) => void;
}

export function ErpLoginModal({
  open,
  onClose,
  onAuthenticated,
}: ErpLoginModalProps) {
  const [sessionId, setSessionId] = useState<string>('');
  const [captchaDataUrl, setCaptchaDataUrl] = useState<string | null>(null);
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);

  const loadChallenge = useCallback(async (existingSid?: string) => {
    setLoadingCaptcha(true);
    setError(null);
    setCaptcha('');
    try {
      const res = await fetch('/api/erp/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: existingSid || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Could not load GIETU ERP captcha.');
      }
      setSessionId(data.sessionId);
      setCaptchaDataUrl(data.captchaDataUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to reach GIETU ERP right now.'
      );
    } finally {
      setLoadingCaptcha(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadChallenge();
    const timer = window.setTimeout(() => usernameRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open, loadChallenge]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password || !captcha.trim()) {
      setError('Enter your GIETU ERP username, password, and captcha code.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/erp/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          username: username.trim(),
          password,
          captcha: captcha.trim(),
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setPassword('');
        setCaptcha('');
        onAuthenticated({
          sessionId: data.sessionId || sessionId,
          username: data.username || username.trim().toUpperCase(),
        });
        onClose();
        return;
      }

      setError(data.error || 'Sign-in failed. Please check credentials and captcha.');
      setCaptcha('');
      if (data.captchaDataUrl) {
        setCaptchaDataUrl(data.captchaDataUrl);
      } else {
        loadChallenge(sessionId);
      }
    } catch {
      setError('Network error while contacting GIETU ERP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="erp-login-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="erp-login-title"
              className="font-display text-xl font-bold tracking-tight text-zinc-950"
            >
              Connect GIETU ERP
            </h2>
            <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
              GIETU ERP requires an active login to serve student photos. Sign in
              once with your ERP account to unlock instant square photo lookup.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close ERP sign-in modal"
            className="w-9 h-9 rounded-lg text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="erp-username"
              className="block text-xs font-semibold text-zinc-700"
            >
              ERP Username
            </label>
            <input
              ref={usernameRef}
              id="erp-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. 25CSE020"
              autoComplete="username"
              maxLength={20}
              className="w-full h-11 px-3.5 bg-white border border-zinc-300 rounded-xl font-mono text-sm font-medium text-zinc-950 placeholder:text-zinc-400 placeholder:font-sans focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="erp-password"
              className="block text-xs font-semibold text-zinc-700"
            >
              ERP Password
            </label>
            <div className="relative">
              <input
                id="erp-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your GIETU ERP password"
                autoComplete="current-password"
                maxLength={32}
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

          {/* Live Captcha Row */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="erp-captcha"
                className="block text-xs font-semibold text-zinc-700"
              >
                Captcha Code
              </label>
              <button
                type="button"
                disabled={loadingCaptcha}
                onClick={() => loadChallenge(sessionId)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3 h-3 ${loadingCaptcha ? 'animate-spin' : ''}`}
                />
                Refresh
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-32 h-11 rounded-xl border border-zinc-200 bg-zinc-100 flex items-center justify-center overflow-hidden shrink-0">
                {loadingCaptcha ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-zinc-400" />
                ) : captchaDataUrl ? (
                  <img
                    src={captchaDataUrl}
                    alt="GIETU ERP captcha verification code"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-[11px] text-zinc-400">Unavailable</span>
                )}
              </div>

              <input
                id="erp-captcha"
                type="text"
                value={captcha}
                onChange={(e) => setCaptcha(e.target.value)}
                placeholder="4-char code"
                maxLength={6}
                autoComplete="off"
                className="flex-1 h-11 px-3.5 bg-white border border-zinc-300 rounded-xl font-mono text-sm font-semibold tracking-widest text-zinc-950 placeholder:text-zinc-400 placeholder:font-sans placeholder:tracking-normal focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="text-xs font-medium text-rose-600 leading-relaxed"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || loadingCaptcha || !sessionId}
            className="w-full h-11 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
          >
            {submitting ? 'Signing in to GIETU ERP…' : 'Sign In & Load Photos'}
          </button>

          <div className="flex items-start gap-2 pt-1 text-[11px] text-zinc-500 leading-relaxed">
            <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-400" />
            <span>
              Sent directly to <span className="font-mono">gietuerp.in</span> to
              create a temporary in-memory session. Your password is never saved.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
