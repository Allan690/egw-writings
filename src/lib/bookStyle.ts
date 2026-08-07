/** Stable color per book code — subtle, not loud */

const PALETTE = [
  '#78716c', '#a8a29e', '#57534e', '#6b7280',
  '#9ca3af', '#83827e', '#737373', '#64748b',
]

export function bookCoverColor(code: string): string {
  let hash = 0
  for (let i = 0; i < code.length; i++) {
    hash = code.charCodeAt(i) + ((hash << 5) - hash)
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]!
}

export const SEARCH_SUGGESTIONS = [
  'righteousness by faith',
  'character of Christ',
  'Sabbath',
  'prayer',
  'health reform',
]
