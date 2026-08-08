import Database from 'better-sqlite3'
import { existsSync, unlinkSync } from 'node:fs'
import { createCorpusSchemaV5 } from './corpus-schema'
import { compressChunks, trainDictionary } from './lib/zstdDict'
import { deriveTemplate } from '../src/lib/referenceCodec'
import { planChunks } from '../src/lib/textChunks'

export interface OptimizeStats {
  paragraphs: number
  chunks: number
  templates: number
  exceptions: number
  dictBytes: number
}

interface SrcParagraph {
  id: number
  book_id: string
  chapter_id: number
  chapter_num: number
  page_num: number
  para_num: number
  puborder: number
  reference: string
  text: string
}

export async function optimizeCorpus(srcPath: string, outPath: string): Promise<OptimizeStats> {
  if (existsSync(outPath)) unlinkSync(outPath)

  const src = new Database(srcPath, { readonly: true })
  const out = new Database(outPath)
  createCorpusSchemaV5(out)

  // Books and chapters copy across unchanged.
  const books = src.prepare('SELECT * FROM books').all() as any[]
  const insBook = out.prepare(
    `INSERT INTO books (id, api_book_id, code, title, author, collection, year, chapter_count, paragraph_count)
     VALUES (@id, @api_book_id, @code, @title, @author, @collection, @year, @chapter_count, @paragraph_count)`,
  )
  out.transaction(() => books.forEach((b) => insBook.run(b)))()

  const chapters = src.prepare('SELECT id, book_id, number, title FROM chapters').all() as any[]
  const insChapter = out.prepare(
    'INSERT INTO chapters (id, book_id, number, title) VALUES (@id, @book_id, @number, @title)',
  )
  out.transaction(() => chapters.forEach((c) => insChapter.run(c)))()

  const paragraphs = src
    .prepare(
      `SELECT id, book_id, chapter_id, chapter_num, page_num, para_num, puborder, reference, text
       FROM paragraphs ORDER BY id`,
    )
    .all() as SrcParagraph[]

  // 1. Chunk and compress the text.
  const { chunks, slices } = planChunks(paragraphs.map((p) => p.text))
  const dict = await trainDictionary(chunks)
  const compressed = await compressChunks(chunks, dict)

  const insChunk = out.prepare('INSERT INTO text_chunks (id, data) VALUES (?, ?)')
  out.transaction(() => compressed.forEach((c, i) => insChunk.run(i, Buffer.from(c))))()

  out.prepare('INSERT INTO corpus_meta (key, value) VALUES (?, ?)').run('zstd_dict', Buffer.from(dict))

  // 2. Derive reference templates, deduplicated by (prefix, has_para).
  const templateIds = new Map<string, number>()
  const insTemplate = out.prepare(
    'INSERT INTO ref_templates (id, prefix, has_para) VALUES (?, ?, ?)',
  )
  const templateIdFor = (prefix: string, hasPara: boolean): number => {
    const key = `${hasPara ? '1' : '0'} ${prefix}`
    const found = templateIds.get(key)
    if (found !== undefined) return found
    const id = templateIds.size + 1
    templateIds.set(key, id)
    insTemplate.run(id, prefix, hasPara ? 1 : 0)
    return id
  }

  const insParagraph = out.prepare(
    `INSERT INTO paragraphs (id, book_id, chapter_id, chapter_num, page_num, para_num, puborder,
                             ref_template_id, chunk_id, chunk_off, chunk_len)
     VALUES (@id, @book_id, @chapter_id, @chapter_num, @page_num, @para_num, @puborder,
             @ref_template_id, @chunk_id, @chunk_off, @chunk_len)`,
  )
  const insException = out.prepare(
    'INSERT INTO ref_exceptions (paragraph_id, reference) VALUES (?, ?)',
  )

  let exceptions = 0
  out.transaction(() => {
    paragraphs.forEach((p, i) => {
      const template = deriveTemplate(p.reference, p.page_num, p.para_num)
      const slice = slices[i]!
      insParagraph.run({
        id: p.id,
        book_id: p.book_id,
        chapter_id: p.chapter_id,
        chapter_num: p.chapter_num,
        page_num: p.page_num,
        para_num: p.para_num,
        puborder: p.puborder,
        ref_template_id: template ? templateIdFor(template.prefix, template.hasPara) : null,
        chunk_id: slice.chunkId,
        chunk_off: slice.off,
        chunk_len: slice.len,
      })
      if (!template) {
        insException.run(p.id, p.reference)
        exceptions += 1
      }
    })
  })()

  // 3. Build the contentless FTS index from the source text.
  const insFts = out.prepare('INSERT INTO paragraphs_fts(rowid, text) VALUES (?, ?)')
  out.transaction(() => paragraphs.forEach((p) => insFts.run(p.id, p.text)))()

  out.exec('ANALYZE; VACUUM;')

  const stats: OptimizeStats = {
    paragraphs: paragraphs.length,
    chunks: compressed.length,
    templates: templateIds.size,
    exceptions,
    dictBytes: dict.length,
  }

  src.close()
  out.close()
  return stats
}
