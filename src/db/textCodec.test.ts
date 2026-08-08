import { describe, expect, it } from 'vitest'
import { compressChunks, trainDictionary } from '../../scripts/lib/zstdDict'
import { planChunks } from '../lib/textChunks'
import { TextCodec, ensureZstd } from './textCodec'

async function fixture(texts: string[], target = 1024) {
  await ensureZstd()
  const { chunks, slices } = planChunks(texts, target)
  const dict = await trainDictionary(chunks, 8 * 1024)
  const compressed = await compressChunks(chunks, dict)
  return { dict, compressed, slices }
}

describe('TextCodec', () => {
  it('reads back every slice exactly', async () => {
    const texts = ['alpha one', 'God’s law endures', 'gamma three']
    const { dict, compressed, slices } = await fixture(texts)
    const codec = new TextCodec(dict, (id) => compressed[id]!)
    try {
      texts.forEach((t, i) => {
        const s = slices[i]!
        expect(codec.read(s.chunkId, s.off, s.len)).toBe(t)
      })
    } finally {
      codec.dispose()
    }
  }, 120_000)

  it('decompresses a chunk only once for repeated reads', async () => {
    const texts = ['alpha one', 'beta two', 'gamma three']
    const { dict, compressed, slices } = await fixture(texts)
    let loads = 0
    const codec = new TextCodec(dict, (id) => {
      loads += 1
      return compressed[id]!
    })
    try {
      codec.read(slices[0]!.chunkId, slices[0]!.off, slices[0]!.len)
      codec.read(slices[0]!.chunkId, slices[0]!.off, slices[0]!.len)
      codec.read(slices[1]!.chunkId, slices[1]!.off, slices[1]!.len)
      // All three fit one chunk at this target size.
      expect(loads).toBe(1)
    } finally {
      codec.dispose()
    }
  }, 120_000)

  it('recovers multi-byte characters across a chunk boundary', async () => {
    const texts = ['a'.repeat(600) + '’', 'God’s law', 'b'.repeat(600)]
    const { dict, compressed, slices } = await fixture(texts, 700)
    const codec = new TextCodec(dict, (id) => compressed[id]!)
    try {
      texts.forEach((t, i) => {
        const s = slices[i]!
        expect(codec.read(s.chunkId, s.off, s.len)).toBe(t)
      })
    } finally {
      codec.dispose()
    }
  }, 120_000)

  it('throws rather than reading after dispose', async () => {
    const { dict, compressed, slices } = await fixture(['alpha'])
    const codec = new TextCodec(dict, (id) => compressed[id]!)
    codec.dispose()
    expect(() => codec.read(slices[0]!.chunkId, slices[0]!.off, slices[0]!.len)).toThrow(
      /disposed/,
    )
  }, 120_000)

  it('returns the same promise from repeated ensureZstd calls', async () => {
    // Guards the non-idempotent init() that silently corrupted compression.
    expect(ensureZstd()).toBe(ensureZstd())
  })
})
