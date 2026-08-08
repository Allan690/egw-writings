const DEFAULT_CONTEXT_CHARS = 120

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Splits a raw query into literal terms, treating "quoted runs" as one term. */
function queryTerms(query: string): string[] {
  const terms: string[] = []
  const phraseRe = /"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = phraseRe.exec(query)) !== null) terms.push(m[1]!.trim())

  const rest = query.replace(phraseRe, ' ')
  for (const raw of rest.split(/\s+/)) {
    const t = raw.replace(/[^\w'’-]/g, '')
    if (t) terms.push(t)
  }
  return terms.filter(Boolean)
}

/**
 * Builds a highlighted excerpt around the first query match.
 *
 * Replaces FTS5's snippet(), which returns an empty string — silently, with no
 * error — against a contentless index. Highlighting and escaping happen in one
 * pass so the inserted tags are never themselves escaped.
 */
export function makeSnippet(
  text: string,
  query: string,
  opts: { tag?: string; context?: number } = {},
): string {
  const tag = opts.tag ?? 'mark'
  const context = opts.context ?? DEFAULT_CONTEXT_CHARS
  const terms = queryTerms(query)

  if (terms.length === 0) {
    const head = text.slice(0, context * 2)
    return escapeHtml(head) + (text.length > head.length ? '…' : '')
  }

  const pattern = new RegExp(terms.map(escapeRegExp).join('|'), 'gi')
  const first = pattern.exec(text)
  pattern.lastIndex = 0

  // Window the text around the first match, snapping to whitespace.
  let start = 0
  let end = text.length
  if (first) {
    start = Math.max(0, first.index - context)
    end = Math.min(text.length, first.index + first[0].length + context)
    if (start > 0) {
      const space = text.indexOf(' ', start)
      if (space !== -1 && space < first.index) start = space + 1
    }
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end)
      if (space !== -1 && space > first.index + first[0].length) end = space
    }
  } else {
    end = Math.min(text.length, context * 2)
  }

  const window = text.slice(start, end)

  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(window)) !== null) {
    out += escapeHtml(window.slice(last, m.index))
    out += `<${tag}>${escapeHtml(m[0])}</${tag}>`
    last = m.index + m[0].length
    if (m[0].length === 0) pattern.lastIndex += 1
  }
  out += escapeHtml(window.slice(last))

  return `${start > 0 ? '…' : ''}${out}${end < text.length ? '…' : ''}`
}
