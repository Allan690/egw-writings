import { expect, test } from '@playwright/test'
import { runInWorker } from './workerEval'

test('v5 query layer reproduces text, references, and search', async ({ page }) => {
  await page.goto('/')
  const result = await runInWorker<{
    error?: string
    bookCount?: number
    firstText?: string
    firstRef?: string
    hitCount?: number
    snippet?: string
    hitText?: string
    hitRef?: string
    chapterCount?: number
    phraseHits?: number
    lookupRef?: string | null
    pageOnlyRef?: string | null
  }>(
    page,
    `
    import { installCorpus } from '__ORIGIN__/src/db/corpusInstaller.ts'
    import { removeDb, dbExists } from '__ORIGIN__/src/db/opfsPool.ts'
    import { CorpusDb } from '__ORIGIN__/src/db/corpusQueries.ts'
    self.onmessage = async () => {
      try {
        if (!(await dbExists('/egw.sqlite'))) {
          await installCorpus('__ORIGIN__/corpus/egw.v5.sqlite', '/egw.sqlite')
        }
        const corpus = await CorpusDb.open('/egw.sqlite', 'egw')

        const books = corpus.books()
        const chapters = corpus.chapters(books[0].id)
        const paras = corpus.chapterParagraphs(books[0].id, chapters[0].number)
        const hits = corpus.search('"great" AND "controversy"', 'great controversy', 5)
        const phraseHits = corpus.search('"great controversy"', 'great controversy', 30).length
        const looked = corpus.lookup('CME 6.1', { code: 'CME', page: 6, para: 1 })
        const pageOnly = corpus.lookup('CME 6', { code: 'CME', page: 6, para: 9 })
        corpus.close()

        self.postMessage({
          bookCount: books.length,
          chapterCount: chapters.length,
          firstText: paras[0] ? paras[0].text : '',
          firstRef: paras[0] ? paras[0].reference : '',
          hitCount: hits.length,
          snippet: hits[0] ? hits[0].snippet : '',
          hitText: hits[0] ? hits[0].text : '',
          hitRef: hits[0] ? hits[0].reference : '',
          phraseHits,
          lookupRef: looked ? looked.reference : null,
          pageOnlyRef: pageOnly ? pageOnly.reference : null,
        })
      } catch (e) {
        self.postMessage({ error: String(e) + ' :: ' + (e && e.stack ? e.stack : '') })
      }
    }
  `,
  )

  expect(result.error).toBeUndefined()
  expect(result.bookCount).toBe(143)
  expect(result.chapterCount).toBeGreaterThan(0)

  // Text comes back out of the zstd chunks, not a stored column.
  expect(result.firstText!.length).toBeGreaterThan(0)
  // Reference is composed from a template, not stored.
  expect(result.firstRef).toMatch(/^\S+ \d/)

  expect(result.hitCount).toBeGreaterThan(0)
  expect(result.hitText!.length).toBeGreaterThan(0)
  // Contentless snippet() would yield "" here.
  expect(result.snippet).not.toBe('')
  expect(result.snippet).toContain('<mark>')

  expect(result.phraseHits).toBe(30)
  expect(result.lookupRef).toBe('CME 6.1')
  // CME page 6 paragraph 9 is cited page-only in the source, so the template
  // must reproduce "CME 6" rather than synthesising "CME 6.9".
  expect(result.pageOnlyRef).toBe('CME 6')
})
