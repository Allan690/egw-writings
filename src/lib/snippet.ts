import { findTermRanges, parseSearchTerms } from './searchTerms'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Choose a bounded excerpt with the most distinct meaningful query terms. */
export function makeSnippet(text: string, query: string,
  opts: { tag?: string; context?: number } = {}): string {
  const tag = opts.tag ?? 'mark'
  const context = Math.max(1, opts.context ?? 120)
  const terms = parseSearchTerms(query)
  const matches = terms.flatMap((term, index) =>
    findTermRanges(text, [term]).map(range => ({ ...range, term: index })))
  let start = 0
  let end = Math.min(text.length, context * 2)
  let bestCoverage = 0
  let bestCount = 0
  for (const match of matches) {
    const left = Math.max(0, match.start - context)
    const right = Math.min(text.length, match.end + context)
    const visible = matches.filter(m => m.start >= left && m.end <= right)
    const coverage = new Set(visible.map(m => m.term)).size
    if (coverage > bestCoverage || (coverage === bestCoverage && visible.length > bestCount)) {
      start = left
      end = right
      bestCoverage = coverage
      bestCount = visible.length
    }
  }
  // Snap outward to word boundaries without changing corpus text or offsets.
  if (start > 0) {
    const space = text.lastIndexOf(' ', start)
    if (space >= 0) start = space + 1
  }
  if (end < text.length) {
    const space = text.indexOf(' ', end)
    if (space >= 0) end = space
  }
  const window = text.slice(start, end)
  const ranges = findTermRanges(window, terms)
  let out = ''
  let last = 0
  for (const range of ranges) {
    out += escapeHtml(window.slice(last, range.start))
    out += `<${tag}>${escapeHtml(window.slice(range.start, range.end))}</${tag}>`
    last = range.end
  }
  out += escapeHtml(window.slice(last))
  return `${start > 0 ? '…' : ''}${out}${end < text.length ? '…' : ''}`
}
