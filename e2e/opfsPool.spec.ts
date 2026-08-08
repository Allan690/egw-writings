import { expect, test } from '@playwright/test'

/**
 * Runs inside a module worker: installOpfsSAHPoolVfs needs sync access
 * handles, which exist only in worker scopes. Vite's dev server transforms
 * the absolute /src import, so the blob worker can pull in the real module.
 */
async function runInWorker<T>(page: import('@playwright/test').Page, body: string): Promise<T> {
  return page.evaluate(async (rawSrc) => {
    // Blob URLs have an opaque base, so path-absolute imports like
    // "/src/db/opfsPool.ts" fail to resolve. Full URLs do resolve.
    const src = rawSrc.replaceAll('__ORIGIN__', location.origin)
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
    const worker = new Worker(url, { type: 'module' })
    const reply = await new Promise<any>((resolve) => {
      worker.onmessage = (e) => resolve(e.data)
      // Module-load failures surface with an empty message, so report every
      // field rather than letting an undefined message look like success.
      worker.onerror = (e) =>
        resolve({
          error: `worker error: message=${JSON.stringify(e.message)} filename=${e.filename} lineno=${e.lineno}`,
        })
      worker.onmessageerror = () => resolve({ error: 'worker messageerror' })
      setTimeout(() => resolve({ error: 'worker timed out after 60s' }), 60_000)
      worker.postMessage('go')
    })
    worker.terminate()
    URL.revokeObjectURL(url)
    return reply
  }, body)
}

test('SAHPool database persists across close and reopen', async ({ page }) => {
  await page.goto('/')
  const result = await runInWorker<{
    error?: string
    value?: number
    cache?: number
    existsBefore?: boolean
    existsAfter?: boolean
  }>(
    page,
    `
    import { openDb, removeDb, dbExists } from '__ORIGIN__/src/db/opfsPool.ts'
    self.onmessage = async () => {
      try {
        await removeDb('/probe.sqlite')
        const existsBefore = await dbExists('/probe.sqlite')

        const db = await openDb('/probe.sqlite')
        db.exec('CREATE TABLE t(a); INSERT INTO t VALUES (42);')
        const cache = db.selectValue('PRAGMA cache_size')
        db.close()

        // Reopening proves the bytes are on disk, not in the WASM heap.
        const again = await openDb('/probe.sqlite')
        const value = again.selectValue('SELECT a FROM t')
        again.close()

        const existsAfter = await dbExists('/probe.sqlite')
        await removeDb('/probe.sqlite')
        self.postMessage({ value, cache, existsBefore, existsAfter })
      } catch (e) {
        self.postMessage({ error: String(e) })
      }
    }
  `,
  )

  expect(result.error).toBeUndefined()
  expect(result.value).toBe(42)
  expect(result.cache).toBe(-16000)
  expect(result.existsBefore).toBe(false)
  expect(result.existsAfter).toBe(true)
})
