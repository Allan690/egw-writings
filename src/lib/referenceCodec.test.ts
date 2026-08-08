import { describe, expect, it } from 'vitest'
import { composeReference, deriveTemplate } from './referenceCodec'

describe('deriveTemplate', () => {
  it('derives a template with a paragraph suffix', () => {
    expect(deriveTemplate('CME 6.9', 6, 9)).toEqual({ prefix: 'CME ', hasPara: true })
  })

  it('derives a page-only template', () => {
    expect(deriveTemplate('CME 6', 6, 9)).toEqual({ prefix: 'CME ', hasPara: false })
  })

  it('derives a periodical template with an embedded date', () => {
    expect(deriveTemplate('GCB/GCDB February 25,  1897, page 155.10', 155, 10)).toEqual({
      prefix: 'GCB/GCDB February 25,  1897, page ',
      hasPara: true,
    })
  })

  it('does not match a page number that is only a digit suffix of a larger number', () => {
    // page_num 6 must not match the trailing "6" of "16"
    expect(deriveTemplate('CME 16', 6, 3)).toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(deriveTemplate('Appendix A', 5, 1)).toBeNull()
  })
})

describe('composeReference', () => {
  it('round-trips a paragraph-suffixed reference', () => {
    const t = deriveTemplate('CME 6.9', 6, 9)!
    expect(composeReference(t, 6, 9)).toBe('CME 6.9')
  })

  it('round-trips a page-only reference', () => {
    const t = deriveTemplate('CME 6', 6, 9)!
    expect(composeReference(t, 6, 9)).toBe('CME 6')
  })

  it('reuses one template across paragraphs in the same chapter', () => {
    const t = deriveTemplate('GCB/GCDB February 25,  1897, page 155.10', 155, 10)!
    expect(composeReference(t, 156, 3)).toBe('GCB/GCDB February 25,  1897, page 156.3')
  })
})
