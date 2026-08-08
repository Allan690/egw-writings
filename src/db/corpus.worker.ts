import * as Comlink from 'comlink'
import { CorpusDb } from './corpusQueries'
import { installCorpus } from './corpusInstaller'
import { dbExists } from './opfsPool'
import { isOpfsSupported } from '../lib/opfsSupport'
import { isPioneerBookId, PIONEER_PARAGRAPH_OFFSET } from '../lib/corpusConstants'
import type { BookCollection } from '../lib/corpusConstants'
import type { BookRow, ChapterRow, ParagraphRow, SearchHit } from './types'

const EGW_DB = '/egw.sqlite'
const PIONEER_DB = '/pioneers.sqlite'
const EGW_URL = '/corpus/egw.sqlite'
const PIONEER_URL = '/corpus/pioneers.sqlite'

let egw: CorpusDb | null = null
let pioneer: CorpusDb | null = null

function buildFtsQuery(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed
  const terms = trimmed
    .split(/\s+/)
    .map((t) => t.replace(/[^\w'-]/g, ''))
    .filter(Boolean)
  if (terms.length === 0) return ''
  return terms.map((t) => `"${t}"*`).join(' AND ')
}

function parseReference(input: string) {
  const match = input.trim().match(/^([A-Za-z]{1,5}\d?[A-Za-z]?)\s*(\d+)\.(\d+)\.?$/)
  if (!match) return null
  return {
    code: match[1]!.toUpperCase(),
    page: Number.parseInt(match[2]!, 10),
    para: Number.parseInt(match[3]!, 10),
  }
}

function dbForBook(bookId: string): CorpusDb {
  if (isPioneerBookId(bookId)) {
    if (!pioneer) throw new Error('Pioneer library still downloading')
    return pioneer
  }
  if (!egw) throw new Error('Corpus not loaded')
  return egw
}

const api = {
  opfsSupported(): boolean {
    return isOpfsSupported()
  },

  async init() {
    if (!isOpfsSupported()) {
      throw new Error('This browser does not support OPFS storage. Please use a newer browser.')
    }
    if (!egw) {
      if (!(await dbExists(EGW_DB))) {
        await installCorpus(EGW_URL, EGW_DB)
      }
      egw = await CorpusDb.open(EGW_DB, 'egw')
    }
    if (!pioneer && (await dbExists(PIONEER_DB))) {
      pioneer = await CorpusDb.open(PIONEER_DB, 'pioneer')
    }
    const books = egw.books()
    return {
      bookCount: books.length,
      paragraphCount: books.reduce((n, b) => n + b.paragraph_count, 0),
    }
  },

  isPioneerReady(): boolean {
    return pioneer !== null
  },

  async installPioneers(onProgress?: (received: number, total: number | null) => void) {
    if (pioneer) return
    if (!(await dbExists(PIONEER_DB))) {
      await installCorpus(PIONEER_URL, PIONEER_DB, onProgress)
    }
    pioneer = await CorpusDb.open(PIONEER_DB, 'pioneer')
  },

  async search(
    query: string,
    limit: number,
    bookId?: string,
    collection?: BookCollection | 'all',
  ): Promise<SearchHit[]> {
    const fts = buildFtsQuery(query)
    if (!fts || !egw) return []

    const hits: SearchHit[] = []
    const wantEgw = collection !== 'pioneer' && (!bookId || !isPioneerBookId(bookId))
    const wantPioneer =
      collection !== 'egw' && pioneer !== null && (!bookId || isPioneerBookId(bookId))

    if (wantEgw) hits.push(...egw.search(fts, query, limit, bookId))
    if (wantPioneer) hits.push(...pioneer!.search(fts, query, limit, bookId))

    hits.sort((a, b) => a.rank - b.rank)
    return hits.slice(0, limit)
  },

  async getBooks(collection?: BookCollection | 'all'): Promise<BookRow[]> {
    const rows: BookRow[] = []
    if (collection !== 'pioneer' && egw) rows.push(...egw.books())
    if (collection !== 'egw' && pioneer) rows.push(...pioneer.books())
    return rows.sort((a, b) => a.title.localeCompare(b.title))
  },

  async getBook(bookId: string): Promise<BookRow | null> {
    return dbForBook(bookId).book(bookId)
  },

  async getChapters(bookId: string): Promise<ChapterRow[]> {
    return dbForBook(bookId).chapters(bookId)
  },

  async getChapterParagraphs(bookId: string, chapterNum: number): Promise<ParagraphRow[]> {
    return dbForBook(bookId).chapterParagraphs(bookId, chapterNum)
  },

  async getParagraph(id: number, bookId?: string): Promise<ParagraphRow | null> {
    if (bookId) return dbForBook(bookId).paragraph(id)
    if (id >= PIONEER_PARAGRAPH_OFFSET) {
      if (!pioneer) throw new Error('Pioneer library still downloading')
      return pioneer.paragraph(id)
    }
    if (!egw) throw new Error('Corpus not loaded')
    return egw.paragraph(id)
  },

  async lookupByReference(ref: string): Promise<ParagraphRow | null> {
    const parsed = parseReference(ref)
    const hit = egw?.lookup(ref, parsed) ?? null
    if (hit) return hit
    return pioneer?.lookup(ref, parsed) ?? null
  },
}

export type CorpusApi = typeof api

Comlink.expose(api)
