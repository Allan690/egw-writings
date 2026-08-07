import { getSetting, setSetting } from '../db/userStore'

const KEY = 'recent_searches'
const MAX = 8

export async function getRecentSearches(): Promise<string[]> {
  return getSetting<string[]>(KEY, [])
}

export async function addRecentSearch(query: string): Promise<void> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return
  const current = await getRecentSearches()
  const next = [trimmed, ...current.filter((q) => q.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    MAX,
  )
  await setSetting(KEY, next)
}

export async function clearRecentSearches(): Promise<void> {
  await setSetting(KEY, [])
}
