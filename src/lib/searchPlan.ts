export interface SearchLane { query: string; weight: number }
export interface SearchPlan {
  normalized: string
  terms: string[]
  phrases: string[]
  lanes: SearchLane[]
}

export function normalizeQuery(input: string): string {
  return input.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, '-').replace(/\s+/g, ' ').trim()
}

const STOP = new Set('the a an of to in is it and or be as at by for on that this with was are from what does did do say says about regarding according how can could would should'.split(' '))
const quote = (text: string) => `"${text.replace(/"/g, '""')}"`

export function buildSearchPlan(input: string): SearchPlan {
  const normalized = normalizeQuery(input)
  const phrases = [...normalized.matchAll(/"([^"]+)"/g)].map(m => m[1]!.trim()).filter(Boolean)
  const rest = normalized.replace(/"[^"]*"/g, ' ')
  const advanced = /\b(?:AND|OR|NOT|NEAR)\b/.test(rest)
  const words = rest.match(/[\p{L}\p{N}]+(?:'\p{L}+)*/gu) ?? []
  const terms = [...new Set(words.map(w => w.toLowerCase()).filter(w =>
    !STOP.has(w) && !['not', 'near'].includes(w)))]
  const plan: SearchPlan = { normalized, terms, phrases, lanes: [] }
  if (!normalized) return plan
  if (advanced) {
    // Explicit FTS5 expressions stay strict; never widen OR/NOT or NEAR.
    // MATCH is bound as a SQL parameter by CorpusDb, not interpolated SQL.
    plan.lanes = [{ query: normalized, weight: 1 }]
    return plan
  }
  const content = rest.replace(/\b(?:Ellen\s+(?:G\.?\s+)?White|where\s+does\s+she|teach(?:es)?)\b/gi, ' ')
  plan.terms = [...new Set((content.match(/[\p{L}\p{N}]+(?:'\p{L}+)*/gu) ?? [])
    .map(w => w.toLowerCase()).filter(w => !STOP.has(w)))]
  // Stopword-only searches are still valid, e.g. "to be" without quotes.
  if (!plan.terms.length && !phrases.length) plan.terms = words.map(w => w.toLowerCase())
  const tokens = plan.terms.map(t => `${quote(t)}*`)
  if (phrases.length) {
    plan.lanes = [{ query: [...phrases.map(quote), ...tokens].join(' AND '), weight: 4 }]
    return plan
  }
  if (!tokens.length) return plan
  const lanes: SearchLane[] = [{ query: tokens.join(' AND '), weight: 2 }]
  if (tokens.length > 1) {
    lanes.unshift({ query: quote(plan.terms.join(' ')), weight: 4 })
    lanes.push({ query: `NEAR(${tokens.join(' ')}, 12)`, weight: 2 })
    lanes.push({ query: tokens.join(' OR '), weight: 1 })
  }
  plan.lanes = lanes
  return plan
}
