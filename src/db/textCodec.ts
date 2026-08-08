import { createDCtx, decompressUsingDict, freeDCtx } from '@bokuweb/zstd-wasm'
import { ensureZstd } from '../lib/zstd'

const MAX_CACHED_CHUNKS = 24

export { ensureZstd }

/**
 * Decompresses paragraph text out of shared zstd chunks.
 *
 * Paragraphs in a chapter are consecutive and usually share one or two chunks,
 * so a small LRU keeps a chapter render to a handful of decompressions.
 */
export class TextCodec {
  private readonly decoder = new TextDecoder()
  private readonly cache = new Map<number, Uint8Array>()
  private readonly dctx = createDCtx()
  private readonly dict: Uint8Array
  private readonly loadChunk: (id: number) => Uint8Array
  private disposed = false

  constructor(dict: Uint8Array, loadChunk: (id: number) => Uint8Array) {
    this.dict = dict
    this.loadChunk = loadChunk
  }

  private chunk(id: number): Uint8Array {
    const hit = this.cache.get(id)
    if (hit) {
      // Re-insert to refresh LRU position.
      this.cache.delete(id)
      this.cache.set(id, hit)
      return hit
    }
    const plain = decompressUsingDict(this.dctx, this.loadChunk(id), this.dict)
    this.cache.set(id, plain)
    if (this.cache.size > MAX_CACHED_CHUNKS) {
      const oldest = this.cache.keys().next().value as number
      this.cache.delete(oldest)
    }
    return plain
  }

  read(chunkId: number, off: number, len: number): string {
    if (this.disposed) throw new Error('TextCodec has been disposed')
    return this.decoder.decode(this.chunk(chunkId).subarray(off, off + len))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cache.clear()
    freeDCtx(this.dctx)
  }
}
