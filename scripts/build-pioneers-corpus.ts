import 'dotenv/config'
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import {
  buildFtsIndex,
  createCorpusSchema,
  PIONEER_PARAGRAPH_OFFSET,
  pioneerBookId,
  prepareCorpusStatements,
} from './corpus-schema'
import { createEgwClient, fetchPioneerCatalog, PIONEER_SOURCE, type PioneerBook } from './egw-api'
import { parseEgwBookZip } from './parse-egw-book'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../public/corpus')
const DB_PATH = join(OUT_DIR, 'pioneers.sqlite')

const CONCURRENCY = Number(process.env.EGW_DOWNLOAD_CONCURRENCY ?? 3)

function insertParsedBook(
  db: Database.Database,
  book: PioneerBook,
  parsed: ReturnType<typeof parseEgwBookZip>,
  stmts: ReturnType<typeof prepareCorpusStatements>,
  nextParagraphId: { value: number },
) {
  const localId = pioneerBookId(book.book_id)

  stmts.insertBook.run({
    id: localId,
    apiBookId: book.book_id,
    code: book.code,
    title: book.title,
    author: book.authorLabel,
    collection: 'pioneer',
    year: book.pub_year ? Number.parseInt(book.pub_year, 10) : null,
    chapterCount: 0,
    paragraphCount: 0,
  })

  const chapterIdByNum = new Map<number, number>()
  for (const ch of parsed.chapters) {
    const info = stmts.insertChapter.run({
      bookId: localId,
      number: ch.number,
      title: ch.title,
    })
    chapterIdByNum.set(ch.number, Number(info.lastInsertRowid))
  }

  const insertMany = db.transaction((rows: typeof parsed.paragraphs) => {
    for (const p of rows) {
      const chapterId = chapterIdByNum.get(p.chapterNum)
      if (!chapterId) continue
      stmts.insertParagraph.run({
        id: nextParagraphId.value++,
        bookId: localId,
        chapterId,
        chapterNum: p.chapterNum,
        pageNum: p.pageNum,
        paraNum: p.paraNum,
        puborder: p.puborder,
        reference: p.reference,
        text: p.text,
      })
    }
  })
  insertMany(parsed.paragraphs)

  db.prepare(`
    UPDATE books SET chapter_count = ?, paragraph_count = ? WHERE id = ?
  `).run(parsed.chapters.length, parsed.paragraphs.length, localId)

  return { chapters: parsed.chapters.length, paragraphs: parsed.paragraphs.length }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH)

  const client = await createEgwClient()
  console.log('Fetching Adventist Pioneer Library catalog…\n')
  const catalog = await fetchPioneerCatalog(client)
  console.log(`\nTotal: ${catalog.length} pioneer books to download\n`)

  const db = new Database(DB_PATH)
  createCorpusSchema(db)
  const stmts = prepareCorpusStatements(db)
  const nextParagraphId = { value: PIONEER_PARAGRAPH_OFFSET }

  let failed = 0

  for (let i = 0; i < catalog.length; i += CONCURRENCY) {
    const batch = catalog.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (book, batchIndex) => {
        const index = i + batchIndex
        const label = `[${index + 1}/${catalog.length}]`
        try {
          process.stdout.write(`${label} ${book.code} — ${book.title}… `)
          const zip = await client.downloadBookZip(book.book_id)
          const parsed = parseEgwBookZip(zip)
          return { book, parsed, error: null as string | null }
        } catch (err) {
          return {
            book,
            parsed: null,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      }),
    )

    for (const { book, parsed, error } of results) {
      if (error || !parsed) {
        failed++
        console.log(`FAILED: ${error}`)
        continue
      }
      if (parsed.paragraphs.length === 0) {
        failed++
        console.log('skipped (no paragraphs)')
        continue
      }

      const stats = insertParsedBook(db, book, parsed, stmts, nextParagraphId)
      console.log(`${stats.chapters} ch / ${stats.paragraphs} ¶`)
    }
  }

  console.log('\nBuilding FTS5 index…')
  buildFtsIndex(db)

  const stats = db.prepare('SELECT COUNT(*) as c FROM paragraphs').get() as { c: number }
  const bookCount = db.prepare('SELECT COUNT(*) as c FROM books').get() as { c: number }
  const size = db.prepare(
    'SELECT page_count * page_size as s FROM pragma_page_count(), pragma_page_size()',
  ).get() as { s: number }

  const manifest = {
    version: 1,
    collection: 'pioneer',
    builtAt: new Date().toISOString(),
    source: PIONEER_SOURCE,
    bookCount: bookCount.c,
    paragraphCount: stats.c,
    failedBooks: failed,
    dbPath: '/corpus/pioneers.sqlite',
    dbSizeMb: Number((size.s / 1024 / 1024).toFixed(1)),
    paragraphIdOffset: PIONEER_PARAGRAPH_OFFSET,
    books: catalog.map((b) => ({
      id: pioneerBookId(b.book_id),
      apiBookId: b.book_id,
      code: b.code,
      title: b.title,
      author: b.authorLabel,
      collection: 'pioneer',
    })),
  }

  writeFileSync(join(OUT_DIR, 'pioneers-manifest.json'), JSON.stringify(manifest, null, 2))

  console.log(
    `\nDone! ${bookCount.c} pioneer books, ${stats.c.toLocaleString()} paragraphs (${manifest.dbSizeMb} MB)`,
  )
  if (failed) console.log(`${failed} books failed or were empty.`)
  console.log(`Database: ${DB_PATH}`)

  db.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
