import type { FontSize, LineHeight, ReaderTheme } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  theme: ReaderTheme
  fontSize: FontSize
  lineHeight: LineHeight
  onThemeChange: (theme: ReaderTheme) => void
  onFontSizeChange: (size: FontSize) => void
  onLineHeightChange: (height: LineHeight) => void
}

export function ReaderSettingsPanel({
  open,
  onClose,
  theme,
  fontSize,
  lineHeight,
  onThemeChange,
  onFontSizeChange,
  onLineHeightChange,
}: Props) {
  if (!open) return null

  const row = <T extends string>(
    label: string,
    options: { id: T; label: string }[],
    value: T,
    onChange: (v: T) => void,
  ) => (
    <section className="mb-5">
      <p className="mb-2 text-sm font-medium text-[var(--text-3)]">{label}</p>
      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${
              value === o.id
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--surface-2)] text-[var(--text-2)]'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-[var(--surface)] p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold">Reading settings</h2>
          <button type="button" onClick={onClose} className="text-sm text-[var(--text-3)]">
            Done
          </button>
        </div>
        {row('Theme', [
          { id: 'light' as const, label: 'Light' },
          { id: 'sepia' as const, label: 'Sepia' },
          { id: 'dark' as const, label: 'Dark' },
        ], theme, onThemeChange)}
        {row('Size', [
          { id: 'sm' as const, label: 'S' },
          { id: 'md' as const, label: 'M' },
          { id: 'lg' as const, label: 'L' },
          { id: 'xl' as const, label: 'XL' },
        ], fontSize, onFontSizeChange)}
        {row('Spacing', [
          { id: 'normal' as const, label: 'Tight' },
          { id: 'relaxed' as const, label: 'Normal' },
          { id: 'loose' as const, label: 'Loose' },
        ], lineHeight, onLineHeightChange)}
      </div>
    </div>
  )
}
