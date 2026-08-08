import { expect, test } from '@playwright/test'

/**
 * createSyncAccessHandle is exposed only in worker scopes, so this probes
 * inside a worker. The same constraint is why all corpus access lives in
 * src/db/corpus.worker.ts rather than on the main thread.
 */
test('OPFS sync access handles work inside a worker', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const source = `
      self.onmessage = async () => {
        try {
          const root = await navigator.storage.getDirectory()
          const fh = await root.getFileHandle('probe.bin', { create: true })
          const sah = await fh.createSyncAccessHandle()
          sah.write(new Uint8Array([1, 2, 3]), { at: 0 })
          const size = sah.getSize()
          sah.close()
          await root.removeEntry('probe.bin')
          self.postMessage({ ok: true, size })
        } catch (e) {
          self.postMessage({ ok: false, error: String(e) })
        }
      }
    `
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const worker = new Worker(url, { type: 'module' })
    const reply = await new Promise<{ ok: boolean; size?: number; error?: string }>((resolve) => {
      worker.onmessage = (e) => resolve(e.data)
      worker.postMessage('go')
    })
    worker.terminate()
    URL.revokeObjectURL(url)
    return reply
  })

  expect(result.error).toBeUndefined()
  expect(result.ok).toBe(true)
  expect(result.size).toBe(3)
})

test('the main thread does NOT expose createSyncAccessHandle', async ({ page }) => {
  await page.goto('/')
  const onMain = await page.evaluate(
    () => typeof FileSystemFileHandle?.prototype?.createSyncAccessHandle,
  )
  // Documents why the worker is mandatory rather than a performance choice.
  expect(onMain).toBe('undefined')
})
