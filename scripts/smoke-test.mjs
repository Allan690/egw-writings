import { chromium } from '@playwright/test'

const url = process.argv[2] ?? 'http://127.0.0.1:5173/'

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', (msg) => console.log(`[${msg.type()}]`, msg.text()))
page.on('pageerror', (err) => console.error('[pageerror]', err.message))

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

const searchVisible = await page
  .getByPlaceholder(/Try "righteousness/)
  .waitFor({ state: 'visible', timeout: 120_000 })
  .then(() => true)
  .catch(() => false)

console.log('search visible:', searchVisible)
if (!searchVisible) {
  console.log('body:', (await page.locator('body').innerText()).slice(0, 600))
}

await browser.close()
process.exit(searchVisible ? 0 : 1)
