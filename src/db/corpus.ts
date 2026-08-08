import {
  getBook,
  getBooks,
  getChapterParagraphs,
  getChapters,
  getParagraph,
  egwCorpusInstalled,
  initCorpusEngine,
  isPioneerCorpusReady,
  lookupByReference,
  parseReference,
  removePioneerCorpus,
  searchCorpus,
  type InstallProgress,
} from './searchEngine'
import type { BookCollection } from '../lib/corpusConstants'

let initPromise: ReturnType<typeof initCorpusEngine> | null = null

export function initCorpus(onProgress?: InstallProgress) {
  if (!initPromise) {
    initPromise = initCorpusEngine(onProgress).catch((err) => {
      initPromise = null
      throw err
    })
  }
  return initPromise
}

export const searchApi = {
  init: initCorpusEngine,
  search: (query: string, limit?: number, bookId?: string, collection?: BookCollection | 'all') =>
    searchCorpus(query, limit, bookId, collection),
  getBooks: (collection?: BookCollection | 'all') => getBooks(collection),
  getBook,
  getChapters,
  getChapterParagraphs,
  getParagraph: (id: number, bookId?: string) => getParagraph(id, bookId),
  lookupByReference,
  parseReference,
  isPioneerReady: isPioneerCorpusReady,
  egwInstalled: egwCorpusInstalled,
  removePioneers: removePioneerCorpus,
  getContext: async (paragraphId: number, bookId?: string, radius = 2) => {
    const base = await getParagraph(paragraphId, bookId)
    if (!base) return []
    const paras = await getChapterParagraphs(base.book_id, base.chapter_num)
    const idx = paras.findIndex((p) => p.id === paragraphId)
    if (idx < 0) return []
    return paras.slice(Math.max(0, idx - radius), idx + radius + 1)
  },
}

export function getSearchApi() {
  return searchApi
}
