import type { FontSize, LineHeight, ReaderTheme } from '../types'
import { IconSettings } from './Icons'
import { Sheet } from './Sheet'

interface Props {
  open: boolean
  onClose: () => void
  theme: ReaderTheme
  fontSize: FontSize
  lineHeight: LineHeight
  onThemeChange: (theme: ReaderTheme) => void
  onFontSizeChange: (size: FontSize) => void
  onLineHeightChange: (height: LineHeight) => void
  onOpenAppSettings?: () => void
}

const THEMES: { id: ReaderTheme; label: string; bg: string; fg: string }[] = [
  { id: 'light', label: 'Paper', bg: '#f7f6f2', fg: '#1a1d1a' },
  { id: 'sepia', label: 'Dusk', bg: '#f2e9d8', fg: '#33281a' },
  { id: 'dark', label: 'Night', bg: '#141715', fg: '#eceee9' },
]

const SIZES: { id: FontSize; label: string }[] = [
  { id: 'sm', label: 'S' },
  { id: 'md', label: 'M' },
  { id: 'lg', label: 'L' },
  { id: 'xl', label: 'XL' },
]

const SPACING: { id: LineHeight; label: string }[] = [
  { id: 'normal', label: 'Tight' },
  { id: 'relaxed', label: 'Normal' },
  { id: 'loose', label: 'Loose' },
]

export function ReaderSettingsPanel({
  open,
  onClose,
  theme,
  fontSize,
  lineHeight,
  onThemeChange,
  onFontSizeChange,
  onLineHeightChange,
  onOpenAppSettings,
}: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Reading">
      <div className="p-4">
        {/* Live sample — you see the change before you close the panel. */}
        <div className="mb-5 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
          <p className="cite mb-1.5">GC 678.2</p>
          <p className="reader-text line-clamp-3">
            And the years of eternity, as they roll, will bring richer and still more
            glorious revelations of God and of Christ.
          </p>
        </div>

        <Group label="Theme">
          {THEMES.map((option) => {
            const active = theme === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onThemeChange(option.id)}
                aria-pressed={active}
                className="flex flex-1 flex-col items-center gap-1.5 rounded-[var(--r-sm)] border px-2 py-2.5 transition-colors"
                style={{
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                <span
                  aria-hidden
                  className="grid h-7 w-7 place-items-center rounded-full border border-[var(--border-strong)] font-serif text-[13px]"
                  style={{ background: option.bg, color: option.fg }}
                >
                  Aa
                </span>
                <span
                  className="text-[var(--t-tiny)] font-medium"
                  style={{ color: active ? 'var(--accent)' : 'var(--text-2)' }}
                >
                  {option.label}
                </span>
              </button>
            )
          })}
        </Group>

        <Group label="Text size">
          {SIZES.map((option) => (
            <Segment
              key={option.id}
              label={option.label}
              active={fontSize === option.id}
              onClick={() => onFontSizeChange(option.id)}
            />
          ))}
        </Group>

        <Group label="Line spacing">
          {SPACING.map((option) => (
            <Segment
              key={option.id}
              label={option.label}
              active={lineHeight === option.id}
              onClick={() => onLineHeightChange(option.id)}
            />
          ))}
        </Group>

        {onOpenAppSettings && (
          <button
            type="button"
            onClick={onOpenAppSettings}
            className="mt-1 flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-3 py-2.5 text-left text-[var(--t-base)] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)]"
          >
            <IconSettings className="h-4 w-4" />
            Storage and your notes
          </button>
        )}
      </div>
    </Sheet>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <p className="cite mb-2" style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}>
        {label.toUpperCase()}
      </p>
      <div className="flex gap-1.5">{children}</div>
    </section>
  )
}

function Segment({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex-1 rounded-[var(--r-sm)] border py-2 text-[var(--t-small)] font-medium transition-colors"
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--accent-contrast)' : 'var(--text-2)',
      }}
    >
      {label}
    </button>
  )
}
