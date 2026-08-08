import type { BookCollection } from '../lib/corpusConstants'
import { formatBytes } from '../lib/format'

interface Props {
  collection: BookCollection
  author?: string
  size?: 'sm' | 'md'
}

/**
 * Attribution is the one thing this app must never get wrong: pioneer works
 * are not Ellen G. White's.
 *
 * The badge names the author rather than labelling the shelf. "Pioneer" only
 * told you which collection a text came from, so it needed a separate notice
 * underneath to explain that it was not Ellen White's — a byline says it
 * outright, everywhere the work appears. Colours come from --pioneer-* tokens
 * so the distinction survives sepia and dark, which hardcoded slate did not.
 */
export function CorpusBadge({ collection, author, size = 'sm' }: Props) {
  const isPioneer = collection === 'pioneer'
  const pad = size === 'md' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[10px]'
  const name = isPioneer ? author?.trim() || 'Adventist pioneer' : 'Ellen G. White'

  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-[3px] font-semibold uppercase tracking-[0.06em] ${pad}`}
      style={{
        background: isPioneer ? 'var(--pioneer-bg)' : 'var(--accent-soft)',
        color: isPioneer ? 'var(--pioneer-text)' : 'var(--accent)',
        border: `1px solid ${isPioneer ? 'var(--pioneer-border)' : 'transparent'}`,
      }}
      title={isPioneer ? `${name} — not Ellen G. White` : 'Ellen G. White'}
    >
      {name}
    </span>
  )
}

export function PioneerDownloadBanner({
  progress,
  status,
  received,
  total,
}: {
  progress: number | null
  status: string
  received?: number
  total?: number | null
}) {
  if (status === 'ready' || status === 'unavailable' || status === 'idle') return null

  const failed = status === 'error'

  return (
    <div
      className="mt-4 rounded-[var(--r-md)] px-4 py-3"
      style={{
        background: 'var(--pioneer-bg)',
        border: '1px solid var(--pioneer-border)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[var(--t-small)] font-semibold"
            style={{ color: 'var(--pioneer-strong)' }}
          >
            {failed
              ? 'The pioneer library did not finish downloading'
              : status === 'checking'
                ? 'Looking for the pioneer library…'
                : 'Adding the pioneer library'}
          </p>
          <p
            className="mt-0.5 text-[var(--t-tiny)] leading-relaxed"
            style={{ color: 'var(--pioneer-text)' }}
          >
            {failed
              ? 'Ellen G. White’s writings are ready and unaffected. It will retry next time you open the app.'
              : 'Ellen G. White’s writings are ready to read now. These works are by other early Adventist writers.'}
          </p>
        </div>
        {progress != null && !failed && (
          <span
            className="shrink-0 font-mono text-[var(--t-small)] font-medium"
            style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--pioneer-strong)' }}
          >
            {progress}%
          </span>
        )}
      </div>

      {progress != null && !failed && (
        <>
          <div
            className="mt-2.5 h-[3px] overflow-hidden rounded-full"
            style={{ background: 'var(--pioneer-border)' }}
            role="progressbar"
            aria-label="Pioneer library download"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: 'var(--pioneer-strong)',
                transition: 'width var(--dur-3) var(--ease)',
              }}
            />
          </div>
          {received != null && total != null && (
            <p
              className="mt-1.5 font-mono text-[var(--t-micro)]"
              style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--pioneer-text)' }}
            >
              {formatBytes(received)} of {formatBytes(total)}
            </p>
          )}
        </>
      )}
    </div>
  )
}
