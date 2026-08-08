import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createCorpusSchemaV5 } from './corpus-schema'

function cols(db: Database.Database, table: string): string[] {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((r: any) => r.name as string)
}

describe('createCorpusSchemaV5', () => {
  it('creates paragraphs without a reference column', () => {
    const db = new Database(':memory:')
    createCorpusSchemaV5(db)
    const c = cols(db, 'paragraphs')
    expect(c).not.toContain('reference')
    expect(c).toEqual(expect.arrayContaining(['chunk_id', 'chunk_off', 'chunk_len', 'ref_template_id']))
  })

  it('creates the supporting tables', () => {
    const db = new Database(':memory:')
    createCorpusSchemaV5(db)
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name as string)
    expect(names).toEqual(
      expect.arrayContaining(['text_chunks', 'ref_templates', 'ref_exceptions', 'corpus_meta']),
    )
  })

  it('drops the redundant book and chapter indexes but keeps the order index', () => {
    const db = new Database(':memory:')
    createCorpusSchemaV5(db)
    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r: any) => r.name as string)
    expect(idx).toContain('idx_paragraphs_order')
    expect(idx).not.toContain('idx_paragraphs_ref')
    expect(idx).not.toContain('idx_paragraphs_book')
    expect(idx).not.toContain('idx_paragraphs_chapter')
  })

  it('supports contentless phrase search', () => {
    const db = new Database(':memory:')
    createCorpusSchemaV5(db)
    db.prepare('INSERT INTO paragraphs_fts(rowid, text) VALUES (?, ?)').run(1, 'the great controversy ended')
    db.prepare('INSERT INTO paragraphs_fts(rowid, text) VALUES (?, ?)').run(2, 'great and small controversy')
    const hits = db
      .prepare(`SELECT rowid FROM paragraphs_fts WHERE paragraphs_fts MATCH '"great controversy"'`)
      .all()
    expect(hits).toHaveLength(1)
  })

  it('supports bm25 ranking', () => {
    const db = new Database(':memory:')
    createCorpusSchemaV5(db)
    db.prepare('INSERT INTO paragraphs_fts(rowid, text) VALUES (?, ?)').run(1, 'faith faith faith')
    db.prepare('INSERT INTO paragraphs_fts(rowid, text) VALUES (?, ?)').run(2, 'faith once')
    const ranked = db
      .prepare(
        `SELECT rowid FROM paragraphs_fts WHERE paragraphs_fts MATCH 'faith' ORDER BY bm25(paragraphs_fts)`,
      )
      .all()
      .map((r: any) => r.rowid as number)
    expect(ranked[0]).toBe(1)
  })
})
