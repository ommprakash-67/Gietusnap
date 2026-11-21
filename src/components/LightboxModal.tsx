import { useEffect, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  KeyRound,
  RefreshCw,
  UserRound,
  X,
} from 'lucide-react';
import {
  buildProxyPhotoUrl,
  buildStudentImageUrl,
  parseRollNumber,
  stepRollNumber,
} from '../utils/rollNumber';

interface LightboxModalProps {
  rollNumber: string | null;
  erpSessionId: string | null;
  onRequireErpLogin: () => void;
  onClose: () => void;
  onNavigate: (nextRoll: string) => void;
}

export function LightboxModal({
  rollNumber,
  erpSessionId,
  onRequireErpLogin,
  onClose,
  onNavigate,
}: LightboxModalProps) {
  const [imgError, setImgError] = useState(false);
  const [retrySeed, setRetrySeed] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setImgError(false);
    setRetrySeed(0);
  }, [rollNumber, erpSessionId]);

  useEffect(() => {
    if (!rollNumber) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft') {
        const prev = stepRollNumber(rollNumber, -1);
        if (prev) onNavigate(prev);
      } else if (event.key === 'ArrowRight') {
        const next = stepRollNumber(rollNumber, 1);
        if (next) onNavigate(next);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rollNumber, onClose, onNavigate]);

  if (!rollNumber) return null;

  const parsed = parseRollNumber(rollNumber);
  const directUrl = buildStudentImageUrl(rollNumber, 0);
  const proxyUrl = erpSessionId
    ? buildProxyPhotoUrl(rollNumber, erpSessionId, retrySeed)
    : null;
  const prevRoll = stepRollNumber(rollNumber, -1);
  const nextRoll = stepRollNumber(rollNumber, 1);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(directUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/92 backdrop-blur-xs p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Fullscreen portrait for ${parsed.raw}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Row: Roll Number + Close */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-mono text-2xl font-bold tracking-tight text-white tabular-nums">
              {parsed.raw}
            </h2>
            {parsed.batchYear && parsed.branch && parsed.serial ? (
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400 tabular-nums">
                <span>Batch {parsed.batchYear}</span>
                <span aria-hidden="true">·</span>
                <span>{parsed.branch}</span>
                <span aria-hidden="true">·</span>
                <span>No. {parsed.serial}</span>
              </div>
            ) : (
              <p className="mt-0.5 text-xs text-zinc-400">
                GIETU Student Portrait
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close fullscreen view"
            className="w-10 h-10 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Square Photo Viewport */}
        <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800">
          {!proxyUrl ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 mb-3">
                <KeyRound className="w-7 h-7" strokeWidth={1.6} />
              </div>
              <p className="text-sm font-medium text-zinc-100">
                Connect GIETU ERP to view portraits
              </p>
              <p className="mt-1 text-xs text-zinc-400 max-w-xs">
                Sign in once with your GIETU ERP credentials to load square
                portraits directly inside this viewer.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequireErpLogin();
                }}
                className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-lg hover:bg-[#1D4ED8] transition-colors cursor-pointer"
              >
                Connect GIETU ERP
              </button>
            </div>
          ) : imgError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
                <UserRound className="w-8 h-8" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-zinc-200">
                Photo not found for {parsed.raw}
              </p>
              <p className="mt-1 text-xs text-zinc-400 max-w-xs">
                Verify the roll number or retry fetching from GIETU ERP.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setImgError(false);
                    setRetrySeed((prev) => prev + 1);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-950 bg-white rounded-lg hover:bg-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
                <a
                  href={directUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#2563EB] rounded-lg hover:bg-[#1D4ED8] transition-colors whitespace-nowrap shrink-0"
                >
                  Open ERP
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <img
              key={`${parsed.raw}-${erpSessionId}-${retrySeed}`}
              src={proxyUrl}
              alt={`Fullscreen student portrait for ${parsed.raw}`}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-contain bg-zinc-950"
            />
          )}
        </div>

        {/* Bottom Navigation & Utility Bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!prevRoll}
              onClick={() => prevRoll && onNavigate(prevRoll)}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-zinc-200 bg-zinc-800 rounded-lg hover:bg-zinc-700 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              {prevRoll ?? 'Prev'}
            </button>
            <button
              type="button"
              disabled={!nextRoll}
              onClick={() => nextRoll && onNavigate(nextRoll)}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-zinc-200 bg-zinc-800 rounded-lg hover:bg-zinc-700 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {nextRoll ?? 'Next'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-200 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy URL
                </>
              )}
            </button>
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#2563EB] rounded-lg hover:bg-[#1D4ED8] transition-colors whitespace-nowrap shrink-0"
            >
              Open ERP
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
