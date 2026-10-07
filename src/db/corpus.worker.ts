import * as Comlink from 'comlink'
import { buildSearchPlan } from '../lib/searchPlan'
import { fuseSearchResults } from '../lib/searchRanking'
import { CorpusDb } from './corpusQueries'
import { installCorpus } from './corpusInstaller'
import { dbExists, removeDb } from './opfsPool'
import { isOpfsSupported } from '../lib/opfsSupport'
import { isPioneerBookId, PIONEER_PARAGRAPH_OFFSET } from '../lib/corpusConstants'
import type { BookCollection } from '../lib/corpusConstants'
import type { BookRow, ChapterRow, ParagraphRow, SearchHit } from './types'

const EGW_DB = '/egw.sqlite'
const PIONEER_DB = '/pioneers.sqlite'

/**
 * Where the prebuilt corpora are served from.
 *
 * These are build artifacts produced once by `npm run corpus:optimize`, never
 * rebuilt in CI or on device. pioneers.v5.sqlite is ~198MB, past GitHub's
 * 100MB per-file limit, so it is hosted outside the repo; set
 * VITE_CORPUS_BASE_URL to that origin (it must send permissive CORS headers).
 * Defaults to /corpus for local development, where the files sit in public/.
 */
const CORPUS_BASE = (import.meta.env.VITE_CORPUS_BASE_URL ?? '/corpus').replace(/\/$/, '')

// The v5 files are the built artifacts; egw.sqlite / pioneers.sqlite remain the
// raw API ingest that scripts/optimize-corpus.ts reads from and are not served.
const EGW_URL = `${CORPUS_BASE}/egw.v5.sqlite`
const PIONEER_URL = `${CORPUS_BASE}/pioneers.v5.sqlite`

let egw: CorpusDb | null = null
let pioneer: CorpusDb | null = null

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

  async init(onProgress?: (received: number, total: number | null) => void) {
    if (!isOpfsSupported()) {
      throw new Error('This browser does not support OPFS storage. Please use a newer browser.')
    }
    if (!egw) {
      if (!(await dbExists(EGW_DB))) {
        // Only the first visit downloads; onProgress drives the setup screen.
        await installCorpus(EGW_URL, EGW_DB, onProgress)
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

  /** True when the EGW corpus is already on disk, so no download is needed. */
  async egwInstalled(): Promise<boolean> {
    return dbExists(EGW_DB)
  },

  /** Frees the pioneer library from OPFS. EGW writings are untouched. */
  async removePioneers(): Promise<void> {
    pioneer?.close()
    pioneer = null
    await removeDb(PIONEER_DB)
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
    if (!egw || limit <= 0) return []
    const plan = buildSearchPlan(query)
    const databases: CorpusDb[] = []
    if (collection !== 'pioneer' && (!bookId || !isPioneerBookId(bookId))) databases.push(egw)
    if (collection !== 'egw' && pioneer && (!bookId || isPioneerBookId(bookId))) databases.push(pioneer)
    const parsed = parseReference(plan.normalized)
    if (parsed) {
      return databases.flatMap(db => {
        const hit = db.referenceHit(plan.normalized, parsed)
        return hit && (!bookId || hit.book_id === bookId) ? [hit] : []
      }).slice(0, limit)
    }
    const candidateLimit = Math.min(200, Math.max(limit * 3, 100))
    const lists = databases.flatMap(db => plan.lanes.map(lane => ({
      hits: db.search(lane.query, query, candidateLimit, bookId), weight: lane.weight,
    })))
    return fuseSearchResults(lists, plan, limit)
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
