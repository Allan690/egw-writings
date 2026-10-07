export type SearchLaneKind = 'advanced' | 'phrase' | 'strict' | 'near' | 'relaxed'

export interface SearchLane {
  kind: SearchLaneKind
  query: string
  weight: number
}

export interface SearchPlan {
  raw: string
  normalized: string
  phrases: string[]
  terms: string[]
  rankingTerms: string[]
  lanes: SearchLane[]
  advanced: boolean
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'in',
  'is',
  'it',
  'and',
  'or',
  'be',
  'as',
  'at',
  'by',
  'for',
  'on',
  'that',
  'this',
  'with',
  'was',
  'are',
  'from',
  'what',
  'does',
  'did',
  'say',
  'said',
  'about',
  'how',
  'where',
  'when',
  'why',
  'who',
  'according',
  'regarding',
])

const DOMAIN_PREFIXES = [
  /^(?:what|where)\s+(?:does|did)\s+ellen\s+(?:g\.?\s+)?white\s+(?:say|write)\s+(?:about|regarding|on)\s+/i,
  /^according\s+to\s+ellen\s+(?:g\.?\s+)?white\s*[,;:]?\s*/i,
  /^(?:does|did)\s+ellen\s+(?:g\.?\s+)?white\s+teach(?:\s+that)?\s+/i,
  /^ellen\s+(?:g\.?\s+)?white\s+on\s+/i,
]

const EXPLICIT_ADVANCED = /\b(?:AND|OR|NOT)\b|\bNEAR\s*\(/ 

export function normalizeSearchQuery(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripDomainFraming(input: string): string {
  let value = input.trim()
  for (const pattern of DOMAIN_PREFIXES) {
    const stripped = value.replace(pattern, '')
    if (stripped !== value) {
      value = stripped
      break
    }
  }
  return value
}

function tokenize(input: string): string[] {
  return input.match(/[\p{L}\p{N}'-]+/gu) ?? []
}

function phraseText(input: string): string {
  return tokenize(input).join(' ')
}

function quotePhrase(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function prefixTerm(value: string): string {
  return `${quotePhrase(value)}*`
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.toLowerCase())))
}

function meaningfulTerms(input: string): string[] {
  return unique(
    tokenize(input)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .filter((token) => !STOP_WORDS.has(token.toLowerCase()))
      .filter((token) => !['and', 'or', 'not', 'near'].includes(token.toLowerCase())),
  )
}

function rankingTerms(phrases: string[], terms: string[]): string[] {
  const phraseParts = phrases.flatMap((phrase) =>
    tokenize(phrase).filter((token) => !STOP_WORDS.has(token.toLowerCase())),
  )
  return unique([...terms, ...phraseParts])
}

function pushLane(lanes: SearchLane[], lane: SearchLane) {
  if (!lane.query.trim()) return
  const existing = lanes.find((candidate) => candidate.query === lane.query)
  if (existing) {
    if (lane.weight > existing.weight) {
      existing.kind = lane.kind
      existing.weight = lane.weight
    }
    return
  }
  lanes.push(lane)
}

export function buildSearchPlan(raw: string): SearchPlan {
  const normalized = normalizeSearchQuery(raw)
  if (!normalized) {
    return {
      raw,
      normalized,
      phrases: [],
      terms: [],
      rankingTerms: [],
      lanes: [],
      advanced: false,
    }
  }

  const phrases: string[] = []
  const phraseRe = /"([^"]+)"/g
  let phraseMatch: RegExpExecArray | null
  while ((phraseMatch = phraseRe.exec(normalized)) !== null) {
    const phrase = phraseText(phraseMatch[1] ?? '')
    if (phrase) phrases.push(phrase)
  }

  const rest = stripDomainFraming(normalized.replace(/"[^"]*"/g, ' '))
  const terms = meaningfulTerms(rest)
  const ranked = rankingTerms(phrases, terms)
  const advanced = EXPLICIT_ADVANCED.test(normalized)

  if (advanced) {
    return {
      raw,
      normalized,
      phrases,
      terms,
      rankingTerms: ranked,
      lanes: [{ kind: 'advanced', query: normalized, weight: 3 }],
      advanced: true,
    }
  }

  const lanes: SearchLane[] = []

  if (phrases.length > 0) {
    pushLane(lanes, {
      kind: 'phrase',
      query: phrases.map(quotePhrase).join(' AND '),
      weight: 4,
    })
  } else if (terms.length > 1) {
    pushLane(lanes, {
      kind: 'phrase',
      query: quotePhrase(terms.join(' ')),
      weight: 4,
    })
  }

  const exactUnits = phrases.map(quotePhrase)
  const prefixUnits = terms.map(prefixTerm)
  const strictUnits = [...exactUnits, ...prefixUnits]

  if (strictUnits.length > 0) {
    pushLane(lanes, {
      kind: 'strict',
      query: strictUnits.join(' AND '),
      weight: 2.5,
    })
  }

  const nearUnits = [
    ...phrases.map(quotePhrase),
    ...terms.map((term) => quotePhrase(term)),
  ]
  if (nearUnits.length >= 2 && nearUnits.length <= 6) {
    pushLane(lanes, {
      kind: 'near',
      query: `NEAR(${nearUnits.join(' ')}, 12)`,
      weight: 2,
    })
  }

  if (strictUnits.length > 1) {
    pushLane(lanes, {
      kind: 'relaxed',
      query: strictUnits.join(' OR '),
      weight: 1,
    })
  }

  return {
    raw,
    normalized,
    phrases,
    terms,
    rankingTerms: ranked,
    lanes,
    advanced: false,
  }
}
