/**
 * Carries a search query into the reader.
 *
 * When you open a result, the chapter should show you *why* it matched —
 * not just scroll to a paragraph and leave you hunting. These helpers turn
 * an FTS5 query into plain terms and locate them in paragraph text.
 */

const FTS_OPERATORS = new Set(['and', 'or', 'not', 'near'])

/** Words too common to be worth marking up in a chapter of prose. */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'is', 'it', 'and', 'or', 'be', 'as',
  'at', 'by', 'for', 'on', 'that', 'this', 'with', 'was', 'are', 'from',
])

export function parseSearchTerms(query: string): string[] {
  const terms: string[] = []

  // Quoted phrases first, so "righteousness by faith" stays intact.
  const phrases = query.match(/"([^"]+)"/g) ?? []
  for (const raw of phrases) {
    const phrase = raw.slice(1, -1).trim()
    if (phrase.length >= 2) terms.push(phrase)
  }

  const rest = query.replace(/"[^"]*"/g, ' ')
  for (const token of rest.split(/[^\p{L}\p{N}'-]+/u)) {
    const word = token.trim()
    if (word.length < 3) continue
    const lower = word.toLowerCase()
    if (FTS_OPERATORS.has(lower) || STOP_WORDS.has(lower)) continue
    // Trailing * is an FTS prefix operator, not part of the word.
    terms.push(word.replace(/\*+$/, ''))
  }

  // Longest first so a phrase wins over its own constituent words.
  return Array.from(new Set(terms.map((t) => t.toLowerCase()))).sort(
    (a, b) => b.length - a.length,
  )
}

export interface TermRange {
  start: number
  end: number
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Non-overlapping match ranges for `terms` within `text`. Matches start at a
 * word boundary so "sin" does not light up "business", but allows suffixes so
 * a search for "righteous" still marks "righteousness".
 */
export function findTermRanges(text: string, terms: string[]): TermRange[] {
  if (terms.length === 0) return []

  const found: TermRange[] = []
  for (const term of terms) {
    if (!term) continue
    const pattern = new RegExp(`\\b${escapeRegExp(term)}`, 'giu')
    for (const match of text.matchAll(pattern)) {
      const start = match.index
      if (start === undefined) continue
      found.push({ start, end: start + match[0].length })
    }
  }

  found.sort((a, b) => a.start - b.start || b.end - a.end)

  const merged: TermRange[] = []
  for (const range of found) {
    const last = merged[merged.length - 1]
    if (last && range.start < last.end) {
      // Overlap: keep the longer match rather than nesting marks.
      if (range.end > last.end) last.end = range.end
      continue
    }
    merged.push({ ...range })
  }
  return merged
}
