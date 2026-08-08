import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDCtx, decompressUsingDict, freeDCtx } from '@bokuweb/zstd-wasm'
import { ensureZstd } from './lib/zstdDict'
import { createCorpusSchema } from './corpus-schema'
import { composeReference } from '../src/lib/referenceCodec'
import { optimizeCorpus } from './optimize-corpus'

let dir: string

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'optc-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function buildSource(path: string) {
  const db = new Database(path)
  createCorpusSchema(db)
  db.prepare(
    `INSERT INTO books (id, api_book_id, code, title, author, collection, year, chapter_count, paragraph_count)
     VALUES ('cme', 1, 'CME', 'A Call to Medical Evangelism', 'Ellen Gould White', 'egw', 1933, 1, 3)`,
  ).run()
  db.prepare(`INSERT INTO chapters (id, book_id, number, title) VALUES (1, 'cme', 1, 'Chapter One')`).run()
  const ins = db.prepare(
    `INSERT INTO paragraphs (id, book_id, chapter_id, chapter_num, page_num, para_num, puborder, reference, text)
     VALUES (@id, 'cme', 1, 1, @page, @para, @id, @ref, @text)`,
  )
  ins.run({ id: 1, page: 6, para: 9, ref: 'CME 6.9', text: 'A clarion call to medical evangelism is due.' })
  ins.run({ id: 2, page: 6, para: 10, ref: 'CME 6', text: 'The great controversy is not yet ended.' })
  ins.run({ id: 3, page: 7, para: 1, ref: 'Appendix A', text: 'God’s law endures forever.' })
  db.close()
}

describe('optimizeCorpus', () => {
  it('preserves every paragraph text exactly', async () => {
    const src = join(dir, 'src.sqlite')
    const out = join(dir, 'out.sqlite')
    buildSource(src)
    await optimizeCorpus(src, out)
    await ensureZstd()

    const srcDb = new Database(src, { readonly: true })
    const outDb = new Database(out, { readonly: true })
    const dict = (outDb.prepare(`SELECT value FROM corpus_meta WHERE key='zstd_dict'`).get() as any).value
    const dctx = createDCtx()
    try {
      for (const row of srcDb.prepare('SELECT id, text FROM paragraphs').all() as any[]) {
        const p = outDb
          .prepare('SELECT chunk_id, chunk_off, chunk_len FROM paragraphs WHERE id = ?')
          .get(row.id) as any
        const blob = (outDb.prepare('SELECT data FROM text_chunks WHERE id = ?').get(p.chunk_id) as any).data
        const plain = decompressUsingDict(dctx, new Uint8Array(blob), new Uint8Array(dict))
        const text = new TextDecoder().decode(plain.subarray(p.chunk_off, p.chunk_off + p.chunk_len))
        expect(text).toBe(row.text)
      }
    } finally {
      freeDCtx(dctx)
    }
  }, 120_000)

  it('reconstructs every reference exactly', async () => {
    const src = join(dir, 'src.sqlite')
    const out = join(dir, 'out.sqlite')
    buildSource(src)
    await optimizeCorpus(src, out)

    const srcDb = new Database(src, { readonly: true })
    const outDb = new Database(out, { readonly: true })
    for (const row of srcDb.prepare('SELECT id, reference, page_num, para_num FROM paragraphs').all() as any[]) {
      const p = outDb
        .prepare(
          `SELECT p.page_num, p.para_num, t.prefix, t.has_para, e.reference AS exc
           FROM paragraphs p
           LEFT JOIN ref_templates t ON p.ref_template_id = t.id
           LEFT JOIN ref_exceptions e ON e.paragraph_id = p.id
           WHERE p.id = ?`,
        )
        .get(row.id) as any
      const actual = p.exc ?? composeReference({ prefix: p.prefix, hasPara: !!p.has_para }, p.page_num, p.para_num)
      expect(actual).toBe(row.reference)
    }
  }, 120_000)

  it('stores unmatched references as exceptions', async () => {
    const src = join(dir, 'src.sqlite')
    const out = join(dir, 'out.sqlite')
    buildSource(src)
    const stats = await optimizeCorpus(src, out)
    expect(stats.exceptions).toBe(1) // "Appendix A"
  }, 120_000)

  it('carries phrase search into the contentless index', async () => {
    const src = join(dir, 'src.sqlite')
    const out = join(dir, 'out.sqlite')
    buildSource(src)
    await optimizeCorpus(src, out)

    const outDb = new Database(out, { readonly: true })
    const hits = outDb
      .prepare(`SELECT rowid FROM paragraphs_fts WHERE paragraphs_fts MATCH '"great controversy"'`)
      .all() as any[]
    expect(hits.map((h) => h.rowid)).toEqual([2])
  }, 120_000)
})
