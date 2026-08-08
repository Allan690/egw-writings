import type Database from 'better-sqlite3'

export const PIONEER_BOOK_PREFIX = 'p-'
export const PIONEER_PARAGRAPH_OFFSET = 10_000_000
export type BookCollection = 'egw' | 'pioneer'

export function pioneerBookId(apiBookId: number): string {
  return `${PIONEER_BOOK_PREFIX}${apiBookId}`
}

export function createCorpusSchema(db: Database.Database) {
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;

    CREATE TABLE books (
      id TEXT PRIMARY KEY,
      api_book_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      collection TEXT NOT NULL,
      year INTEGER,
      chapter_count INTEGER NOT NULL DEFAULT 0,
      paragraph_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX idx_books_collection ON books(collection);

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
      puborder INTEGER NOT NULL DEFAULT 0,
      reference TEXT NOT NULL,
      text TEXT NOT NULL
    );

    CREATE INDEX idx_paragraphs_book ON paragraphs(book_id);
    CREATE INDEX idx_paragraphs_chapter ON paragraphs(chapter_id);
    CREATE INDEX idx_paragraphs_order ON paragraphs(book_id, chapter_num, puborder);
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

export function createCorpusSchemaV5(db: Database.Database) {
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;

    CREATE TABLE books (
      id TEXT PRIMARY KEY,
      api_book_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      collection TEXT NOT NULL,
      year INTEGER,
      chapter_count INTEGER NOT NULL DEFAULT 0,
      paragraph_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX idx_books_collection ON books(collection);

    CREATE TABLE chapters (
      id INTEGER PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id),
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      UNIQUE(book_id, number)
    );

    CREATE TABLE text_chunks (
      id INTEGER PRIMARY KEY,
      data BLOB NOT NULL
    );

    CREATE TABLE ref_templates (
      id INTEGER PRIMARY KEY,
      prefix TEXT NOT NULL,
      has_para INTEGER NOT NULL,
      UNIQUE(prefix, has_para)
    );

    CREATE TABLE paragraphs (
      id INTEGER PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id),
      chapter_id INTEGER NOT NULL REFERENCES chapters(id),
      chapter_num INTEGER NOT NULL,
      page_num INTEGER NOT NULL,
      para_num INTEGER NOT NULL,
      puborder INTEGER NOT NULL DEFAULT 0,
      ref_template_id INTEGER REFERENCES ref_templates(id),
      chunk_id INTEGER NOT NULL REFERENCES text_chunks(id),
      chunk_off INTEGER NOT NULL,
      chunk_len INTEGER NOT NULL
    );

    CREATE INDEX idx_paragraphs_order ON paragraphs(book_id, chapter_num, puborder);

    CREATE TABLE ref_exceptions (
      paragraph_id INTEGER PRIMARY KEY REFERENCES paragraphs(id),
      reference TEXT NOT NULL
    );

    CREATE TABLE corpus_meta (
      key TEXT PRIMARY KEY,
      value BLOB NOT NULL
    );

    CREATE VIRTUAL TABLE paragraphs_fts USING fts5(
      text,
      content='',
      tokenize='porter unicode61'
    );
  `)
}

export function prepareCorpusStatements(db: Database.Database) {
  return {
    insertBook: db.prepare(`
      INSERT INTO books (id, api_book_id, code, title, author, collection, year, chapter_count, paragraph_count)
      VALUES (@id, @apiBookId, @code, @title, @author, @collection, @year, @chapterCount, @paragraphCount)
    `),
    insertChapter: db.prepare(`
      INSERT INTO chapters (book_id, number, title) VALUES (@bookId, @number, @title)
    `),
    insertParagraph: db.prepare(`
      INSERT INTO paragraphs (id, book_id, chapter_id, chapter_num, page_num, para_num, puborder, reference, text)
      VALUES (@id, @bookId, @chapterId, @chapterNum, @pageNum, @paraNum, @puborder, @reference, @text)
    `),
    insertParagraphAuto: db.prepare(`
      INSERT INTO paragraphs (book_id, chapter_id, chapter_num, page_num, para_num, puborder, reference, text)
      VALUES (@bookId, @chapterId, @chapterNum, @pageNum, @paraNum, @puborder, @reference, @text)
    `),
  }
}

export function buildFtsIndex(db: Database.Database) {
  db.exec(`
    INSERT INTO paragraphs_fts(rowid, reference, text, book_id, chapter_num, page_num, para_num)
    SELECT id, reference, text, book_id, chapter_num, page_num, para_num FROM paragraphs;
  `)
  db.exec('ANALYZE;')
  db.exec('VACUUM;')
}
