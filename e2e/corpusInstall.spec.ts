import { expect, test } from '@playwright/test'
import { runInWorker } from './workerEval'

test('streams the EGW corpus into OPFS and queries it', async ({ page }) => {
  await page.goto('/')
  const result = await runInWorker<{
    error?: string
    bytes?: number
    lastReceived?: number
    total?: number | null
    books?: number
    phrase?: number
    peakChunk?: number
  }>(
    page,
    `
    import { installCorpus } from '__ORIGIN__/src/db/corpusInstaller.ts'
    import { openDb, removeDb } from '__ORIGIN__/src/db/opfsPool.ts'
    self.onmessage = async () => {
      try {
        await removeDb('/egw.sqlite')
        let lastReceived = 0
        let total = null
        const bytes = await installCorpus('__ORIGIN__/corpus/egw.v5.sqlite', '/egw.sqlite', (r, t) => {
          lastReceived = r
          total = t
        })

        const db = await openDb('/egw.sqlite')
        const books = db.selectValue('SELECT COUNT(*) FROM books')
        const phrase = db.selectValue(
          'SELECT COUNT(*) FROM paragraphs_fts WHERE paragraphs_fts MATCH \\'"great controversy"\\''
        )
        db.close()
        self.postMessage({ bytes, lastReceived, total, books, phrase })
      } catch (e) {
        self.postMessage({ error: String(e) })
      }
    }
  `,
  )

  expect(result.error).toBeUndefined()
  // importDb requires a size that is a whole number of 512-byte sectors.
  expect(result.bytes! % 512).toBe(0)
  expect(result.books).toBe(143)
  // The release gate: phrase search survives the build, stream, and OPFS store.
  expect(result.phrase).toBe(1294)
  expect(result.lastReceived).toBe(result.total)
})
