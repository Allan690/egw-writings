import { getPool } from './opfsPool'

const IMPORT_CHUNK_BYTES = 4 * 1024 * 1024

/**
 * Streams `url` into the OPFS database file `dbPath`.
 *
 * importDb's callback form writes each chunk through a SyncAccessHandle as it
 * arrives, so peak memory is one chunk rather than the whole corpus. This is
 * what replaces the old loader, which accumulated every response chunk, merged
 * them into one buffer, decompressed into a second, then handed a third copy
 * to sql.js — peaking around 1.3GB for the Pioneers corpus.
 *
 * Note importDb truncates on start and removes the file if the stream throws,
 * so a failed install leaves no partial database behind — but equally cannot
 * resume. A failed transfer restarts from zero.
 */
export async function installCorpus(
  url: string,
  dbPath: string,
  onProgress?: (received: number, total: number | null) => void,
): Promise<number> {
  const pool = await getPool()

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Corpus download failed (${res.status})`)
  if (!res.body) throw new Error('Corpus download returned no body')

  const totalHeader = res.headers.get('Content-Length')
  const total = totalHeader ? Number(totalHeader) : null

  const reader = res.body.getReader()
  let received = 0
  let pending: Uint8Array[] = []
  let pendingBytes = 0
  let done = false

  const drain = (): Uint8Array => {
    const merged = new Uint8Array(pendingBytes)
    let at = 0
    for (const p of pending) {
      merged.set(p, at)
      at += p.length
    }
    pending = []
    pendingBytes = 0
    return merged
  }

  const next = async (): Promise<Uint8Array | undefined> => {
    while (!done && pendingBytes < IMPORT_CHUNK_BYTES) {
      const { value, done: finished } = await reader.read()
      if (finished) {
        done = true
        break
      }
      pending.push(value)
      pendingBytes += value.length
      received += value.length
      onProgress?.(received, total)
    }
    if (pendingBytes === 0) return undefined
    return drain()
  }

  return pool.importDb(dbPath, next)
}
