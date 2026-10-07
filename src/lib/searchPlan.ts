export interface SearchLane { query: string; weight: number }
export interface SearchPlan {
  normalized: string
  terms: string[]
  phrases: string[]
  orderedPhrase: string
  lanes: SearchLane[]
}

export function normalizeQuery(input: string): string {
  return input.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, '-').replace(/\s+/g, ' ').trim()
}

const STOP = new Set('the a an of to in is it and or be as at by for on that this with was are from what does did do say says about regarding according how can could would should'.split(' '))
const quote = (text: string) => `"${text.replace(/"/g, '""')}"`

/** Only strip recognized leading questions; quoted content is never rewritten. */
function stripDomainFraming(input: string): string {
  return input.replace(
    /^(?:(?:what|where)\s+(?:does|did|has)\s+(?:ellen\s+(?:g\.?\s+)?white|she)\s+(?:say|said|write|written|teach)\s+(?:(?:about|regarding|on|that)\s+)?|(?:does|did)\s+(?:ellen\s+(?:g\.?\s+)?white|she)\s+teach\s+(?:that\s+)?|according\s+to\s+ellen\s+(?:g\.?\s+)?white\s*[,;:]?\s*|ellen\s+(?:g\.?\s+)?white\s+on\s+)/i,
    '',
  )
}

export function buildSearchPlan(input: string): SearchPlan {
  const normalized = normalizeQuery(input)
  const contentQuery = stripDomainFraming(normalized)
  const phrases = [...contentQuery.matchAll(/"([^"]+)"/g)].map(m => m[1]!.trim()).filter(Boolean)
  const rest = contentQuery.replace(/"[^"]*"/g, ' ')
  const advanced = /\b(?:AND|OR|NOT|NEAR)\b/.test(rest)
  const words = rest.match(/[\p{L}\p{N}]+(?:'\p{L}+)*/gu) ?? []
  const terms = [...new Set(words.map(w => w.toLowerCase()).filter(w =>
    !STOP.has(w) && !['not', 'near'].includes(w)))]
  const plan: SearchPlan = { normalized, terms, phrases, orderedPhrase: '', lanes: [] }
  if (!normalized) return plan
  if (advanced) {
    // Explicit FTS5 expressions stay strict; never widen OR/NOT or NEAR.
    // MATCH is bound as a SQL parameter by CorpusDb, not interpolated SQL.
    plan.lanes = [{ query: contentQuery, weight: 1 }]
    return plan
  }
  const orderedTokens = words.map(w => w.toLowerCase())
  plan.orderedPhrase = orderedTokens.join(' ')
  plan.terms = [...new Set(orderedTokens.filter(w => !STOP.has(w)))]
  // Stopword-only searches are still valid, e.g. "to be" without quotes.
  if (!plan.terms.length && !phrases.length) plan.terms = words.map(w => w.toLowerCase())
  const tokens = plan.terms.map(t => `${quote(t)}*`)
  if (phrases.length) {
    plan.lanes = [{ query: [...phrases.map(quote), ...tokens].join(' AND '), weight: 4 }]
    return plan
  }
  if (!tokens.length) return plan
  const lanes: SearchLane[] = [{ query: tokens.join(' AND '), weight: 2 }]
  if (orderedTokens.length > 1) lanes.unshift({ query: quote(plan.orderedPhrase), weight: 4 })
  if (tokens.length > 1) {
    lanes.push({ query: `NEAR(${tokens.join(' ')}, 12)`, weight: 2 })
    lanes.push({ query: tokens.join(' OR '), weight: 1 })
  }
  plan.lanes = lanes
  return plan
}
