import type { ReactNode } from 'react'
import type { Highlight } from '../types'

export function renderHighlightedText(
  text: string,
  highlights: Highlight[],
): ReactNode {
  const ranges = highlights
    .filter((h) => h.startOffset >= 0 && h.endOffset > h.startOffset && h.endOffset <= text.length)
    .sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset)

  if (ranges.length === 0) return text

  const parts: ReactNode[] = []
  let cursor = 0

  for (const h of ranges) {
    const start = Math.max(h.startOffset, cursor)
    if (start >= h.endOffset) continue

    if (start > cursor) {
      parts.push(text.slice(cursor, start))
    }
    parts.push(
      <mark
        key={h.id}
        className={`${highlightClassName(h.color)} rounded px-0.5 not-italic`}
        title={h.note || undefined}
      >
        {text.slice(start, h.endOffset)}
      </mark>,
    )
    cursor = h.endOffset
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor))
  }

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
