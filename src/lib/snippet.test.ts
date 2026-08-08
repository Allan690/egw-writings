import { describe, expect, it } from 'vitest'
import { makeSnippet } from './snippet'

describe('makeSnippet', () => {
  it('never returns an empty string for a matching term', () => {
    // Guards the contentless-FTS5 failure mode: snippet() returns "" silently.
    const out = makeSnippet('The great controversy is not yet ended.', 'controversy')
    expect(out).not.toBe('')
    expect(out).toContain('<mark>controversy</mark>')
  })

  it('marks every distinct query term', () => {
    const out = makeSnippet('Righteousness comes by faith alone.', 'righteousness faith')
    expect(out).toContain('<mark>Righteousness</mark>')
    expect(out).toContain('<mark>faith</mark>')
  })

  it('preserves the original casing of the matched text', () => {
    expect(makeSnippet('Faith and works', 'faith')).toContain('<mark>Faith</mark>')
  })

  it('adds ellipses when it trims a long passage', () => {
    const text = `${'padding word '.repeat(40)}controversy${' trailing word'.repeat(40)}`
    const out = makeSnippet(text, 'controversy', { context: 20 })
    expect(out.startsWith('…')).toBe(true)
    expect(out.endsWith('…')).toBe(true)
    expect(out).toContain('<mark>controversy</mark>')
  })

  it('escapes HTML so corpus text cannot inject markup', () => {
    const out = makeSnippet('A <script>alert(1)</script> faith', 'faith')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('returns a leading excerpt when nothing matches', () => {
    const out = makeSnippet('Nothing relevant here at all.', 'zzzz')
    expect(out).not.toBe('')
    expect(out).toContain('Nothing relevant')
  })

  it('matches a quoted phrase as a unit', () => {
    const out = makeSnippet('The great controversy ended.', '"great controversy"')
    expect(out).toContain('<mark>great controversy</mark>')
  })

  it('does not emit a mark tag around escaped markup', () => {
    const out = makeSnippet('faith <b>bold</b> faith', 'faith')
    expect(out).toContain('<mark>faith</mark>')
    expect(out).toContain('&lt;b&gt;')
  })

  it('handles curly apostrophes inside terms', () => {
    const out = makeSnippet('God’s law endures forever.', 'God’s')
    expect(out).toContain('<mark>God’s</mark>')
  })
})
