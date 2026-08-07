import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { ARCHIVE_SOURCE, fetchArchiveCatalog, type ArchiveBook } from './archive-books'
import { parseArchiveDjvu } from './parse-archive-djvu'
import type { ParsedParagraph } from './parse-ccel'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../public/corpus')
const DB_PATH = join(OUT_DIR, 'egw.sqlite')

const CONCURRENCY = 4

function createSchema(db: Database.Database) {
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;

    CREATE TABLE books (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      year INTEGER,
      chapter_count INTEGER NOT NULL DEFAULT 0,
      paragraph_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL REFERENCES books(id),
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      UNIQUE(book_id, number)
    );

    CREATE TABLE paragraphs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL REFERENCES books(id),
      chapter_id INTEGER NOT NULL REFERENCES chapters(id),
      chapter_num INTEGER NOT NULL,
      page_num INTEGER NOT NULL,
      para_num INTEGER NOT NULL,
      reference TEXT NOT NULL,
      text TEXT NOT NULL
    );

    CREATE INDEX idx_paragraphs_book ON paragraphs(book_id);
    CREATE INDEX idx_paragraphs_chapter ON paragraphs(chapter_id);
    CREATE INDEX idx_paragraphs_order ON paragraphs(book_id, chapter_num, page_num, para_num);
    CREATE INDEX idx_paragraphs_ref ON paragraphs(reference);

    CREATE VIRTUAL TABLE paragraphs_fts USING fts5(
      reference,
      text,
      book_id UNINDEXED,
      chapter_num UNINDEXED,
      page_num UNINDEXED,
      para_num UNINDEXED,
      content='paragraphs',
      content_rowid='id',
      tokenize='porter unicode61'
    );
  `)
}

async function fetchBookText(book: ArchiveBook): Promise<string> {
  const res = await fetch(book.url)
  if (!res.ok) throw new Error(`Failed to fetch ${book.filename}: ${res.status}`)
  return res.text()
}

function insertParsedBook(
  db: Database.Database,
  book: ArchiveBook,
  parsed: ParsedParagraph[],
  insertBook: Database.Statement,
  insertChapter: Database.Statement,
  insertParagraph: Database.Statement,
) {
  insertBook.run({
    id: book.id,
    code: book.code,
    title: book.title,
    year: null,
    chapterCount: 0,
    paragraphCount: 0,
  })

  const chapterMap = new Map<number, { title: string; id: number }>()
  for (const p of parsed) {
    if (!chapterMap.has(p.chapterNum)) {
      const info = insertChapter.run({
        bookId: book.id,
        number: p.chapterNum,
        title: p.chapterTitle,
      })
      chapterMap.set(p.chapterNum, {
        title: p.chapterTitle,
        id: Number(info.lastInsertRowid),
      })
    }
  }

  const insertMany = db.transaction((rows: ParsedParagraph[]) => {
    for (const p of rows) {
      const chapter = chapterMap.get(p.chapterNum)!
      insertParagraph.run({
        bookId: book.id,
        chapterId: chapter.id,
        chapterNum: p.chapterNum,
        pageNum: p.pageNum,
        paraNum: p.paraNum,
        reference: p.reference,
        text: p.text,
      })
    }
  })
  insertMany(parsed)

  db.prepare(`
    UPDATE books SET chapter_count = ?, paragraph_count = ? WHERE id = ?
  `).run(chapterMap.size, parsed.length, book.id)

  return { chapters: chapterMap.size, paragraphs: parsed.length }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH)

  console.log('Fetching Archive.org book catalog…')
  const catalog = await fetchArchiveCatalog()
  console.log(`Found ${catalog.length} books (${(catalog.reduce((n, b) => n + b.sizeBytes, 0) / 1024 / 1024).toFixed(1)} MB text)\n`)

  const db = new Database(DB_PATH)
  createSchema(db)

  const insertBook = db.prepare(`
    INSERT INTO books (id, code, title, year, chapter_count, paragraph_count)
    VALUES (@id, @code, @title, @year, @chapterCount, @paragraphCount)
  `)
  const insertChapter = db.prepare(`
    INSERT INTO chapters (book_id, number, title) VALUES (@bookId, @number, @title)
  `)
  const insertParagraph = db.prepare(`
    INSERT INTO paragraphs (book_id, chapter_id, chapter_num, page_num, para_num, reference, text)
    VALUES (@bookId, @chapterId, @chapterNum, @pageNum, @paraNum, @reference, @text)
  `)

  let totalParagraphs = 0
  let failed = 0

  for (let i = 0; i < catalog.length; i += CONCURRENCY) {
    const batch = catalog.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (book, batchIndex) => {
        const index = i + batchIndex
        const label = `[${index + 1}/${catalog.length}]`
        try {
          process.stdout.write(`${label} ${book.title}… `)
          const raw = await fetchBookText(book)
          const parsed = parseArchiveDjvu(book.id, book.code, raw)
          return { book, parsed, error: null as string | null }
        } catch (err) {
          return {
            book,
            parsed: [] as ParsedParagraph[],
            error: err instanceof Error ? err.message : String(err),
          }
        }
      }),
    )

    for (const { book, parsed, error } of results) {
      if (error) {
        failed++
        console.log(`FAILED: ${error}`)
        continue
      }
      if (parsed.length === 0) {
        failed++
        console.log('skipped (no paragraphs)')
        continue
      }

      const stats = insertParsedBook(
        db,
        book,
        parsed,
        insertBook,
        insertChapter,
        insertParagraph,
      )
      totalParagraphs += stats.paragraphs
      console.log(`${stats.chapters} ch / ${stats.paragraphs} ¶`)
    }
  }

  console.log('\nBuilding FTS5 index…')
  db.exec(`
    INSERT INTO paragraphs_fts(rowid, reference, text, book_id, chapter_num, page_num, para_num)
    SELECT id, reference, text, book_id, chapter_num, page_num, para_num FROM paragraphs;
  `)

  db.exec('ANALYZE;')
  db.exec('VACUUM;')

  const stats = db.prepare('SELECT COUNT(*) as c FROM paragraphs').get() as { c: number }
  const bookCount = db.prepare('SELECT COUNT(*) as c FROM books').get() as { c: number }
  const size = db.prepare(
    'SELECT page_count * page_size as s FROM pragma_page_count(), pragma_page_size()',
  ).get() as { s: number }

  const manifest = {
    version: 2,
    builtAt: new Date().toISOString(),
    source: ARCHIVE_SOURCE,
    bookCount: bookCount.c,
    paragraphCount: stats.c,
    failedBooks: failed,
    dbPath: '/corpus/egw.sqlite',
    dbSizeMb: Number((size.s / 1024 / 1024).toFixed(1)),
    books: catalog.map((b) => ({ id: b.id, code: b.code, title: b.title })),
  }

  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

  console.log(
    `\nDone! ${bookCount.c} books, ${stats.c.toLocaleString()} paragraphs (${manifest.dbSizeMb} MB)`,
  )
  if (failed) console.log(`${failed} books failed or were empty.`)
  console.log(`Database: ${DB_PATH}`)

  db.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
