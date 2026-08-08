import * as Comlink from 'comlink'
import { isPioneerBookId, PIONEER_PARAGRAPH_OFFSET } from '../lib/corpusConstants'
import type { BookCollection } from '../lib/corpusConstants'
import type { CorpusApi } from './corpus.worker'
import type { BookRow, ChapterRow, ParagraphRow, SearchHit } from './types'

export type { BookRow, ChapterRow, ParagraphRow, SearchHit } from './types'
export { isPioneerBookId, PIONEER_PARAGRAPH_OFFSET }
export type { BookCollection }

let remote: Comlink.Remote<CorpusApi> | null = null
let workerRef: Worker | null = null

function api(): Comlink.Remote<CorpusApi> {
  if (!remote) {
    workerRef = new Worker(new URL('./corpus.worker.ts', import.meta.url), { type: 'module' })
    remote = Comlink.wrap<CorpusApi>(workerRef)
  }
  return remote
}

// Without this, every HMR update leaves the previous worker alive holding the
// OPFS sync access handles, and the replacement fails to acquire them.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    workerRef?.terminate()
    workerRef = null
    remote = null
    initPromise = null
  })
}

let initPromise: Promise<{ bookCount: number; paragraphCount: number }> | null = null

export type InstallProgress = (received: number, total: number | null) => void

export function initCorpusEngine(onProgress?: InstallProgress) {
  if (!initPromise) {
    // Comlink.proxy is required — a bare callback cannot cross the worker boundary.
    initPromise = api().init(onProgress ? Comlink.proxy(onProgress) : undefined)
  }
  return initPromise
}

/** Whether the EGW corpus is already on disk — decides download vs. open copy. */
export function egwCorpusInstalled(): Promise<boolean> {
  return api().egwInstalled()
}

export async function removePioneerCorpus(): Promise<void> {
  await api().removePioneers()
}

export async function searchCorpus(
  query: string,
  limit = 30,
  bookId?: string,
  collection?: BookCollection | 'all',
): Promise<SearchHit[]> {
  await initCorpusEngine()
  return api().search(query, limit, bookId, collection)
}

export async function getBooks(collection?: BookCollection | 'all'): Promise<BookRow[]> {
  await initCorpusEngine()
  return api().getBooks(collection)
}

export async function getBook(bookId: string): Promise<BookRow | null> {
  await initCorpusEngine()
  return api().getBook(bookId)
}

export async function getChapters(bookId: string): Promise<ChapterRow[]> {
  await initCorpusEngine()
  return api().getChapters(bookId)
}

export async function getChapterParagraphs(
  bookId: string,
  chapterNum: number,
): Promise<ParagraphRow[]> {
  await initCorpusEngine()
  return api().getChapterParagraphs(bookId, chapterNum)
}

export async function getParagraph(id: number, bookId?: string): Promise<ParagraphRow | null> {
  await initCorpusEngine()
  return api().getParagraph(id, bookId)
}

export async function lookupByReference(ref: string): Promise<ParagraphRow | null> {
  await initCorpusEngine()
  return api().lookupByReference(ref)
}

export async function isPioneerCorpusReady(): Promise<boolean> {
  return api().isPioneerReady()
}

export async function installPioneers(
  onProgress: (received: number, total: number | null) => void,
): Promise<void> {
  await initCorpusEngine()
  // Comlink.proxy is required — a bare callback cannot cross the worker boundary.
  return api().installPioneers(Comlink.proxy(onProgress))
}

export function pioneerCorpusAvailable(): Promise<boolean> {
  return fetch('/corpus/pioneers-manifest.json', { method: 'HEAD' })
    .then((r) => r.ok)
    .catch(() => false)
}

/**
 * Kept synchronous and duplicated from the worker: ReferenceLookup validates
 * on every keystroke and must not await a worker round-trip to do it.
 */
export function parseReference(input: string): { code: string; page: number; para: number } | null {
  const match = input.trim().match(/^([A-Za-z]{1,5}\d?[A-Za-z]?)\s*(\d+)\.(\d+)\.?$/)
  if (!match) return null
  return {
    code: match[1]!.toUpperCase(),
    page: Number.parseInt(match[2]!, 10),
    para: Number.parseInt(match[3]!, 10),
  }
}
