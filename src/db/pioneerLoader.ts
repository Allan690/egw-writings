import { installPioneers, isPioneerCorpusReady, pioneerCorpusAvailable } from './searchEngine'

export type PioneerLoadStatus = 'idle' | 'checking' | 'loading' | 'ready' | 'unavailable' | 'error'

export interface PioneerLoadState {
  status: PioneerLoadStatus
  progress: number | null
  error: string | null
}

type Listener = (state: PioneerLoadState) => void

let state: PioneerLoadState = { status: 'idle', progress: null, error: null }
let listeners: Listener[] = []
let loadPromise: Promise<void> | null = null

function setState(next: Partial<PioneerLoadState>) {
  state = { ...state, ...next }
  for (const fn of listeners) fn(state)
}

export function getPioneerLoadState(): PioneerLoadState {
  return state
}

export function subscribePioneerLoad(fn: Listener): () => void {
  listeners.push(fn)
  fn(state)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

export function startPioneerBackgroundLoad(): Promise<void> {
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    if (await isPioneerCorpusReady()) {
      setState({ status: 'ready', progress: 100, error: null })
      return
    }

    setState({ status: 'checking', progress: null, error: null })

    const available = await pioneerCorpusAvailable()
    if (!available) {
      setState({ status: 'unavailable', progress: null, error: null })
      return
    }

    setState({ status: 'loading', progress: 0, error: null })
    try {
      await installPioneers((received, total) => {
        setState({
          progress: total ? Math.min(99, Math.round((received / total) * 100)) : null,
        })
      })
      setState({ status: 'ready', progress: 100, error: null })
    } catch (err) {
      setState({
        status: 'error',
        progress: null,
        error: err instanceof Error ? err.message : 'Failed to load pioneer library',
      })
    }
  })()

  return loadPromise
}
