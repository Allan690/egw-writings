import {
  attachPioneerCorpus,
  isPioneerCorpusReady,
  pioneerCorpusAvailable,
} from './searchEngine'

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

async function fetchWithProgress(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)

  const total = Number(res.headers.get('Content-Length') ?? 0)
  if (!res.body || !total) {
    setState({ progress: null })
    return res.arrayBuffer()
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    setState({ progress: Math.min(99, Math.round((received / total) * 100)) })
  }

  const merged = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged.buffer
}

async function decompressIfNeeded(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(buf)
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Gzip decompression not supported in this browser')
    }
    const stream = new Response(buf).body!.pipeThrough(new DecompressionStream('gzip'))
    return new Response(stream).arrayBuffer()
  }
  return buf
}

export function startPioneerBackgroundLoad(): Promise<void> {
  if (isPioneerCorpusReady()) {
    setState({ status: 'ready', progress: 100, error: null })
    return Promise.resolve()
  }
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    setState({ status: 'checking', progress: null, error: null })

    const available = await pioneerCorpusAvailable()
    if (!available) {
      setState({ status: 'unavailable', progress: null, error: null })
      return
    }

    setState({ status: 'loading', progress: 0, error: null })

    try {
      let buf = await fetchWithProgress('/corpus/pioneers.sqlite.gz')
      buf = await decompressIfNeeded(buf)
      await attachPioneerCorpus(buf)
      setState({ status: 'ready', progress: 100, error: null })
    } catch (err) {
      try {
        let buf = await fetch('/corpus/pioneers.sqlite').then((r) => {
          if (!r.ok) throw new Error('Pioneer corpus not found')
          return r.arrayBuffer()
        })
        buf = await decompressIfNeeded(buf)
        await attachPioneerCorpus(buf)
        setState({ status: 'ready', progress: 100, error: null })
      } catch (fallbackErr) {
        setState({
          status: 'error',
          progress: null,
          error:
            fallbackErr instanceof Error ? fallbackErr.message : 'Failed to load pioneer library',
        })
      }
    }
  })()

  return loadPromise
}
