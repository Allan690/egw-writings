import { describe, expect, it } from 'vitest'
import { decompressUsingDict, createDCtx, freeDCtx } from '@bokuweb/zstd-wasm'
import { compressChunks, ensureZstd, trainDictionary } from './zstdDict'

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
    await ensureZstd()
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

  it('falls back to a non-empty raw dictionary when there are too few samples to train', async () => {
    await ensureZstd()
    // Runs after the real-dictionary test above on purpose: this is the case
    // that caught init() being non-idempotent, which corrupted output only
    // once the wasm module had already been initialized.
    const input = [enc.encode('one small chunk of text, not enough to train on')]
    const dict = await trainDictionary(input, 32 * 1024)
    expect(dict.length).toBeGreaterThan(0)

    const compressed = await compressChunks(input, dict)
    // A valid zstd frame starts with magic 28 b5 2f fd.
    expect(Array.from(compressed[0]!.slice(0, 4))).toEqual([0x28, 0xb5, 0x2f, 0xfd])

    const dctx = createDCtx()
    try {
      expect(dec.decode(decompressUsingDict(dctx, compressed[0]!, dict))).toBe(dec.decode(input[0]!))
    } finally {
      freeDCtx(dctx)
    }
  }, 120_000)

  it('compresses to substantially less than the input size', async () => {
    await ensureZstd()
    const input = samples()
    const dict = await trainDictionary(input, 32 * 1024)
    const compressed = await compressChunks(input, dict)

    const rawBytes = input.reduce((n, c) => n + c.length, 0)
    const compBytes = compressed.reduce((n, c) => n + c.length, 0)
    expect(compBytes).toBeLessThan(rawBytes / 2)
  }, 120_000)
})
