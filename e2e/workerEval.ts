import type { Page } from '@playwright/test'

/**
 * Runs a module-worker script in the page and returns its posted message.
 *
 * Everything corpus-related must run in a worker: createSyncAccessHandle, and
 * therefore the OPFS SAHPool VFS, does not exist on the main thread.
 *
 * Use `__ORIGIN__` in import specifiers — blob URLs have an opaque base, so
 * path-absolute imports fail to resolve while full URLs succeed.
 */
export async function runInWorker<T>(page: Page, body: string, timeoutMs = 180_000): Promise<T> {
  return page.evaluate(
    async ({ rawSrc, timeout }) => {
      const src = rawSrc.replaceAll('__ORIGIN__', location.origin)
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
      const worker = new Worker(url, { type: 'module' })
      const reply = await new Promise<any>((resolve) => {
        worker.onmessage = (e) => resolve(e.data)
        // Module-load failures arrive with an empty message, so report every
        // field rather than letting an undefined message look like success.
        worker.onerror = (e) =>
          resolve({
            error: `worker error: message=${JSON.stringify(e.message)} filename=${e.filename} lineno=${e.lineno}`,
          })
        worker.onmessageerror = () => resolve({ error: 'worker messageerror' })
        setTimeout(() => resolve({ error: `worker timed out after ${timeout}ms` }), timeout)
        worker.postMessage('go')
      })
      worker.terminate()
      URL.revokeObjectURL(url)
      return reply
    },
    { rawSrc: body, timeout: timeoutMs },
  )
}
