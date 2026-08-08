import { useCallback, useEffect, useRef, useState } from 'react'
import { getSearchApi, initCorpus } from '../db/corpus'

export type CorpusPhase = 'checking' | 'downloading' | 'opening' | 'ready' | 'error'

export interface CorpusInitState {
  ready: boolean
  error: string | null
  phase: CorpusPhase
  /** Bytes written so far, and total when the server sends Content-Length. */
  received: number
  total: number | null
  /** True when this visit had to download the corpus rather than open a local copy. */
  firstRun: boolean
  stats: { bookCount: number; paragraphCount: number } | null
  retry: () => void
}

/**
 * Drives the setup screen. installCorpus has always reported byte progress;
 * it simply was not passed a callback, so a ~70MB first download showed a
 * single line of static text.
 */
export function useCorpusInit(): CorpusInitState {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<CorpusPhase>('checking')
  const [received, setReceived] = useState(0)
  const [total, setTotal] = useState<number | null>(null)
  const [firstRun, setFirstRun] = useState(false)
  const [stats, setStats] = useState<{ bookCount: number; paragraphCount: number } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const frame = useRef<number | null>(null)
  const latest = useRef({ received: 0, total: null as number | null })

  const retry = useCallback(() => {
    setError(null)
    setPhase('checking')
    setReceived(0)
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        const installed = await getSearchApi().egwInstalled()
        if (cancelled) return
        setFirstRun(!installed)
        setPhase(installed ? 'opening' : 'downloading')

        const result = await initCorpus((bytes, totalBytes) => {
          // Progress fires per network chunk; coalesce to one paint per frame.
          latest.current = { received: bytes, total: totalBytes }
          if (frame.current !== null) return
          frame.current = requestAnimationFrame(() => {
            frame.current = null
            setReceived(latest.current.received)
            setTotal(latest.current.total)
          })
        })

        if (cancelled) return
        setPhase('opening')
        setStats(result)
        setReady(true)
        setPhase('ready')
      } catch (err) {
        if (cancelled) return
        setPhase('error')
        setError(err instanceof Error ? err.message : 'Could not load the writings.')
      }
    }

    void run()
    return () => {
      cancelled = true
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [attempt])

  return { ready, error, phase, received, total, firstRun, stats, retry }
}
