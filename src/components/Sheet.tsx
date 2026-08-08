import { useEffect, useId, useRef, type ReactNode } from 'react'
import { IconClose } from './Icons'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  /** Hide the visible title but keep it for screen readers. */
  hideTitle?: boolean
  children: ReactNode
  footer?: ReactNode
  /** Bottom sheet on mobile, centred dialog above `sm`. */
  size?: 'md' | 'lg'
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal surface with the accessibility the previous hand-rolled overlays
 * lacked: focus trap, Escape to close, focus restored to the trigger, and
 * a real dialog role rather than a full-bleed <button> backdrop.
 */
export function Sheet({ open, onClose, title, hideTitle, children, footer, size = 'md' }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    restoreTo.current = document.activeElement as HTMLElement | null

    const panel = panelRef.current
    // Prefer a real control; fall back to the panel so focus never escapes.
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel)?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel) return

      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (nodes.length === 0) {
        e.preventDefault()
        return
      }
      const firstNode = nodes[0]!
      const lastNode = nodes[nodes.length - 1]!

      if (e.shiftKey && document.activeElement === firstNode) {
        e.preventDefault()
        lastNode.focus()
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault()
        firstNode.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = prevOverflow
      restoreTo.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div
        className="anim-fade absolute inset-0"
        style={{ background: 'var(--scrim)' }}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`anim-sheet relative flex max-h-[86dvh] w-full flex-col overflow-hidden rounded-t-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] sm:anim-pop sm:rounded-[var(--r-lg)] ${
          size === 'lg' ? 'sm:max-w-lg' : 'sm:max-w-md'
        }`}
        style={{
          boxShadow: 'var(--shadow-sheet)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2
            id={titleId}
            className={`font-serif text-[15px] font-semibold text-[var(--text)] ${
              hideTitle ? 'sr-only' : ''
            }`}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <IconClose />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {footer && (
          <div className="border-t border-[var(--border)] px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  )
}

/** Grabber shown at the top of mobile sheets — a touch affordance, not decoration. */
export function SheetGrabber() {
  return (
    <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
      <span className="h-1 w-9 rounded-full bg-[var(--border-strong)]" />
    </div>
  )
}
