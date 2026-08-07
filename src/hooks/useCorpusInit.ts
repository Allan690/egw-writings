import { useEffect, useState } from 'react'
import { initCorpus } from '../db/corpus'

export function useCorpusInit() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<{ bookCount: number; paragraphCount: number } | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    initCorpus()
      .then((s) => {
        if (!cancelled) {
          setStats(s)
          setReady(true)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load corpus')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { ready, error, stats }
}
