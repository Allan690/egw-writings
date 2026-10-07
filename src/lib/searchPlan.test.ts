import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { buildSearchPlan, normalizeQuery } from './searchPlan'
import { fuseSearchResults } from './searchRanking'
import type { SearchHit } from '../db/types'

const texts = [
  'Righteousness by faith in Christ brings peace.',
  'Faith and works are both mentioned.',
  'The angels cannot read the minds of men.',
  'God’s love gives human freedom.',
  'The blood, my blood, pleads for them.',
  'Christ brings righteousness through faith.',
]
function retrieve(query: string) {
  const db = new Database(':memory:')
  try {
    db.exec("CREATE VIRTUAL TABLE passages USING fts5(text, tokenize='porter unicode61')")
    texts.forEach(text => db.prepare('INSERT INTO passages(text) VALUES (?)').run(text))
    const plan = buildSearchPlan(query)
    const lists = plan.lanes.map(lane => ({ weight: lane.weight,
      hits: (db.prepare('SELECT rowid AS id, text, bm25(passages) AS rank FROM passages WHERE passages MATCH ? ORDER BY rank, rowid')
        .all(lane.query) as { id: number; text: string; rank: number }[])
        .map(row => ({ ...row, collection: 'egw', book_id: 'test' } as SearchHit)) }))
    return fuseSearchResults(lists, plan, 40)
  } finally { db.close() }
}

describe('search planning and real FTS5 retrieval', () => {
  it('normalizes copied punctuation', () => {
    expect(normalizeQuery('  “God’s” — love  ')).toBe('"God\'s" - love')
  })
  it('removes question framing but keeps meaningful content', () => {
    expect(buildSearchPlan('what does Ellen White say about angels reading minds?').terms)
      .toEqual(['angels', 'reading', 'minds'])
    expect(retrieve('what does Ellen White say about angels reading minds?')[0]?.id).toBe(3)
  })
  it('recovers close wording without demanding every token', () => {
    expect(retrieve('righteousness faith Christ peace')[0]?.id).toBe(1)
    expect(retrieve('righteousness faith Christ peace').some(h => h.id === 6)).toBe(true)
  })
  it('keeps a mixed quoted phrase mandatory', () => {
    expect(retrieve('Christ "righteousness by faith"').map(h => h.id)).toEqual([1])
    expect(buildSearchPlan('Christ "righteousness by faith"').lanes).toHaveLength(1)
  })
  it('preserves explicit Boolean and proximity semantics', () => {
    expect(retrieve('faith NOT works').map(h => h.id)).toEqual(expect.arrayContaining([1, 6]))
    expect(retrieve('faith NOT works').some(h => h.id === 2)).toBe(false)
    expect(retrieve('faith OR minds').some(h => h.id === 3)).toBe(true)
    expect(retrieve('NEAR(faith Christ, 3)').map(h => h.id)).toEqual(expect.arrayContaining([1, 6]))
  })
  it('supports Unicode words, apostrophes, quoted punctuation, and stopword-only queries', () => {
    expect(retrieve('God’s love')[0]?.id).toBe(4)
    expect(retrieve('"my blood, my blood"')).toEqual([])
    expect(retrieve('"blood, my blood"')[0]?.id).toBe(5)
    expect(() => retrieve('to be')).not.toThrow()
    expect(buildSearchPlan('聖書').terms).toEqual(['聖書'])
    expect(buildSearchPlan('?!').lanes).toEqual([])
  })
})

describe('rank fusion', () => {
  it('ignores raw scores from independent indexes and does not mutate hits', () => {
    const a = { id: 1, collection: 'egw', text: 'faith', rank: -999 } as SearchHit
    const b = { id: 1, collection: 'pioneer', text: 'faith', rank: -0.001 } as SearchHit
    const hits = fuseSearchResults([{ hits: [a], weight: 1 }, { hits: [b], weight: 2 }], buildSearchPlan('faith'), 2)
    expect(hits.map(h => h.collection)).toEqual(['pioneer', 'egw'])
    expect(a.rank).toBe(-999)
    expect(b.rank).toBe(-0.001)
  })
  it('accumulates evidence for the same paragraph across lanes', () => {
    const a = { id: 1, collection: 'egw', text: 'faith' } as SearchHit
    const b = { id: 2, collection: 'egw', text: 'faith' } as SearchHit
    expect(fuseSearchResults([{ hits: [b, a], weight: 1 }, { hits: [a], weight: 1 }], buildSearchPlan('faith'), 1)[0]?.id).toBe(1)
  })
})
