import { describe, expect, it } from 'vitest'
import { planChunks } from './textChunks'

const decode = (u8: Uint8Array) => new TextDecoder().decode(u8)

describe('planChunks', () => {
  it('places short texts into a single chunk', () => {
    const { chunks, slices } = planChunks(['alpha', 'beta'], 1024)
    expect(chunks).toHaveLength(1)
    expect(slices).toHaveLength(2)
    expect(slices[0]!.chunkId).toBe(0)
    expect(slices[1]!.chunkId).toBe(0)
  })

  it('produces slices that recover the original text exactly', () => {
    const texts = ['alpha', 'beta', 'gamma']
    const { chunks, slices } = planChunks(texts, 1024)
    texts.forEach((t, i) => {
      const s = slices[i]!
      const bytes = chunks[s.chunkId]!.subarray(s.off, s.off + s.len)
      expect(decode(bytes)).toBe(t)
    })
  })

  it('rolls over to a new chunk once the target is exceeded', () => {
    const texts = ['a'.repeat(600), 'b'.repeat(600), 'c'.repeat(600)]
    const { chunks, slices } = planChunks(texts, 1000)
    expect(chunks.length).toBeGreaterThan(1)
    texts.forEach((t, i) => {
      const s = slices[i]!
      expect(decode(chunks[s.chunkId]!.subarray(s.off, s.off + s.len))).toBe(t)
    })
  })

  it('uses byte offsets so multi-byte characters survive', () => {
    const texts = ['God’s law', 'plain']
    const { chunks, slices } = planChunks(texts, 1024)
    const s = slices[0]!
    expect(decode(chunks[s.chunkId]!.subarray(s.off, s.off + s.len))).toBe('God’s law')
    // the curly apostrophe is 3 bytes, so byte length exceeds character length
    expect(s.len).toBeGreaterThan('God’s law'.length)
  })

  it('keeps a single oversized text intact in its own chunk', () => {
    const big = 'x'.repeat(5000)
    const { chunks, slices } = planChunks([big], 1000)
    const s = slices[0]!
    expect(decode(chunks[s.chunkId]!.subarray(s.off, s.off + s.len))).toBe(big)
  })
})
