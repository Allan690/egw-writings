import { formatBytes } from '../lib/format'
import type { CorpusPhase } from '../hooks/useCorpusInit'

interface Props {
  phase: CorpusPhase
  received: number
  total: number | null
  firstRun: boolean
  error: string | null
  onRetry: () => void
}

const STAGES: { id: CorpusPhase; label: string }[] = [
  { id: 'downloading', label: 'Copying the writings to this device' },
  { id: 'opening', label: 'Building the search index' },
  { id: 'ready', label: 'Ready to read offline' },
]

const ORDER: CorpusPhase[] = ['checking', 'downloading', 'opening', 'ready']

export function SetupScreen({ phase, received, total, firstRun, error, onRetry }: Props) {
  const pct = total ? Math.min(100, (received / total) * 100) : null
  const stageIndex = ORDER.indexOf(phase)

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[var(--bg)] px-6">
      <div className="anim-rise w-full max-w-sm">
        <p className="cite mb-3" style={{ letterSpacing: '0.08em' }}>
          EGW WRITINGS
        </p>
        <h1 className="font-serif text-[var(--t-display)] font-semibold leading-tight text-[var(--text)]">
          {error
            ? 'The writings could not load'
            : firstRun
              ? 'Setting up your library'
              : 'Opening your library'}
        </h1>

        {error ? (
          <>
            <p className="mt-3 text-[var(--t-base)] leading-relaxed text-[var(--text-2)]">
              The download did not finish. Check your connection and try again — nothing you
              have saved is affected.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-3 text-left text-[var(--t-micro)] text-[var(--text-2)]">
              {error}
            </pre>
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 w-full rounded-[var(--r-sm)] bg-[var(--accent)] px-4 py-3 text-[var(--t-base)] font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-[var(--t-base)] leading-relaxed text-[var(--text-2)]">
              {firstRun
                ? 'This downloads once. Afterwards every book and every search runs on your device — no network, no account.'
                : 'Reading from the copy already on this device.'}
            </p>

            <div
              className="mt-7 h-[3px] w-full overflow-hidden rounded-full"
              style={{ background: 'var(--surface-3)' }}
              role="progressbar"
              aria-label="Setup progress"
              aria-valuenow={pct != null ? Math.round(pct) : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={pct == null ? 'h-full w-1/3 animate-pulse' : 'h-full'}
                style={{
                  width: pct != null ? `${pct}%` : undefined,
                  background: 'var(--accent)',
                  transition: 'width var(--dur-3) var(--ease)',
                }}
              />
            </div>

            <div className="mt-2.5 flex items-baseline justify-between">
              <span
                className="font-mono text-[var(--t-micro)] text-[var(--text-3)]"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {phase === 'downloading' && received > 0
                  ? `${formatBytes(received)}${total ? ` of ${formatBytes(total)}` : ''}`
                  : phase === 'opening'
                    ? 'Indexing'
                    : 'Starting'}
              </span>
              {pct != null && (
                <span
                  className="font-mono text-[var(--t-micro)] text-[var(--text-3)]"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {Math.round(pct)}%
                </span>
              )}
            </div>

            <ul className="mt-7 space-y-2.5">
              {STAGES.map((stage) => {
                const index = ORDER.indexOf(stage.id)
                const done = stageIndex > index
                const active = stageIndex === index
                return (
                  <li key={stage.id} className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] font-bold"
                      style={{
                        borderColor: done || active ? 'var(--accent)' : 'var(--border-strong)',
                        background: done ? 'var(--accent)' : 'transparent',
                        color: 'var(--accent-contrast)',
                      }}
                    >
                      {done ? '✓' : ''}
                    </span>
                    <span
                      className="text-[var(--t-small)]"
                      style={{ color: done || active ? 'var(--text)' : 'var(--text-3)' }}
                    >
                      {stage.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
