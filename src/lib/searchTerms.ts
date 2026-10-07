/**
 * Carries a search query into the reader.
 *
 * When you open a result, the chapter should show you *why* it matched —
 * not just scroll to a paragraph and leave you hunting. These helpers turn
 * an FTS5 query into plain terms and locate them in paragraph text.
 */

import { buildSearchPlan } from './searchPlan'

export function parseSearchTerms(query: string): string[] {
  const plan = buildSearchPlan(query)
  return [...new Set([...plan.phrases, ...plan.terms].map(t => t.toLowerCase()))]
    .sort((a, b) => b.length - a.length)
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
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term).replace(/['’]/g, "['’]")}`, 'giu')
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
