import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Maximize2,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import {
  buildProxyPhotoUrl,
  buildStudentImageUrl,
  parseRollNumber,
} from '../utils/rollNumber';

export interface StudentPhotoCardProps {
  rollNumber: string;
  erpSessionId: string | null;
  variant?: 'spotlight' | 'grid';
  onRequireErpLogin: () => void;
  onSessionExpired?: () => void;
  onOpenLightbox?: (rollNumber: string) => void;
  onSelectRoll?: (rollNumber: string) => void;
}

type LoadStatus = 'loading' | 'loaded' | 'error';

export function StudentPhotoCard({
  rollNumber,
  erpSessionId,
  variant = 'spotlight',
  onRequireErpLogin,
  onSessionExpired,
  onOpenLightbox,
  onSelectRoll,
}: StudentPhotoCardProps) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [retrySeed, setRetrySeed] = useState(0);
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>('cover');
  const [copied, setCopied] = useState(false);

  const parsed = parseRollNumber(rollNumber);
  const directUrl = buildStudentImageUrl(rollNumber, 0);
  const proxyUrl = erpSessionId
    ? buildProxyPhotoUrl(rollNumber, erpSessionId, retrySeed)
    : null;

  useEffect(() => {
    setStatus('loading');
    setRetrySeed(0);
  }, [rollNumber, erpSessionId]);

  const handleRetry = () => {
    setStatus('loading');
    setRetrySeed((prev) => prev + 1);
  };

  const handleImageError = async () => {
    setStatus('error');
    if (!erpSessionId || !onSessionExpired) return;
    try {
      const res = await fetch(
        `/api/erp/status?sid=${encodeURIComponent(erpSessionId)}`
      );
      const data = await res.json();
      if (!data.authenticated) {
        onSessionExpired();
      }
    } catch {
      // Ignore status check errors
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(directUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable in restricted context
    }
  };

  const isSpotlight = variant === 'spotlight';

  return (
    <article
      className={`bg-white/95 backdrop-blur-md border border-zinc-200/90 flex flex-col ${
        isSpotlight
          ? 'rounded-2xl p-6 gap-4 h-full'
          : 'rounded-xl p-4 gap-3 transition-colors duration-150 hover:border-zinc-400'
      }`}
    >
      {/* TOP: Roll Number Header (Strictly above the square photo) */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h2
              className={`font-mono font-bold tracking-tight text-zinc-950 tabular-nums truncate ${
                isSpotlight ? 'text-2xl sm:text-3xl' : 'text-lg'
              }`}
            >
              {parsed.raw}
            </h2>
          </div>
          {parsed.batchYear && parsed.branch && parsed.serial ? (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 tabular-nums">
              <span>Batch {parsed.batchYear}</span>
              <span aria-hidden="true">·</span>
              <span>{parsed.branch}</span>
              <span aria-hidden="true">·</span>
              <span>No. {parsed.serial}</span>
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-zinc-500">
              GIETU Student Roll Number
            </div>
          )}
        </div>

        {isSpotlight ? (
          <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setFitMode('cover')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] ${
                fitMode === 'cover'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Fill
            </button>
            <button
              type="button"
              onClick={() => setFitMode('contain')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] ${
                fitMode === 'contain'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Fit
            </button>
          </div>
        ) : (
          onSelectRoll && (
            <button
              type="button"
              onClick={() => onSelectRoll(parsed.raw)}
              className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              Inspect
            </button>
          )
        )}
      </div>

      {/* BELOW: Strictly Square 1:1 Student Photo */}
      <div
        className={`relative w-full aspect-square overflow-hidden bg-zinc-100 border border-zinc-200/80 ${
          isSpotlight ? 'rounded-xl' : 'rounded-lg'
        }`}
      >
        {!proxyUrl ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-zinc-50">
            <div className="w-14 h-14 rounded-full bg-zinc-200/80 flex items-center justify-center text-zinc-700 mb-3">
              <KeyRound className="w-6 h-6" strokeWidth={1.7} />
            </div>
            <p className="font-mono text-sm font-bold text-zinc-950 tabular-nums">
              {parsed.raw}
            </p>
            <p className="mt-1.5 text-xs text-zinc-600 max-w-[260px] leading-relaxed">
              {isSpotlight
                ? 'GIETU ERP blocks direct cross-site image cookies. Connect your GIETU ERP account once to display photos instantly.'
                : 'Connect GIETU ERP to load this photo.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={onRequireErpLogin}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-lg hover:bg-[#1D4ED8] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
              >
                Connect GIETU ERP
              </button>
              {isSpotlight && (
                <a
                  href={directUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-800 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-100 transition-colors whitespace-nowrap shrink-0"
                >
                  Open in ERP
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        ) : (
          <>
            {status === 'loading' && (
              <div
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-100 text-zinc-500"
                aria-live="polite"
              >
                <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
                <span className="text-xs font-medium">Loading photo…</span>
              </div>
            )}

            {status === 'error' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center bg-zinc-50">
                <div className="w-14 h-14 rounded-full bg-zinc-200/80 flex items-center justify-center text-zinc-500 mb-3">
                  <UserRound className="w-7 h-7" strokeWidth={1.6} />
                </div>
                <p className="font-mono text-sm font-semibold text-zinc-900 tabular-nums">
                  {parsed.raw}
                </p>
                <p className="mt-1 text-xs text-zinc-500 max-w-[230px] leading-relaxed">
                  {isSpotlight
                    ? 'No portrait found for this roll number on GIETU ERP.'
                    : 'Photo not found.'}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-900 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                  <a
                    href={directUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    Open ERP
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenLightbox?.(parsed.raw)}
                className="group relative block w-full h-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#2563EB]"
                aria-label={`Open fullscreen photo for ${parsed.raw}`}
              >
                <img
                  key={`${parsed.raw}-${erpSessionId}-${retrySeed}`}
                  src={proxyUrl}
                  alt={`Student portrait for roll number ${parsed.raw}`}
                  referrerPolicy="no-referrer"
                  loading={isSpotlight ? 'eager' : 'lazy'}
                  onLoad={() => setStatus('loaded')}
                  onError={handleImageError}
                  className={`w-full h-full transition-transform duration-200 ease-out group-hover:scale-[1.02] ${
                    fitMode === 'cover'
                      ? 'object-cover object-top'
                      : 'object-contain bg-zinc-100'
                  } ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
                />
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer Actions */}
      {isSpotlight ? (
        <div className="pt-3 border-t border-zinc-200/80 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenLightbox?.(parsed.raw)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 bg-zinc-100 rounded-lg hover:bg-zinc-200/80 hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Fullscreen
            </button>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 bg-zinc-100 rounded-lg hover:bg-zinc-200/80 hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy URL
                </>
              )}
            </button>
          </div>

          <a
            href={directUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
          >
            Original ERP
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      ) : (
        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2 text-xs text-zinc-500">
          <button
            type="button"
            onClick={() => onOpenLightbox?.(parsed.raw)}
            className="hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Expand
          </button>
          <a
            href={directUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0"
          >
            ERP Link
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </article>
  );
}
