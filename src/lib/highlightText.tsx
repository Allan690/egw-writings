import type { ReactNode } from 'react'
import type { Highlight } from '../types'

export function renderHighlightedText(
  text: string,
  highlights: Highlight[],
): ReactNode {
  const ranges = highlights
    .filter((h) => h.startOffset >= 0 && h.endOffset > h.startOffset && h.endOffset <= text.length)
    .sort((a, b) => a.startOffset - b.startOffset)

  if (ranges.length === 0) return text

  const parts: ReactNode[] = []
  let cursor = 0

  for (const h of ranges) {
    if (h.startOffset > cursor) {
      parts.push(text.slice(cursor, h.startOffset))
    }
    parts.push(
      <mark
        key={h.id}
        className="rounded px-0.5 not-italic"
        style={{ backgroundColor: highlightColor(h.color) }}
        title={h.note || undefined}
      >
        {text.slice(h.startOffset, h.endOffset)}
      </mark>,
    )
    cursor = h.endOffset
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor))
  }

  return parts
}

export function highlightColor(color: string): string {
  switch (color) {
    case 'yellow':
      return '#fef08a'
    case 'green':
      return '#bbf7d0'
    case 'blue':
      return '#bfdbfe'
    case 'pink':
      return '#fbcfe8'
    default:
      return '#fde68a'
  }
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
