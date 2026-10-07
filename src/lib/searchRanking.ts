import type { SearchHit } from '../db/types'
import { findTermRanges } from './searchTerms'
import type { SearchPlan } from './searchPlan'

/** Rank positions, rather than independently calibrated corpus BM25 scores. */
export function fuseSearchResults(
  lists: { hits: SearchHit[]; weight: number }[], plan: SearchPlan, limit: number,
): SearchHit[] {
  const candidates = new Map<string, { hit: SearchHit; score: number }>()
  for (const { hits, weight } of lists) {
    hits.forEach((hit, i) => {
      const key = `${hit.collection}:${hit.id}`
      const entry = candidates.get(key) ?? { hit, score: 0 }
      entry.score += weight / (60 + i + 1)
      candidates.set(key, entry)
    })
  }
  const terms = [...plan.phrases, ...plan.terms]
  const ranked = [...candidates.values()].map(({ hit, score }) => {
    const matches = terms.map(t => findTermRanges(hit.text, [t]))
    const coverage = matches.filter(m => m.length).length / Math.max(terms.length, 1)
    const positions = matches.flatMap((ranges, term) => ranges.map(range => ({ ...range, term })))
      .sort((a, b) => a.start - b.start)
    // Small bounded bonuses preserve the retrieval evidence (including stemming).
    const close = positions.some((p, i) => positions.slice(i + 1).some(next =>
      next.term !== p.term && next.start - p.end < 80))
    const phrase = plan.terms.length > 1 && findTermRanges(hit.text, [plan.terms.join(' ')]).length > 0
    return { hit, score: score + coverage * 0.025 + (close ? 0.005 : 0) + (phrase ? 0.02 : 0) }
  })
  ranked.sort((a, b) => b.score - a.score || a.hit.collection.localeCompare(b.hit.collection) || a.hit.id - b.hit.id)
  return ranked.slice(0, limit).map(({ hit, score }) => ({ ...hit, rank: -score }))
}
