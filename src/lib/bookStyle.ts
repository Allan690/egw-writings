/**
 * A stable spine colour per book.
 *
 * Drawn from 19th-century publisher's cloth — the greens, oxbloods and slates
 * these volumes were actually bound in. Muted enough that a shelf of 140 of
 * them still reads as quiet.
 */

const PALETTE = [
  '#3d5a4a', // bookcloth green
  '#6b3f3a', // oxblood
  '#3f4a5c', // slate blue
  '#5c4a33', // tan calf
  '#4a4a52', // charcoal
  '#2f5049', // deep teal
  '#6a5230', // ochre
  '#4c3b4e', // plum
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
  'the Sabbath',
  'prayer',
  'health reform',
  'the second coming',
]
