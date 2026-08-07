import {
  getBooks,
  getChapterParagraphs,
  getChapters,
  getParagraph,
  initCorpusEngine,
  lookupByReference,
  parseReference,
  searchCorpus,
} from './searchEngine'

let initPromise: ReturnType<typeof initCorpusEngine> | null = null

export function initCorpus() {
  if (!initPromise) {
    initPromise = initCorpusEngine().catch((err) => {
      initPromise = null
      throw err
    })
  }
  return initPromise
}

export const searchApi = {
  init: initCorpusEngine,
  search: searchCorpus,
  getBooks,
  getChapters,
  getChapterParagraphs,
  getParagraph,
  lookupByReference,
  parseReference,
  getContext: async (paragraphId: number, radius = 2) => {
    const base = await getParagraph(paragraphId)
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
