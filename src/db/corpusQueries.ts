import { openDb, type Database } from './opfsPool'
import { TextCodec, ensureZstd } from './textCodec'
import { makeSnippet } from '../lib/snippet'
import { composeReference } from '../lib/referenceCodec'
import type { BookCollection } from '../lib/corpusConstants'
import type { BookRow, ChapterRow, ParagraphRow, ParsedReference, SearchHit } from './types'

/** Columns needed to rebuild both the text and the reference of a paragraph. */
const PARA_COLS = `
  p.id, p.book_id, p.chapter_id, p.chapter_num, p.page_num, p.para_num,
  p.chunk_id, p.chunk_off, p.chunk_len,
  t.prefix AS ref_prefix, t.has_para AS ref_has_para, e.reference AS ref_exception
`

const PARA_JOINS = `
  LEFT JOIN ref_templates t ON p.ref_template_id = t.id
  LEFT JOIN ref_exceptions e ON e.paragraph_id = p.id
`

type Row = Record<string, unknown>

export class CorpusDb {
  private readonly db: Database
  private readonly codec: TextCodec
  private readonly collection: BookCollection

  private constructor(db: Database, codec: TextCodec, collection: BookCollection) {
    this.db = db
    this.codec = codec
    this.collection = collection
  }

  static async open(dbPath: string, collection: BookCollection): Promise<CorpusDb> {
    await ensureZstd()
    const db = await openDb(dbPath)
    const dict = db.selectValue(
      `SELECT value FROM corpus_meta WHERE key='zstd_dict'`,
    ) as Uint8Array
    const codec = new TextCodec(dict, (id) => {
      const blob = db.selectValue('SELECT data FROM text_chunks WHERE id = ?', [id])
      if (!blob) throw new Error(`Missing text chunk ${id}`)
      return blob as Uint8Array
    })
    return new CorpusDb(db, codec, collection)
  }

  private rows(sql: string, params: unknown[] = []): Row[] {
    return this.db.exec({
      sql,
      bind: params,
      rowMode: 'object',
      returnValue: 'resultRows',
    }) as unknown as Row[]
  }

  private toBook(r: Row): BookRow {
    return {
      id: String(r.id),
      code: String(r.code),
      title: String(r.title),
      author: String(r.author),
      collection: String(r.collection) as BookCollection,
      year: r.year == null ? null : Number(r.year),
      chapter_count: Number(r.chapter_count),
      paragraph_count: Number(r.paragraph_count),
    }
  }

  private bookSelect(): string {
    return `
      SELECT id, code, title, COALESCE(author,'Ellen G. White') AS author,
             COALESCE(collection, '${this.collection}') AS collection,
             year, chapter_count, paragraph_count
      FROM books
    `
  }

  books(): BookRow[] {
    return this.rows(`${this.bookSelect()} ORDER BY title`).map((r) => this.toBook(r))
  }

  book(id: string): BookRow | null {
    const r = this.rows(`${this.bookSelect()} WHERE id = ?`, [id])[0]
    return r ? this.toBook(r) : null
  }

  chapters(bookId: string): ChapterRow[] {
    return this.rows(
      'SELECT id, book_id, number, title FROM chapters WHERE book_id = ? ORDER BY number',
      [bookId],
    ).map((r) => ({
      id: Number(r.id),
      book_id: String(r.book_id),
      number: Number(r.number),
      title: String(r.title),
    }))
  }

  private toParagraph(r: Row): ParagraphRow {
    const reference =
      r.ref_exception != null
        ? String(r.ref_exception)
        : composeReference(
            { prefix: String(r.ref_prefix ?? ''), hasPara: Number(r.ref_has_para) === 1 },
            Number(r.page_num),
            Number(r.para_num),
          )
    return {
      id: Number(r.id),
      book_id: String(r.book_id),
      chapter_id: Number(r.chapter_id),
      chapter_num: Number(r.chapter_num),
      page_num: Number(r.page_num),
      para_num: Number(r.para_num),
      reference,
      text: this.codec.read(Number(r.chunk_id), Number(r.chunk_off), Number(r.chunk_len)),
    }
  }

  chapterParagraphs(bookId: string, chapterNum: number): ParagraphRow[] {
    return this.rows(
      `SELECT ${PARA_COLS} FROM paragraphs p ${PARA_JOINS}
       WHERE p.book_id = ? AND p.chapter_num = ?
       ORDER BY p.puborder, p.page_num, p.para_num`,
      [bookId, chapterNum],
    ).map((r) => this.toParagraph(r))
  }

  paragraph(id: number): ParagraphRow | null {
    const r = this.rows(`SELECT ${PARA_COLS} FROM paragraphs p ${PARA_JOINS} WHERE p.id = ?`, [
      id,
    ])[0]
    return r ? this.toParagraph(r) : null
  }

  search(ftsQuery: string, rawQuery: string, limit: number, bookId?: string): SearchHit[] {
    const params: unknown[] = [ftsQuery]
    let filter = ''
    if (bookId) {
      filter = 'AND p.book_id = ?'
      params.push(bookId)
    }
    params.push(limit)

    return this.rows(
      `SELECT ${PARA_COLS},
              b.title AS book_title, b.code AS book_code,
              COALESCE(b.author,'Ellen G. White') AS book_author,
              COALESCE(b.collection, '${this.collection}') AS collection,
              c.title AS chapter_title,
              bm25(paragraphs_fts) AS rank
       FROM paragraphs_fts
       JOIN paragraphs p ON paragraphs_fts.rowid = p.id
       JOIN books b ON p.book_id = b.id
       JOIN chapters c ON p.chapter_id = c.id
       ${PARA_JOINS}
       WHERE paragraphs_fts MATCH ? ${filter}
       ORDER BY rank LIMIT ?`,
      params,
    ).map((r) => {
      const para = this.toParagraph(r)
      return {
        ...para,
        book_title: String(r.book_title),
        book_code: String(r.book_code),
        book_author: String(r.book_author),
        collection: String(r.collection) as BookCollection,
        chapter_title: String(r.chapter_title),
        snippet: makeSnippet(para.text, rawQuery),
        rank: Number(r.rank),
      }
    })
  }

  lookup(ref: string, parsed: ParsedReference | null): ParagraphRow | null {
    if (parsed) {
      const r = this.rows(
        `SELECT ${PARA_COLS} FROM paragraphs p ${PARA_JOINS}
         JOIN books b ON p.book_id = b.id
         WHERE UPPER(b.code) = ? AND p.page_num = ? AND p.para_num = ? LIMIT 1`,
        [parsed.code, parsed.page, parsed.para],
      )[0]
      if (r) return this.toParagraph(r)
    }

    // idx_paragraphs_ref no longer exists, so fall back to composing references
    // for the named book only, capped so a bad code cannot scan the corpus.
    const normalized = ref.trim().replace(/\s+/g, ' ').toUpperCase()
    const code = normalized.split(' ')[0] ?? ''
    const candidates = this.rows(
      `SELECT ${PARA_COLS} FROM paragraphs p ${PARA_JOINS}
       JOIN books b ON p.book_id = b.id
       WHERE UPPER(b.code) = ? LIMIT 5000`,
      [code],
    )
    for (const r of candidates) {
      const para = this.toParagraph(r)
      if (para.reference.toUpperCase() === normalized) return para
    }
    return null
  }

  close(): void {
    this.codec.dispose()
    this.db.close()
  }
}
