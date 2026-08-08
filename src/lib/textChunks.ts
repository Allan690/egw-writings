export const CHUNK_TARGET_BYTES = 32 * 1024

export interface ChunkSlice {
  chunkId: number
  off: number
  len: number
}

export function planChunks(
  texts: string[],
  targetBytes: number = CHUNK_TARGET_BYTES,
): { chunks: Uint8Array[]; slices: ChunkSlice[] } {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const slices: ChunkSlice[] = []

  let current: Uint8Array[] = []
  let currentLen = 0

  const flush = () => {
    if (current.length === 0) return
    const merged = new Uint8Array(currentLen)
    let at = 0
    for (const part of current) {
      merged.set(part, at)
      at += part.length
    }
    chunks.push(merged)
    current = []
    currentLen = 0
  }

  for (const text of texts) {
    const bytes = encoder.encode(text)
    if (currentLen > 0 && currentLen + bytes.length > targetBytes) flush()
    slices.push({ chunkId: chunks.length, off: currentLen, len: bytes.length })
    current.push(bytes)
    currentLen += bytes.length
  }
  flush()

  return { chunks, slices }
}
