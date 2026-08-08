import { highlightClassName } from '../lib/highlightText'
import { IconBookmark, IconClose, IconShare } from './Icons'

interface Props {
  onHighlight: (color: string) => void
  onRemoveHighlight?: () => void
  canRemoveHighlight?: boolean
  onBookmark: () => void
  onShare: () => void
  onDismiss: () => void
}

const COLORS: { id: string; label: string }[] = [
  { id: 'amber', label: 'Amber' },
  { id: 'yellow', label: 'Yellow' },
  { id: 'green', label: 'Green' },
  { id: 'blue', label: 'Blue' },
  { id: 'pink', label: 'Pink' },
]

export function SelectionToolbar({
  onHighlight,
  onRemoveHighlight,
  canRemoveHighlight,
  onBookmark,
  onShare,
  onDismiss,
}: Props) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[55] flex justify-center px-4"
      style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
      role="toolbar"
      aria-label="Selection actions"
    >
      <div
        className="anim-pop pointer-events-auto flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1.5"
        style={{ boxShadow: 'var(--shadow-pop)' }}
      >
        {COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            aria-label={`Highlight ${color.label.toLowerCase()}`}
            onClick={() => onHighlight(color.id)}
            className={`h-7 w-7 rounded-full border border-[var(--border-strong)] transition-transform hover:scale-110 ${highlightClassName(
              color.id,
            )}`}
          />
        ))}

        <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />

        {canRemoveHighlight && onRemoveHighlight && (
          <button
            type="button"
            onClick={onRemoveHighlight}
            className="rounded-full px-2.5 py-1.5 text-[var(--t-tiny)] font-medium transition-colors hover:bg-[var(--danger-soft)]"
            style={{ color: 'var(--danger)' }}
          >
            Remove
          </button>
        )}

        <button
          type="button"
          onClick={onBookmark}
          aria-label="Bookmark this passage"
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)]"
        >
          <IconBookmark className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onShare}
          aria-label="Share this passage"
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)]"
        >
          <IconShare />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-3)] transition-colors hover:bg-[var(--surface-2)]"
        >
          <IconClose />
        </button>
      </div>
    </div>
  )
}
