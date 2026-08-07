import { highlightColor } from '../lib/highlightText'

interface Props {
  onHighlight: (color: string) => void
  onBookmark: () => void
  onShare: () => void
  onDismiss: () => void
}

const colors = ['amber', 'yellow', 'green', 'blue']

export function SelectionToolbar({ onHighlight, onBookmark, onShare, onDismiss }: Props) {
  return (
    <div className="fixed inset-x-0 bottom-20 z-[55] flex justify-center px-4">
      <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-lg">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Highlight ${c}`}
            onClick={() => onHighlight(c)}
            className="h-7 w-7 rounded-full border border-[var(--border)]"
            style={{ backgroundColor: highlightColor(c) }}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-[var(--border)]" />
        <button type="button" onClick={onBookmark} className="px-2 py-1 text-xs text-[var(--text-2)]">
          Save
        </button>
        <button type="button" onClick={onShare} className="px-2 py-1 text-xs text-[var(--text-2)]">
          Share
        </button>
        <button type="button" onClick={onDismiss} className="px-2 py-1 text-xs text-[var(--text-3)]">
          ✕
        </button>
      </div>
    </div>
  )
}
