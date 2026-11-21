import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  Lock,
  LogOut,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { BatchAccessGate } from './components/BatchAccessGate';
import { ErpLoginModal } from './components/ErpLoginModal';
import { LightboxModal } from './components/LightboxModal';
import { StudentPhotoCard } from './components/StudentPhotoCard';
import {
  buildStudentImageUrl,
  ERP_LOGIN_URL,
  generateRollRange,
  normalizeRollNumber,
  stepRollNumber,
} from './utils/rollNumber';

const DEFAULT_ROLL = '22CSE000';
const HISTORY_STORAGE_KEY = 'gietu_snap_recent_rolls_v1';
const ERP_SESSION_STORAGE_KEY = 'gietu_snap_erp_session_v1';
const BATCH_AUTH_STORAGE_KEY = 'gietu_snap_batch_auth_v1';
const BRANCH_PRESETS = ['25CSE', '24CSE', '25ECE', '25EEE', '25ME', '25CE'];

interface ErpSessionState {
  sessionId: string;
  username: string | null;
}

interface BatchAuthState {
  token: string;
  username: string;
}

function loadSavedHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [DEFAULT_ROLL];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 9);
    }
    return [DEFAULT_ROLL];
  } catch {
    return [DEFAULT_ROLL];
  }
}

function loadSavedErpSession(): ErpSessionState | null {
  try {
    const raw = window.sessionStorage.getItem(ERP_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.sessionId === 'string' && parsed.sessionId) {
      return {
        sessionId: parsed.sessionId,
        username: typeof parsed.username === 'string' ? parsed.username : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function loadSavedBatchAuth(): BatchAuthState | null {
  try {
    const raw = window.sessionStorage.getItem(BATCH_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === 'string' && parsed.token) {
      return {
        token: parsed.token,
        username: typeof parsed.username === 'string' ? parsed.username : 'Admin',
      };
    }
    return null;
  } catch {
    return null;
  }
}

export default function App() {
  const [inputValue, setInputValue] = useState(DEFAULT_ROLL);
  const [activeRoll, setActiveRoll] = useState(DEFAULT_ROLL);
  const [inputError, setInputError] = useState<string | null>(null);
  const [recentRolls, setRecentRolls] = useState<string[]>(() =>
    loadSavedHistory()
  );
  const [lightboxRoll, setLightboxRoll] = useState<string | null>(null);

  // Authenticated GIETU ERP proxy session
  const [erpSession, setErpSession] = useState<ErpSessionState | null>(() =>
    loadSavedErpSession()
  );
  const [erpModalOpen, setErpModalOpen] = useState(false);

  // Protected Batch Square Grid access state
  const [batchAuth, setBatchAuth] = useState<BatchAuthState | null>(() =>
    loadSavedBatchAuth()
  );

  // Batch range viewer state
  const [batchPrefix, setBatchPrefix] = useState('25CSE');
  const [batchStart, setBatchStart] = useState('18');
  const [batchEnd, setBatchEnd] = useState('23');
  const [batchRolls, setBatchRolls] = useState<string[]>(() =>
    generateRollRange('25CSE', 18, 23, 3)
  );

  const inputRef = useRef<HTMLInputElement>(null);

  // Verify any saved session ID with the backend on startup
  useEffect(() => {
    const saved = loadSavedErpSession();
    if (!saved) return;

    let cancelled = false;
    fetch(`/api/erp/status?sid=${encodeURIComponent(saved.sessionId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.authenticated) {
          setErpSession(null);
          try {
            window.sessionStorage.removeItem(ERP_SESSION_STORAGE_KEY);
          } catch {
            // Ignore storage errors
          }
        } else if (data.username && data.username !== saved.username) {
          setErpSession({
            sessionId: saved.sessionId,
            username: data.username,
          });
        }
      })
      .catch(() => {
        // Keep current state on transient network failure
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Verify any saved Batch Grid access token on startup
  useEffect(() => {
    const saved = loadSavedBatchAuth();
    if (!saved) return;

    let cancelled = false;
    fetch(`/api/batch-auth/status?token=${encodeURIComponent(saved.token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.unlocked) {
          setBatchAuth(null);
          try {
            window.sessionStorage.removeItem(BATCH_AUTH_STORAGE_KEY);
          } catch {
            // Ignore storage errors
          }
        }
      })
      .catch(() => {
        // Keep current state on transient network failure
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        HISTORY_STORAGE_KEY,
        JSON.stringify(recentRolls)
      );
    } catch {
      // Ignore storage quota / privacy mode issues
    }
  }, [recentRolls]);

  const handleErpAuthenticated = useCallback(
    (session: { sessionId: string; username: string }) => {
      setErpSession(session);
      try {
        window.sessionStorage.setItem(
          ERP_SESSION_STORAGE_KEY,
          JSON.stringify(session)
        );
      } catch {
        // Ignore storage errors
      }
    },
    []
  );

  const handleErpDisconnect = useCallback(async () => {
    const sid = erpSession?.sessionId;
    setErpSession(null);
    try {
      window.sessionStorage.removeItem(ERP_SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    if (sid) {
      fetch('/api/erp/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid }),
      }).catch(() => {
        // Ignore logout network error
      });
    }
  }, [erpSession]);

  const handleBatchUnlocked = useCallback((session: BatchAuthState) => {
    setBatchAuth(session);
    try {
      window.sessionStorage.setItem(
        BATCH_AUTH_STORAGE_KEY,
        JSON.stringify(session)
      );
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleBatchLock = useCallback(() => {
    const token = batchAuth?.token;
    setBatchAuth(null);
    try {
      window.sessionStorage.removeItem(BATCH_AUTH_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    if (token) {
      fetch('/api/batch-auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {
        // Ignore logout network error
      });
    }
  }, [batchAuth]);

  const commitRollLookup = useCallback((rawRoll: string) => {
    const normalized = normalizeRollNumber(rawRoll);
    if (!normalized) {
      setInputError('Please enter a valid roll number, e.g. 22CSE000.');
      return;
    }

    setInputError(null);
    setActiveRoll(normalized);
    setInputValue(normalized);
    setRecentRolls((prev) => {
      const deduped = [normalized, ...prev.filter((r) => r !== normalized)];
      return deduped.slice(0, 9);
    });
  }, []);

  const handleLookupSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commitRollLookup(inputValue);
  };

  // Auto-fetch as soon as a complete roll number (e.g. 22CSE000) is entered
  useEffect(() => {
    const normalized = normalizeRollNumber(inputValue);
    if (!normalized || normalized === activeRoll) return;
    if (!/^\d{2}[A-Z]{2,6}\d{2,}$/.test(normalized)) return;

    const timer = window.setTimeout(() => {
      commitRollLookup(normalized);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [inputValue, activeRoll, commitRollLookup]);

  const handleStep = useCallback(
    (delta: number) => {
      const next = stepRollNumber(activeRoll, delta);
      if (next) {
        commitRollLookup(next);
      }
    },
    [activeRoll, commitRollLookup]
  );

  const handleBranchPreset = (prefix: string) => {
    setInputValue(prefix);
    setInputError(null);
    inputRef.current?.focus();
  };

  const handleBatchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const startNum = Math.max(1, parseInt(batchStart, 10) || 1);
    const parsedEnd = parseInt(batchEnd, 10);
    const endNum = Math.max(startNum, Number.isNaN(parsedEnd) ? startNum : parsedEnd);
    setBatchStart(String(startNum));
    setBatchEnd(String(endNum));
    setBatchRolls(generateRollRange(batchPrefix, startNum, endNum, 3));
  };

  const handleInspectFromGrid = (roll: string) => {
    commitRollLookup(roll);
    document.getElementById('lookup')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Keyboard arrow stepping when not typing in an input or modal
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (lightboxRoll || erpModalOpen) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        handleStep(-1);
      } else if (event.key === 'ArrowRight') {
        handleStep(1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStep, lightboxRoll, erpModalOpen]);

  const prevRoll = stepRollNumber(activeRoll, -1);
  const nextRoll = stepRollNumber(activeRoll, 1);
  const liveDirectUrl = buildStudentImageUrl(activeRoll);

  return (
    <div className="relative min-h-screen text-[#0A0A0B] flex flex-col">
      {/* Full-viewport GIETU Campus Background with Measured Atmospheric Scrim */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 pointer-events-none overflow-hidden bg-[#F7F7F5]"
      >
        <img
          src="/assets/image_b528cc6b.png"
          alt=""
          className="w-full h-full object-cover object-center scale-[1.01]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#F7F7F5]/80 via-[#F7F7F5]/72 to-[#F7F7F5]/86 backdrop-blur-[1.5px]" />
      </div>

      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-zinc-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <a
            href="#lookup"
            className="font-display text-lg font-extrabold tracking-tight text-zinc-950 whitespace-nowrap shrink-0"
          >
            GIETU Snap
          </a>

          {/* Zone 2: 3 Clean Single-Line Nav Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-700"
          >
            <a
              href="#lookup"
              className="hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0"
            >
              Lookup
            </a>
            <a
              href="#batch"
              className="hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0"
            >
              Batch Grid
            </a>
            <a
              href="#recent"
              className="hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0"
            >
              Recent
            </a>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          {erpSession ? (
            <button
              type="button"
              onClick={handleErpDisconnect}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-900 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out ERP
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setErpModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-zinc-950 rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Connect ERP
            </button>
          )}
        </div>
      </header>

      <main className="flex-1">
        {/* HERO / PRIMARY LOOKUP SECTION */}
        <section
          id="lookup"
          className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-14 lg:pt-14 lg:pb-20"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
            {/* Left Column: Bold Heading + Instant Lookup Controls */}
            <div className="lg:col-span-7 flex flex-col justify-between gap-8">
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 flex-wrap">
                  <span>GIETU Student Directory</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {erpSession
                      ? `ERP Connected (${erpSession.username ?? 'Active'})`
                      : 'Sign in once to unlock direct portraits'}
                  </span>
                </div>

                <h1 className="font-display text-[clamp(2.35rem,4.5vw,3.9rem)] font-extrabold tracking-tight leading-[1.04] text-zinc-950 [text-wrap:balance]">
                  Bhai Tu Dal, Nikalna Hamara Kam Hai
                </h1>

                <p className="text-base text-zinc-800 max-w-xl leading-relaxed">
                  Enter any GIETU roll number below to display the student roll
                  number on top and their square portrait directly underneath.
                </p>
              </div>

              {/* Roll Number Entry Form */}
              <div className="space-y-5">
                <form
                  onSubmit={handleLookupSubmit}
                  className="flex flex-col sm:flex-row gap-3"
                  noValidate
                >
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => {
                        setInputValue(e.target.value.toUpperCase());
                        if (inputError) setInputError(null);
                      }}
                      placeholder="Enter roll number (e.g. 25CSE000)"
                      aria-label="Student roll number"
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full h-13 pl-11 pr-10 bg-white border border-zinc-300 rounded-xl font-mono text-base font-semibold tracking-wide text-zinc-950 placeholder:text-zinc-400 placeholder:font-sans placeholder:font-normal focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-colors"
                    />
                    {inputValue && (
                      <button
                        type="button"
                        onClick={() => {
                          setInputValue('');
                          inputRef.current?.focus();
                        }}
                        aria-label="Clear roll number input"
                        className="w-8 h-8 rounded-md text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 flex items-center justify-center absolute right-2 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="h-13 px-6 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-sm rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                  >
                    Show Photo
                  </button>
                </form>

                {inputError && (
                  <p role="alert" className="text-xs font-medium text-rose-600">
                    {inputError}
                  </p>
                )}

                {!erpSession && (
                  <p className="text-xs text-zinc-800 leading-relaxed">
                    Because <span className="font-mono font-semibold">gietuerp.in</span>{' '}
                    protects student photos behind login cookies,{' '}
                    <button
                      type="button"
                      onClick={() => setErpModalOpen(true)}
                      className="font-semibold text-[#2563EB] hover:text-[#1D4ED8] underline underline-offset-4 cursor-pointer"
                    >
                      sign in to GIETU ERP here
                    </button>{' '}
                    so photos load directly inside this page.
                  </p>
                )}

                {/* Quick Branch Prefixes */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <span className="text-xs font-semibold text-zinc-700 whitespace-nowrap shrink-0">
                    Quick prefix
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {BRANCH_PRESETS.map((prefix) => (
                      <button
                        key={prefix}
                        type="button"
                        onClick={() => handleBranchPreset(prefix)}
                        className="px-2.5 py-1.5 text-xs font-mono font-semibold text-zinc-800 bg-white/90 border border-zinc-200/90 rounded-lg hover:border-zinc-400 hover:bg-white hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                      >
                        {prefix}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prev / Next Roll Number Stepper */}
                <div className="pt-5 border-t border-zinc-300/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!prevRoll}
                      onClick={() => handleStep(-1)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-semibold text-zinc-900 bg-white/90 border border-zinc-200/90 rounded-lg hover:border-zinc-400 hover:bg-white hover:text-zinc-950 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      {prevRoll ?? 'Prev'}
                    </button>
                    <button
                      type="button"
                      disabled={!nextRoll}
                      onClick={() => handleStep(1)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-semibold text-zinc-900 bg-white/90 border border-zinc-200/90 rounded-lg hover:border-zinc-400 hover:bg-white hover:text-zinc-950 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                    >
                      {nextRoll ?? 'Next'}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-xs text-zinc-700 font-mono truncate max-w-full sm:max-w-[290px]">
                    <a
                      href={liveDirectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-zinc-950 underline decoration-zinc-400 underline-offset-4 transition-colors"
                      title={liveDirectUrl}
                    >
                      GetStudentImage?rollno={activeRoll}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Dominant Focal Anchor — Roll Number on Top, Square Photo Below */}
            <div className="lg:col-span-5 flex flex-col">
              <StudentPhotoCard
                rollNumber={activeRoll}
                erpSessionId={erpSession?.sessionId ?? null}
                variant="spotlight"
                onRequireErpLogin={() => setErpModalOpen(true)}
                onSessionExpired={handleErpDisconnect}
                onOpenLightbox={setLightboxRoll}
              />
            </div>
          </div>
        </section>

        {/* BATCH RANGE GRID SECTION */}
        <section
          id="batch"
          className="border-t border-zinc-300/60 bg-white/55 backdrop-blur-[2px] py-14 lg:py-20"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-zinc-700">
                  Sequential Range Explorer
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
                  Batch Square Grid
                </h2>
                <p className="text-sm text-zinc-700 max-w-xl">
                  {batchAuth ? (
                    <>
                      Browse any range of sequential roll numbers side by side
                      {batchRolls.length > 0 && (
                        <span className="text-zinc-700 tabular-nums">
                          {' '}
                          · Showing {batchRolls.length}{' '}
                          {batchRolls.length === 1 ? 'portrait' : 'portraits'}
                        </span>
                      )}
                      .
                    </>
                  ) : (
                    'Protected section — unlock with your unique Batch Grid username and password.'
                  )}
                </p>
              </div>

              {batchAuth && (
                <div className="flex flex-wrap items-end gap-3">
                  <form
                    onSubmit={handleBatchSubmit}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-zinc-600">
                        Prefix
                      </span>
                      <input
                        type="text"
                        value={batchPrefix}
                        onChange={(e) =>
                          setBatchPrefix(e.target.value.toUpperCase())
                        }
                        placeholder="25CSE"
                        className="w-28 h-10 px-3 bg-white border border-zinc-300 rounded-lg font-mono text-sm font-semibold text-zinc-950 focus:outline-none focus:border-[#2563EB]"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-zinc-600">
                        From
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        value={batchStart}
                        onChange={(e) => setBatchStart(e.target.value)}
                        className="w-24 h-10 px-3 bg-white border border-zinc-300 rounded-lg font-mono text-sm font-semibold tabular-nums text-zinc-950 focus:outline-none focus:border-[#2563EB]"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-zinc-600">
                        To
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        value={batchEnd}
                        onChange={(e) => setBatchEnd(e.target.value)}
                        className="w-24 h-10 px-3 bg-white border border-zinc-300 rounded-lg font-mono text-sm font-semibold tabular-nums text-zinc-950 focus:outline-none focus:border-[#2563EB]"
                      />
                    </label>

                    <button
                      type="submit"
                      className="h-10 px-5 bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                    >
                      Load Batch
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={handleBatchLock}
                    className="h-10 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-100 hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Lock Grid
                  </button>
                </div>
              )}
            </div>

            {!batchAuth ? (
              <BatchAccessGate onUnlocked={handleBatchUnlocked} />
            ) : batchRolls.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {batchRolls.map((roll) => (
                  <StudentPhotoCard
                    key={roll}
                    rollNumber={roll}
                    erpSessionId={erpSession?.sessionId ?? null}
                    variant="grid"
                    onRequireErpLogin={() => setErpModalOpen(true)}
                    onSessionExpired={handleErpDisconnect}
                    onOpenLightbox={setLightboxRoll}
                    onSelectRoll={handleInspectFromGrid}
                  />
                ))}
              </div>
            ) : (
              <div className="py-12 text-center border border-dashed border-zinc-300 rounded-xl text-sm text-zinc-500">
                Enter a valid branch prefix and roll range above to load
                portraits.
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Quiet Minimal Footer */}
      <footer className="border-t border-zinc-300/70 bg-white/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-700">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-950">GIETU Snap</span>
            <span aria-hidden="true">·</span>
            <span>Bhai Tu Dal, Nikalna Hamara Kam Hai</span>
          </div>
          <a
            href={ERP_LOGIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0"
          >
            gietuerp.in
          </a>
        </div>
      </footer>

      {/* GIETU ERP Sign-In Modal */}
      <ErpLoginModal
        open={erpModalOpen}
        onClose={() => setErpModalOpen(false)}
        onAuthenticated={handleErpAuthenticated}
      />

      {/* Fullscreen Square Lightbox Modal */}
      <LightboxModal
        rollNumber={lightboxRoll}
        erpSessionId={erpSession?.sessionId ?? null}
        onRequireErpLogin={() => setErpModalOpen(true)}
        onClose={() => setLightboxRoll(null)}
        onNavigate={(nextRoll) => {
          setLightboxRoll(nextRoll);
          commitRollLookup(nextRoll);
        }}
      />
    </div>
  );
}
