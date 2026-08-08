import { useCallback, useEffect, useRef, useState } from 'react'
import { getSearchApi } from '../db/corpus'
import type { BookCollection } from '../lib/corpusConstants'
import type { SearchResult } from '../types'

export function useSearch(debounceMs = 120) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [bookFilter, setBookFilter] = useState<string | undefined>()
  const [collectionFilter, setCollectionFilter] = useState<BookCollection | 'all'>('all')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(
    async (q: string, bookId?: string, collection: BookCollection | 'all' = 'all') => {
      const trimmed = q.trim()
      if (trimmed.length < 2) {
        setResults([])
        setSearching(false)
        return
      }

      setSearching(true)
      try {
        const hits = await getSearchApi().search(trimmed, 40, bookId, collection)
        setResults(hits as SearchResult[])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void runSearch(query, bookFilter, collectionFilter)
    }, debounceMs)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, bookFilter, collectionFilter, debounceMs, runSearch])

  return {
    query,
    setQuery,
    results,
    searching,
    bookFilter,
    setBookFilter,
    collectionFilter,
    setCollectionFilter,
  }
}
