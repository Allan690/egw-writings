import type { ReactNode } from 'react'
import type { TermRange } from './searchTerms'
import type { Highlight } from '../types'

/**
 * Renders paragraph text with saved highlights and, when a reader arrived
 * from a search, the matched terms.
 *
 * Saved highlights win every overlap: a term match is transient context,
 * a highlight is something the reader deliberately made. Term ranges are
 * clipped around highlights rather than nested, so no <mark> ever contains
 * another one.
 */
export function renderHighlightedText(
  text: string,
  highlights: Highlight[],
  terms: TermRange[] = [],
): ReactNode {
  const ranges = highlights
    .filter((h) => h.startOffset >= 0 && h.endOffset > h.startOffset && h.endOffset <= text.length)
    .sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset)

  if (ranges.length === 0 && terms.length === 0) return text

  // Flatten highlights first so we know which regions are already spoken for.
  const claimed: { start: number; end: number }[] = []
  let cursorEnd = 0
  for (const h of ranges) {
    const start = Math.max(h.startOffset, cursorEnd)
    if (start >= h.endOffset) continue
    claimed.push({ start, end: h.endOffset })
    cursorEnd = h.endOffset
  }

  type Segment = { start: number; end: number; node: (key: string) => ReactNode }
  const segments: Segment[] = []

  ranges.forEach((h, i) => {
    const claim = claimed[i]
    if (!claim) return
    segments.push({
      start: claim.start,
      end: claim.end,
      node: (key) => (
        <mark
          key={key}
          className={`${highlightClassName(h.color)} rounded px-0.5 not-italic`}
          title={h.note || undefined}
        >
          {text.slice(claim.start, claim.end)}
        </mark>
      ),
    })
  })

  for (const term of terms) {
    if (term.start < 0 || term.end > text.length || term.end <= term.start) continue
    // Subtract every claimed highlight region from this term match.
    let pieces: { start: number; end: number }[] = [{ start: term.start, end: term.end }]
    for (const claim of claimed) {
      const next: { start: number; end: number }[] = []
      for (const piece of pieces) {
        if (claim.end <= piece.start || claim.start >= piece.end) {
          next.push(piece)
          continue
        }
        if (claim.start > piece.start) next.push({ start: piece.start, end: claim.start })
        if (claim.end < piece.end) next.push({ start: claim.end, end: piece.end })
      }
      pieces = next
    }
    for (const piece of pieces) {
      segments.push({
        start: piece.start,
        end: piece.end,
        node: (key) => (
          <mark key={key} className="reader-term" data-term>
            {text.slice(piece.start, piece.end)}
          </mark>
        ),
      })
    }
  }

  segments.sort((a, b) => a.start - b.start)

  const parts: ReactNode[] = []
  let cursor = 0
  segments.forEach((segment, i) => {
    if (segment.start < cursor) return
    if (segment.start > cursor) parts.push(text.slice(cursor, segment.start))
    parts.push(segment.node(`seg-${i}`))
    cursor = segment.end
  })

  if (cursor < text.length) parts.push(text.slice(cursor))

  return parts
}

export function highlightClassName(color: string): string {
  switch (color) {
    case 'amber':
      return 'reader-highlight-amber'
    case 'yellow':
      return 'reader-highlight-yellow'
    case 'green':
      return 'reader-highlight-green'
    case 'blue':
      return 'reader-highlight-blue'
    case 'pink':
      return 'reader-highlight-pink'
    default:
      return 'reader-highlight-amber'
  }
}

export function highlightsOverlapSelection(
  highlights: Highlight[],
  startOffset: number,
  endOffset: number,
): Highlight[] {
  return highlights.filter((h) => h.startOffset < endOffset && startOffset < h.endOffset)
}

export function getSelectionOffsets(
  container: HTMLElement,
): { text: string; startOffset: number; endOffset: number } | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  const text = selection.toString().trim()
  if (text.length < 2) return null
  if (!container.contains(range.commonAncestorContainer)) return null

  const preRange = document.createRange()
  preRange.selectNodeContents(container)
  preRange.setEnd(range.startContainer, range.startOffset)
  const startOffset = preRange.toString().length
  const endOffset = startOffset + range.toString().length

  return { text, startOffset, endOffset }
}
