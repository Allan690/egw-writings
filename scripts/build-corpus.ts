import 'dotenv/config'
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import {
  buildFtsIndex,
  createCorpusSchema,
  prepareCorpusStatements,
} from './corpus-schema'
import {
  bookIdFromCode,
  createEgwClient,
  EGW_SOURCE,
  findFolder,
  type EgwBook,
} from './egw-api'
import { parseEgwBookZip } from './parse-egw-book'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../public/corpus')
const DB_PATH = join(OUT_DIR, 'egw.sqlite')

const CONCURRENCY = Number(process.env.EGW_DOWNLOAD_CONCURRENCY ?? 3)
const BOOK_FOLDERS = (process.env.EGW_FOLDERS ?? 'Books,Devotionals').split(',').map((s) => s.trim())

async function fetchBookCatalog(client: Awaited<ReturnType<typeof createEgwClient>>) {
  const folders = await client.getFolders('en')
  const books: EgwBook[] = []
  const seen = new Set<number>()

  for (const folderName of BOOK_FOLDERS) {
    const folder = findFolder(folders, folderName)
    if (!folder) {
      console.warn(`Folder not found: ${folderName}`)
      continue
    }
    const list = await client.getBooksByFolder(folder.folder_id)
    for (const book of list) {
      if (seen.has(book.book_id)) continue
      seen.add(book.book_id)
      books.push(book)
    }
    console.log(`${folderName}: ${list.length} books`)
  }

  return books.sort((a, b) => a.title.localeCompare(b.title))
}

function insertParsedBook(
  db: Database.Database,
  book: EgwBook,
  parsed: ReturnType<typeof parseEgwBookZip>,
  stmts: ReturnType<typeof prepareCorpusStatements>,
) {
  const localId = bookIdFromCode(book.code)

  stmts.insertBook.run({
    id: localId,
    apiBookId: book.book_id,
    code: book.code,
    title: book.title,
    author: book.author || 'Ellen G. White',
    collection: 'egw',
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
      stmts.insertParagraphAuto.run({
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
  console.log('Fetching Ellen G. White catalog from EGW Writings API…\n')
  const catalog = await fetchBookCatalog(client)
  console.log(`\nTotal: ${catalog.length} EGW books to download\n`)

  const db = new Database(DB_PATH)
  createCorpusSchema(db)
  const stmts = prepareCorpusStatements(db)

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

      const stats = insertParsedBook(db, book, parsed, stmts)
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
    version: 4,
    collection: 'egw',
    builtAt: new Date().toISOString(),
    source: EGW_SOURCE,
    bookCount: bookCount.c,
    paragraphCount: stats.c,
    failedBooks: failed,
    dbPath: '/corpus/egw.sqlite',
    dbSizeMb: Number((size.s / 1024 / 1024).toFixed(1)),
    books: catalog.map((b) => ({
      id: bookIdFromCode(b.code),
      apiBookId: b.book_id,
      code: b.code,
      title: b.title,
      author: b.author || 'Ellen G. White',
      collection: 'egw',
    })),
  }

  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

  console.log(
    `\nDone! ${bookCount.c} EGW books, ${stats.c.toLocaleString()} paragraphs (${manifest.dbSizeMb} MB)`,
  )
  if (failed) console.log(`${failed} books failed or were empty.`)
  console.log(`Database: ${DB_PATH}`)

  db.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
