import type { BookCollection } from '../lib/corpusConstants'

interface Props {
  collection: BookCollection
  author?: string
  size?: 'sm' | 'md'
}

export function CorpusBadge({ collection, author, size = 'sm' }: Props) {
  const isPioneer = collection === 'pioneer'
  const pad = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full font-semibold uppercase tracking-wide ${pad} ${
        isPioneer
          ? 'bg-slate-200 text-slate-700'
          : 'bg-[var(--accent-soft)] text-[var(--accent)]'
      }`}
      title={isPioneer ? author : 'Ellen G. White'}
    >
      {isPioneer ? 'Pioneer' : 'E. G. White'}
    </span>
  )
}

export function PioneerDisclaimer({ author }: { author?: string }) {
  return (
    <div
      className="mb-6 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-800"
      role="note"
    >
      <p className="font-semibold">Adventist pioneer writing</p>
      <p className="mt-1 leading-relaxed text-slate-700">
        This text is <strong>not</strong> by Ellen G. White.
        {author ? ` Author: ${author}.` : ' It comes from the Adventist Pioneer Library.'}
      </p>
    </div>
  )
}

export function PioneerDownloadBanner({
  progress,
  status,
}: {
  progress: number | null
  status: string
}) {
  if (status === 'ready' || status === 'unavailable' || status === 'idle') return null

  return (
    <div className="mb-4 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">
            {status === 'checking' ? 'Checking pioneer library…' : 'Downloading pioneer writings…'}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            Ellen G. White books are ready. Pioneer works load in the background — not written by
            Ellen G. White.
          </p>
        </div>
        {progress != null && (
          <span className="shrink-0 text-sm font-medium tabular-nums text-slate-700">
            {progress}%
          </span>
        )}
      </div>
      {progress != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-500 transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}
