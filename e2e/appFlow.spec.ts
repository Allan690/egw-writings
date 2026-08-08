import { expect, test } from '@playwright/test'

/**
 * Exercises the real app path: searchEngine -> comlink -> corpus.worker ->
 * OPFS. The worker-scoped e2e specs bypass this wiring, so this is the only
 * test that proves the shipped code path works.
 */
test('installs the corpus, searches, and renders highlighted results', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')

  const search = page.getByPlaceholder(/search/i).first()
  await expect(search).toBeVisible({ timeout: 120_000 })

  await search.fill('great controversy')

  const marks = page.locator('mark')
  await expect(marks.first()).toBeVisible({ timeout: 120_000 })

  // Contentless FTS5 snippet() yields empty strings; assert real content.
  const text = await marks.first().textContent()
  expect(text).toBeTruthy()
  expect(text!.trim().length).toBeGreaterThan(0)

  expect(errors).toEqual([])
})

test('keeps JS heap flat rather than scaling with corpus size', async ({ page }) => {
  await page.goto('/')
  const search = page.getByPlaceholder(/search/i).first()
  await expect(search).toBeVisible({ timeout: 120_000 })
  await search.fill('righteousness')
  await expect(page.locator('mark').first()).toBeVisible({ timeout: 120_000 })

  const heap = await page.evaluate(
    () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
  )
  // The old in-memory loader held 161MB for EGW alone before Pioneers.
  expect(heap).toBeLessThan(150 * 1024 * 1024)
})
