import { describe, expect, it } from 'vitest'
import { init, decompressUsingDict, createDCtx, freeDCtx } from '@bokuweb/zstd-wasm'
import { compressChunks, trainDictionary } from './zstdDict'

const enc = new TextEncoder()
const dec = new TextDecoder()

// Repetitive sentences give the trainer real cross-sample redundancy to find.
function samples(): Uint8Array[] {
  const out: Uint8Array[] = []
  for (let i = 0; i < 200; i++) {
    out.push(enc.encode(`The Lord is my shepherd and my salvation, paragraph number ${i}. `.repeat(40)))
  }
  return out
}

describe('zstd dictionary round-trip', () => {
  it('produces chunks that decompress back to the exact input', async () => {
    await init()
    const input = samples()
    const dict = await trainDictionary(input, 32 * 1024)
    const compressed = await compressChunks(input, dict)

    const dctx = createDCtx()
    try {
      input.forEach((original, i) => {
        const round = decompressUsingDict(dctx, compressed[i]!, dict)
        expect(dec.decode(round)).toBe(dec.decode(original))
      })
    } finally {
      freeDCtx(dctx)
    }
  }, 120_000)

  it('compresses to substantially less than the input size', async () => {
    await init()
    const input = samples()
    const dict = await trainDictionary(input, 32 * 1024)
    const compressed = await compressChunks(input, dict)

    const rawBytes = input.reduce((n, c) => n + c.length, 0)
    const compBytes = compressed.reduce((n, c) => n + c.length, 0)
    expect(compBytes).toBeLessThan(rawBytes / 2)
  }, 120_000)
})
