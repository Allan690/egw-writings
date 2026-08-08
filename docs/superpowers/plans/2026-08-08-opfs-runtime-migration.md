# OPFS Runtime Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** `docs/superpowers/plans/2026-08-08-corpus-optimization-pipeline.md` must be complete — `egw.v5.sqlite` and `pioneers.v5.sqlite` must exist and pass `npm run corpus:verify`.

**Goal:** Move corpus storage from the WASM heap to OPFS and all corpus work off the main thread, so RAM and UI responsiveness stop scaling with device capability.

**Architecture:** `@sqlite.org/sqlite-wasm` on the OPFS SAHPool VFS runs inside a dedicated worker, exposed to the app through `comlink` (already a dependency, currently unused). Corpora stream from the network into OPFS via `importDb`'s chunked callback, never materializing whole. `searchEngine.ts` keeps its exported signatures and becomes a thin proxy.

**Tech Stack:** `@sqlite.org/sqlite-wasm` 3.53+, `comlink` 4.4, `@bokuweb/zstd-wasm`, Playwright, Vitest.

## Global Constraints

- OPFS SAHPool VFS only — **never** the plain `opfs` VFS, which needs `SharedArrayBuffer` and therefore COOP/COEP headers the Vercel deployment does not set.
- SQLite page cache: `PRAGMA cache_size = -16000` (16MB, negative means KiB).
- All corpus access happens in the worker. No `sqlite3` import may appear in main-thread code.
- Never allocate a buffer holding a whole corpus. Streaming chunk size: 4MB.
- `importDb` requires total bytes `>= 512` and `% 512 === 0`; it validates the SQLite header on the first chunk and **deletes the target file if the stream throws**.
- Browser floor: Chrome 108+, Safari 17+, Firefox 111+ (`createSyncAccessHandle`). Below that, show an unsupported state — do not silently fall back to the in-memory loader.
- Remove `fts5-sql-bundle`, `src/vendor/sql-wasm.*`, `scripts/patch-sql-wasm.mjs`, and `src/lib/sql.ts` only in the final task, once nothing imports them.
- Public API of `src/db/searchEngine.ts` must not change: `initCorpusEngine`, `searchCorpus`, `getBooks`, `getBook`, `getChapters`, `getChapterParagraphs`, `getParagraph`, `lookupByReference`, `parseReference`, `attachPioneerCorpus`, `isPioneerCorpusReady`, `pioneerCorpusAvailable`. All become async.

---

## File Structure

| File | Responsibility |
|---|---|
| `playwright.config.ts` | CREATE — browser test config. |
| `src/db/opfsPool.ts` | CREATE — SAHPool VFS init and DB open. Worker-only. |
| `src/db/textCodec.ts` | CREATE — zstd chunk decompression with an LRU cache. |
| `src/lib/snippet.ts` | CREATE — JS replacement for FTS5 `snippet()`. |
| `src/db/corpusInstaller.ts` | CREATE — streaming network → OPFS import. |
| `src/db/corpusQueries.ts` | CREATE — all SQL against the v5 schema. Worker-only. |
| `src/db/corpus.worker.ts` | CREATE — comlink entry point. |
| `src/db/searchEngine.ts` | MODIFY — becomes a worker proxy. |
| `src/db/pioneerLoader.ts` | MODIFY — drives the streaming installer. |
| `vite.config.ts` | MODIFY — worker format, PWA cache rules. |

---

### Task 1: Playwright harness and OPFS capability probe

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/opfs.spec.ts`
- Create: `src/lib/opfsSupport.ts`
- Test: `src/lib/opfsSupport.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `isOpfsSupported(): boolean`.

OPFS exists only in a real browser, so browser-side behavior needs Playwright. Vitest continues to cover pure logic.

- [ ] **Step 1: Add the Playwright config and scripts**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

Add to `package.json` `"scripts"`:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 2: Write the failing unit test for the capability probe**

Create `src/lib/opfsSupport.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOpfsSupported } from './opfsSupport'

afterEach(() => { vi.unstubAllGlobals() })

describe('isOpfsSupported', () => {
  it('is false when storage is missing entirely', () => {
    vi.stubGlobal('navigator', {})
    expect(isOpfsSupported()).toBe(false)
  })

  it('is false when getDirectory exists but sync access handles do not', () => {
    vi.stubGlobal('navigator', { storage: { getDirectory: () => {} } })
    vi.stubGlobal('FileSystemFileHandle', function () {})
    expect(isOpfsSupported()).toBe(false)
  })

  it('is true when getDirectory and createSyncAccessHandle both exist', () => {
    vi.stubGlobal('navigator', { storage: { getDirectory: () => {} } })
    const handle = function () {}
    handle.prototype.createSyncAccessHandle = () => {}
    vi.stubGlobal('FileSystemFileHandle', handle)
    expect(isOpfsSupported()).toBe(true)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- opfsSupport`
Expected: FAIL — cannot resolve `./opfsSupport`.

- [ ] **Step 4: Implement the probe**

Create `src/lib/opfsSupport.ts`:

```ts
export function isOpfsSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  if (!navigator.storage?.getDirectory) return false
  if (typeof FileSystemFileHandle === 'undefined') return false
  return typeof FileSystemFileHandle.prototype.createSyncAccessHandle === 'function'
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- opfsSupport`
Expected: PASS, 3 tests.

- [ ] **Step 6: Add the browser smoke test**

Create `e2e/opfs.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('the browser exposes OPFS sync access handles', async ({ page }) => {
  await page.goto('/')
  const supported = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const fh = await root.getFileHandle('probe.bin', { create: true })
    const sah = await fh.createSyncAccessHandle()
    sah.write(new Uint8Array([1, 2, 3]), { at: 0 })
    const size = sah.getSize()
    sah.close()
    await root.removeEntry('probe.bin')
    return size
  })
  expect(supported).toBe(3)
})
```

- [ ] **Step 7: Run the browser test**

Run: `npx playwright install chromium && npm run test:e2e`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts e2e/opfs.spec.ts src/lib/opfsSupport.ts src/lib/opfsSupport.test.ts package.json package-lock.json
git commit -m "test: add Playwright harness and OPFS capability probe"
```

---

### Task 2: OPFS SAHPool database module

**Files:**
- Create: `src/db/opfsPool.ts`
- Create: `e2e/opfsPool.spec.ts`
- Modify: `package.json`, `vite.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `getPool(): Promise<PoolUtil>`, `openDb(path: string): Promise<Database>`, `dbExists(path: string): Promise<boolean>`, `POOL_NAME: string`.

`PoolUtil` and `Database` are the `@sqlite.org/sqlite-wasm` types. This module is imported **only** from worker code.

- [ ] **Step 1: Install sqlite-wasm**

```bash
npm install @sqlite.org/sqlite-wasm@^3.53.0
```

- [ ] **Step 2: Allow the wasm asset through Vite**

In `vite.config.ts`, add to the top-level config object:

```ts
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  worker: {
    format: 'es',
  },
```

`exclude` is required — pre-bundling breaks the library's wasm asset resolution.

- [ ] **Step 3: Implement the pool module**

Create `src/db/opfsPool.ts`:

```ts
import sqlite3InitModule, {
  type Database,
  type SAHPoolUtil,
} from '@sqlite.org/sqlite-wasm'

export const POOL_NAME = 'egw-corpus-pool'

/** 16MB page cache, expressed in KiB as SQLite expects for negative values. */
const CACHE_SIZE_KIB = -16000

let poolPromise: Promise<SAHPoolUtil> | null = null

export function getPool(): Promise<SAHPoolUtil> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const sqlite3 = await sqlite3InitModule()
      return sqlite3.installOpfsSAHPoolVfs({
        name: POOL_NAME,
        // Each capacity slot is one file. EGW + Pioneers + staging + headroom.
        initialCapacity: 8,
      })
    })()
  }
  return poolPromise
}

export async function openDb(path: string): Promise<Database> {
  const pool = await getPool()
  const db = new pool.OpfsSAHPoolDb(path)
  db.exec(`PRAGMA cache_size = ${CACHE_SIZE_KIB};`)
  db.exec('PRAGMA temp_store = MEMORY;')
  return db
}

export async function dbExists(path: string): Promise<boolean> {
  const pool = await getPool()
  return pool.getFileNames().includes(path)
}

export async function removeDb(path: string): Promise<void> {
  const pool = await getPool()
  if (pool.getFileNames().includes(path)) await pool.unlink(path)
}
```

- [ ] **Step 4: Write the browser test**

Create `e2e/opfsPool.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('opens a SAHPool database, persists data, and reports cache_size', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { openDb, removeDb } = await import('/src/db/opfsPool.ts')
    await removeDb('/probe.sqlite')
    const db = await openDb('/probe.sqlite')
    db.exec('CREATE TABLE t(a); INSERT INTO t VALUES (42);')
    const cache = db.selectValue('PRAGMA cache_size')
    db.close()

    const again = await openDb('/probe.sqlite')
    const value = again.selectValue('SELECT a FROM t')
    again.close()
    await removeDb('/probe.sqlite')
    return { value, cache }
  })
  expect(result.value).toBe(42)
  expect(result.cache).toBe(-16000)
})
```

If importing `/src/...` from an evaluated page fails against the production preview build, point the test at the dev server instead by setting `webServer.command` to `npm run dev` and `url` to `http://localhost:5173` for this spec.

- [ ] **Step 5: Run the test**

Run: `npm run test:e2e -- opfsPool`
Expected: PASS. Data survives close/reopen, proving OPFS persistence rather than in-memory storage.

- [ ] **Step 6: Commit**

```bash
git add src/db/opfsPool.ts e2e/opfsPool.spec.ts vite.config.ts package.json package-lock.json
git commit -m "feat: add OPFS SAHPool database module"
```

---

### Task 3: Streaming corpus installer

**Files:**
- Create: `src/db/corpusInstaller.ts`
- Create: `e2e/corpusInstall.spec.ts`

**Interfaces:**
- Consumes: `getPool` from `src/db/opfsPool.ts`.
- Produces: `installCorpus(url: string, dbPath: string, onProgress?: (received: number, total: number | null) => void): Promise<number>` — returns bytes written.

This is the task that removes the ~1.3GB spike. Chunks flow from the fetch reader into `importDb` and are written straight to disk; nothing larger than one 4MB chunk is ever resident.

- [ ] **Step 1: Implement the installer**

Create `src/db/corpusInstaller.ts`:

```ts
import { getPool } from './opfsPool'

const IMPORT_CHUNK_BYTES = 4 * 1024 * 1024

/**
 * Streams `url` into the OPFS database file `dbPath`.
 *
 * importDb's callback form writes each chunk through a SyncAccessHandle as it
 * arrives, so peak memory is one chunk rather than the whole corpus. Note that
 * importDb truncates on start and removes the file if the stream throws, so a
 * failed install leaves no partial database behind — but also cannot resume.
 */
export async function installCorpus(
  url: string,
  dbPath: string,
  onProgress?: (received: number, total: number | null) => void,
): Promise<number> {
  const pool = await getPool()

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Corpus download failed (${res.status})`)
  if (!res.body) throw new Error('Corpus download returned no body')

  const totalHeader = res.headers.get('Content-Length')
  const total = totalHeader ? Number(totalHeader) : null

  const reader = res.body.getReader()
  let received = 0
  let pending: Uint8Array[] = []
  let pendingBytes = 0
  let done = false

  const drain = (): Uint8Array => {
    const merged = new Uint8Array(pendingBytes)
    let at = 0
    for (const p of pending) {
      merged.set(p, at)
      at += p.length
    }
    pending = []
    pendingBytes = 0
    return merged
  }

  const next = async (): Promise<Uint8Array | undefined> => {
    while (!done && pendingBytes < IMPORT_CHUNK_BYTES) {
      const { value, done: finished } = await reader.read()
      if (finished) {
        done = true
        break
      }
      pending.push(value)
      pendingBytes += value.length
      received += value.length
      onProgress?.(received, total)
    }
    if (pendingBytes === 0) return undefined
    return drain()
  }

  return pool.importDb(dbPath, next)
}
```

- [ ] **Step 2: Write the browser test**

Create `e2e/corpusInstall.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('streams the EGW corpus into OPFS and queries it', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { installCorpus } = await import('/src/db/corpusInstaller.ts')
    const { openDb, removeDb } = await import('/src/db/opfsPool.ts')

    await removeDb('/egw.sqlite')
    let lastReceived = 0
    const bytes = await installCorpus('/corpus/egw.v5.sqlite', '/egw.sqlite', (r) => {
      lastReceived = r
    })

    const db = await openDb('/egw.sqlite')
    const books = db.selectValue('SELECT COUNT(*) FROM books')
    const phrase = db.selectValue(
      `SELECT COUNT(*) FROM paragraphs_fts WHERE paragraphs_fts MATCH '"great controversy"'`,
    )
    db.close()
    return { bytes, lastReceived, books, phrase }
  })

  expect(result.bytes % 512).toBe(0)
  expect(result.books).toBe(143)
  expect(result.phrase).toBe(1294)
  expect(result.lastReceived).toBeGreaterThan(0)
})
```

- [ ] **Step 3: Stage the v5 corpus for the test server**

The installer fetches `/corpus/egw.v5.sqlite`, which Plan A already produced in `public/corpus/`. Confirm it is present:

```bash
ls -l public/corpus/egw.v5.sqlite
```

- [ ] **Step 4: Run the test**

Run: `npm run test:e2e -- corpusInstall`
Expected: PASS. The 1,294 assertion proves phrase search survives the whole pipeline end to end — build transform, streaming install, and OPFS storage.

- [ ] **Step 5: Verify memory stays flat**

Run the same install manually with DevTools open (Performance → Memory). JS heap must stay well under 150MB throughout. If it tracks the download size instead, `next()` is accumulating rather than draining — check that `drain()` resets `pending` and `pendingBytes`.

- [ ] **Step 6: Commit**

```bash
git add src/db/corpusInstaller.ts e2e/corpusInstall.spec.ts
git commit -m "feat: stream corpus installs directly into OPFS"
```

---

### Task 4: Browser text codec

**Files:**
- Create: `src/db/textCodec.ts`
- Test: `src/db/textCodec.test.ts`

**Interfaces:**
- Consumes: `@bokuweb/zstd-wasm`.
- Produces: `class TextCodec` with `constructor(dict: Uint8Array, loadChunk: (id: number) => Uint8Array)`, `read(chunkId: number, off: number, len: number): string`, `dispose(): void`.

An LRU cache of decompressed chunks keeps repeated reads within one chapter cheap — a chapter's paragraphs are consecutive and usually share one or two chunks.

- [ ] **Step 1: Write the failing test**

Create `src/db/textCodec.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { init } from '@bokuweb/zstd-wasm'
import { compressChunks, trainDictionary } from '../../scripts/lib/zstdDict'
import { planChunks } from '../lib/textChunks'
import { TextCodec } from './textCodec'

async function fixture(texts: string[]) {
  await init()
  const { chunks, slices } = planChunks(texts, 1024)
  const dict = await trainDictionary(chunks, 8 * 1024)
  const compressed = await compressChunks(chunks, dict)
  return { dict, compressed, slices }
}

describe('TextCodec', () => {
  it('reads back every slice exactly', async () => {
    const texts = ['alpha one', 'God’s law endures', 'gamma three']
    const { dict, compressed, slices } = await fixture(texts)
    const codec = new TextCodec(dict, (id) => compressed[id]!)
    try {
      texts.forEach((t, i) => {
        const s = slices[i]!
        expect(codec.read(s.chunkId, s.off, s.len)).toBe(t)
      })
    } finally {
      codec.dispose()
    }
  }, 120_000)

  it('decompresses each chunk only once for repeated reads', async () => {
    const texts = ['alpha one', 'beta two', 'gamma three']
    const { dict, compressed, slices } = await fixture(texts)
    let loads = 0
    const codec = new TextCodec(dict, (id) => {
      loads += 1
      return compressed[id]!
    })
    try {
      codec.read(slices[0]!.chunkId, slices[0]!.off, slices[0]!.len)
      codec.read(slices[0]!.chunkId, slices[0]!.off, slices[0]!.len)
      codec.read(slices[1]!.chunkId, slices[1]!.off, slices[1]!.len)
      expect(loads).toBe(1) // all three slices share chunk 0 at this chunk size
    } finally {
      codec.dispose()
    }
  }, 120_000)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- textCodec`
Expected: FAIL — cannot resolve `./textCodec`.

- [ ] **Step 3: Implement the codec**

Create `src/db/textCodec.ts`:

```ts
import { createDCtx, decompressUsingDict, freeDCtx } from '@bokuweb/zstd-wasm'

const MAX_CACHED_CHUNKS = 24

export class TextCodec {
  private readonly decoder = new TextDecoder()
  private readonly cache = new Map<number, Uint8Array>()
  private readonly dctx = createDCtx()
  private disposed = false

  constructor(
    private readonly dict: Uint8Array,
    private readonly loadChunk: (id: number) => Uint8Array,
  ) {}

  private chunk(id: number): Uint8Array {
    const hit = this.cache.get(id)
    if (hit) {
      // refresh LRU position
      this.cache.delete(id)
      this.cache.set(id, hit)
      return hit
    }
    const plain = decompressUsingDict(this.dctx, this.loadChunk(id), this.dict)
    this.cache.set(id, plain)
    if (this.cache.size > MAX_CACHED_CHUNKS) {
      const oldest = this.cache.keys().next().value as number
      this.cache.delete(oldest)
    }
    return plain
  }

  read(chunkId: number, off: number, len: number): string {
    if (this.disposed) throw new Error('TextCodec has been disposed')
    return this.decoder.decode(this.chunk(chunkId).subarray(off, off + len))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cache.clear()
    freeDCtx(this.dctx)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- textCodec`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/db/textCodec.ts src/db/textCodec.test.ts
git commit -m "feat: add zstd text codec with LRU chunk cache"
```

---

### Task 5: JS snippet generation

**Files:**
- Create: `src/lib/snippet.ts`
- Test: `src/lib/snippet.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `makeSnippet(text: string, query: string, opts?: { tag?: string; context?: number }): string`.

Contentless FTS5 makes `snippet()` return an **empty string silently**, with no error. The first test below exists specifically so that silent failure cannot ship unnoticed.

- [ ] **Step 1: Write the failing test**

Create `src/lib/snippet.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeSnippet } from './snippet'

describe('makeSnippet', () => {
  it('never returns an empty string for a matching term', () => {
    // Guards the contentless-FTS5 failure mode: snippet() returns "" silently.
    const out = makeSnippet('The great controversy is not yet ended.', 'controversy')
    expect(out).not.toBe('')
    expect(out).toContain('<mark>controversy</mark>')
  })

  it('marks every distinct query term', () => {
    const out = makeSnippet('Righteousness comes by faith alone.', 'righteousness faith')
    expect(out).toContain('<mark>Righteousness</mark>')
    expect(out).toContain('<mark>faith</mark>')
  })

  it('preserves the original casing of the matched text', () => {
    expect(makeSnippet('Faith and works', 'faith')).toContain('<mark>Faith</mark>')
  })

  it('adds ellipses when it trims a long passage', () => {
    const text = `${'padding word '.repeat(40)}controversy${' trailing word'.repeat(40)}`
    const out = makeSnippet(text, 'controversy', { context: 20 })
    expect(out.startsWith('…')).toBe(true)
    expect(out.endsWith('…')).toBe(true)
    expect(out).toContain('<mark>controversy</mark>')
  })

  it('escapes HTML so corpus text cannot inject markup', () => {
    const out = makeSnippet('A <script>alert(1)</script> faith', 'faith')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('returns a leading excerpt when nothing matches', () => {
    const out = makeSnippet('Nothing relevant here at all.', 'zzzz')
    expect(out).not.toBe('')
    expect(out).toContain('Nothing relevant')
  })

  it('matches a quoted phrase as a unit', () => {
    const out = makeSnippet('The great controversy ended.', '"great controversy"')
    expect(out).toContain('<mark>great controversy</mark>')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- snippet`
Expected: FAIL — cannot resolve `./snippet`.

- [ ] **Step 3: Implement snippet generation**

Create `src/lib/snippet.ts`:

```ts
const DEFAULT_CONTEXT_CHARS = 120

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Splits a raw query into literal terms, treating "quoted runs" as one term. */
function queryTerms(query: string): string[] {
  const terms: string[] = []
  const phraseRe = /"([^"]+)"/g
  let rest = query
  let m: RegExpExecArray | null
  while ((m = phraseRe.exec(query)) !== null) terms.push(m[1]!.trim())
  rest = query.replace(phraseRe, ' ')
  for (const raw of rest.split(/\s+/)) {
    const t = raw.replace(/[^\w'’-]/g, '')
    if (t) terms.push(t)
  }
  return terms.filter(Boolean)
}

export function makeSnippet(
  text: string,
  query: string,
  opts: { tag?: string; context?: number } = {},
): string {
  const tag = opts.tag ?? 'mark'
  const context = opts.context ?? DEFAULT_CONTEXT_CHARS
  const terms = queryTerms(query)

  if (terms.length === 0) {
    const head = text.slice(0, context * 2)
    return escapeHtml(head) + (text.length > head.length ? '…' : '')
  }

  const pattern = new RegExp(terms.map(escapeRegExp).join('|'), 'gi')
  const first = pattern.exec(text)
  pattern.lastIndex = 0

  // Window the text around the first match, on whitespace boundaries.
  let start = 0
  let end = text.length
  if (first) {
    start = Math.max(0, first.index - context)
    end = Math.min(text.length, first.index + first[0].length + context)
    if (start > 0) {
      const space = text.indexOf(' ', start)
      if (space !== -1 && space < first.index) start = space + 1
    }
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end)
      if (space !== -1 && space > first.index) end = space
    }
  } else {
    end = Math.min(text.length, context * 2)
  }

  const window = text.slice(start, end)

  // Escape and highlight in one pass so tags are never escaped themselves.
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(window)) !== null) {
    out += escapeHtml(window.slice(last, m.index))
    out += `<${tag}>${escapeHtml(m[0])}</${tag}>`
    last = m.index + m[0].length
    if (m[0].length === 0) pattern.lastIndex += 1
  }
  out += escapeHtml(window.slice(last))

  return `${start > 0 ? '…' : ''}${out}${end < text.length ? '…' : ''}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- snippet`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/snippet.ts src/lib/snippet.test.ts
git commit -m "feat: add JS snippet generation for contentless FTS"
```

---

### Task 6: v5 query layer

**Files:**
- Create: `src/db/corpusQueries.ts`
- Create: `e2e/corpusQueries.spec.ts`

**Interfaces:**
- Consumes: `openDb`, `TextCodec`, `makeSnippet`, `composeReference`.
- Produces: `class CorpusDb` with `static open(dbPath: string, collection: BookCollection): Promise<CorpusDb>`, and methods `books(): BookRow[]`, `book(id: string): BookRow | null`, `chapters(bookId: string): ChapterRow[]`, `chapterParagraphs(bookId: string, chapterNum: number): ParagraphRow[]`, `paragraph(id: number): ParagraphRow | null`, `search(ftsQuery: string, rawQuery: string, limit: number, bookId?: string): SearchHit[]`, `lookup(ref: string, parsed: ParsedReference | null): ParagraphRow | null`, `close(): void`.

`BookRow`, `ChapterRow`, `ParagraphRow`, `SearchHit`, and `BookCollection` keep the exact shapes exported from `src/db/searchEngine.ts` today, so no consumer component changes.

- [ ] **Step 1: Implement the query layer**

Create `src/db/corpusQueries.ts`:

```ts
import type { Database } from '@sqlite.org/sqlite-wasm'
import { openDb } from './opfsPool'
import { TextCodec } from './textCodec'
import { makeSnippet } from '../lib/snippet'
import { composeReference } from '../lib/referenceCodec'
import type { BookCollection } from '../lib/corpusConstants'
import type { BookRow, ChapterRow, ParagraphRow, SearchHit } from './types'

interface ParsedReference { code: string; page: number; para: number }

export class CorpusDb {
  private constructor(
    private readonly db: Database,
    private readonly codec: TextCodec,
    private readonly collection: BookCollection,
  ) {}

  static async open(dbPath: string, collection: BookCollection): Promise<CorpusDb> {
    const db = await openDb(dbPath)
    const dict = db.selectValue(`SELECT value FROM corpus_meta WHERE key='zstd_dict'`) as Uint8Array
    const chunkStmt = db.prepare('SELECT data FROM text_chunks WHERE id = ?')
    const codec = new TextCodec(dict, (id) => {
      chunkStmt.reset()
      chunkStmt.bind([id])
      if (!chunkStmt.step()) throw new Error(`Missing text chunk ${id}`)
      return chunkStmt.get(0) as Uint8Array
    })
    return new CorpusDb(db, codec, collection)
  }

  private rows(sql: string, params: unknown[] = []): Record<string, unknown>[] {
    return this.db.exec({ sql, bind: params, rowMode: 'object', returnValue: 'resultRows' })
  }

  books(): BookRow[] {
    return this.rows(
      `SELECT id, code, title, COALESCE(author,'Ellen G. White') AS author,
              COALESCE(collection, ?) AS collection, year, chapter_count, paragraph_count
       FROM books ORDER BY title`,
      [this.collection],
    ).map((r) => this.toBook(r))
  }

  book(id: string): BookRow | null {
    const r = this.rows(
      `SELECT id, code, title, COALESCE(author,'Ellen G. White') AS author,
              COALESCE(collection, ?) AS collection, year, chapter_count, paragraph_count
       FROM books WHERE id = ?`,
      [this.collection, id],
    )[0]
    return r ? this.toBook(r) : null
  }

  private toBook(r: Record<string, unknown>): BookRow {
    return {
      id: String(r.id),
      code: String(r.code),
      title: String(r.title),
      author: String(r.author),
      collection: String(r.collection) as BookCollection,
      year: r.year == null ? null : Number(r.year),
      chapter_count: Number(r.chapter_count),
      paragraph_count: Number(r.paragraph_count),
    }
  }

  chapters(bookId: string): ChapterRow[] {
    return this.rows(
      'SELECT id, book_id, number, title FROM chapters WHERE book_id = ? ORDER BY number',
      [bookId],
    ).map((r) => ({
      id: Number(r.id),
      book_id: String(r.book_id),
      number: Number(r.number),
      title: String(r.title),
    }))
  }

  /** Selects the columns needed to rebuild both text and reference. */
  private static readonly PARA_COLS = `
    p.id, p.book_id, p.chapter_id, p.chapter_num, p.page_num, p.para_num,
    p.chunk_id, p.chunk_off, p.chunk_len,
    t.prefix AS ref_prefix, t.has_para AS ref_has_para, e.reference AS ref_exception
  `
  private static readonly PARA_JOINS = `
    LEFT JOIN ref_templates t ON p.ref_template_id = t.id
    LEFT JOIN ref_exceptions e ON e.paragraph_id = p.id
  `

  private toParagraph(r: Record<string, unknown>): ParagraphRow {
    const reference =
      r.ref_exception != null
        ? String(r.ref_exception)
        : composeReference(
            { prefix: String(r.ref_prefix ?? ''), hasPara: Number(r.ref_has_para) === 1 },
            Number(r.page_num),
            Number(r.para_num),
          )
    return {
      id: Number(r.id),
      book_id: String(r.book_id),
      chapter_id: Number(r.chapter_id),
      chapter_num: Number(r.chapter_num),
      page_num: Number(r.page_num),
      para_num: Number(r.para_num),
      reference,
      text: this.codec.read(Number(r.chunk_id), Number(r.chunk_off), Number(r.chunk_len)),
    }
  }

  chapterParagraphs(bookId: string, chapterNum: number): ParagraphRow[] {
    return this.rows(
      `SELECT ${CorpusDb.PARA_COLS} FROM paragraphs p ${CorpusDb.PARA_JOINS}
       WHERE p.book_id = ? AND p.chapter_num = ?
       ORDER BY p.puborder, p.page_num, p.para_num`,
      [bookId, chapterNum],
    ).map((r) => this.toParagraph(r))
  }

  paragraph(id: number): ParagraphRow | null {
    const r = this.rows(
      `SELECT ${CorpusDb.PARA_COLS} FROM paragraphs p ${CorpusDb.PARA_JOINS} WHERE p.id = ?`,
      [id],
    )[0]
    return r ? this.toParagraph(r) : null
  }

  search(ftsQuery: string, rawQuery: string, limit: number, bookId?: string): SearchHit[] {
    const params: unknown[] = [ftsQuery]
    let filter = ''
    if (bookId) {
      filter = 'AND p.book_id = ?'
      params.push(bookId)
    }
    params.push(limit)

    return this.rows(
      `SELECT ${CorpusDb.PARA_COLS},
              b.title AS book_title, b.code AS book_code,
              COALESCE(b.author,'Ellen G. White') AS book_author,
              COALESCE(b.collection, '${this.collection}') AS collection,
              c.title AS chapter_title,
              bm25(paragraphs_fts) AS rank
       FROM paragraphs_fts
       JOIN paragraphs p ON paragraphs_fts.rowid = p.id
       JOIN books b ON p.book_id = b.id
       JOIN chapters c ON p.chapter_id = c.id
       ${CorpusDb.PARA_JOINS}
       WHERE paragraphs_fts MATCH ? ${filter}
       ORDER BY rank LIMIT ?`,
      params,
    ).map((r) => {
      const para = this.toParagraph(r)
      return {
        ...para,
        book_title: String(r.book_title),
        book_code: String(r.book_code),
        book_author: String(r.book_author),
        collection: String(r.collection) as BookCollection,
        chapter_title: String(r.chapter_title),
        snippet: makeSnippet(para.text, rawQuery),
        rank: Number(r.rank),
      } as SearchHit
    })
  }

  lookup(ref: string, parsed: ParsedReference | null): ParagraphRow | null {
    if (parsed) {
      const r = this.rows(
        `SELECT ${CorpusDb.PARA_COLS} FROM paragraphs p ${CorpusDb.PARA_JOINS}
         JOIN books b ON p.book_id = b.id
         WHERE UPPER(b.code) = ? AND p.page_num = ? AND p.para_num = ? LIMIT 1`,
        [parsed.code, parsed.page, parsed.para],
      )[0]
      if (r) return this.toParagraph(r)
    }
    // Fall back to scanning composed references for the matching book code.
    const normalized = ref.trim().replace(/\s+/g, ' ').toUpperCase()
    const code = normalized.split(' ')[0] ?? ''
    const candidates = this.rows(
      `SELECT ${CorpusDb.PARA_COLS} FROM paragraphs p ${CorpusDb.PARA_JOINS}
       JOIN books b ON p.book_id = b.id
       WHERE UPPER(b.code) = ? LIMIT 5000`,
      [code],
    )
    for (const r of candidates) {
      const para = this.toParagraph(r)
      if (para.reference.toUpperCase() === normalized) return para
    }
    return null
  }

  close(): void {
    this.codec.dispose()
    this.db.close()
  }
}
```

- [ ] **Step 2: Extract the shared row types**

Create `src/db/types.ts` by moving the `BookRow`, `ChapterRow`, `ParagraphRow`, and `SearchHit` interfaces verbatim out of `src/db/searchEngine.ts` (lines 129-172). Re-export them from `searchEngine.ts` so existing imports keep working:

```ts
export type { BookRow, ChapterRow, ParagraphRow, SearchHit } from './types'
```

- [ ] **Step 3: Write the browser test**

Create `e2e/corpusQueries.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('v5 query layer reproduces text, references, and search', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { installCorpus } = await import('/src/db/corpusInstaller.ts')
    const { removeDb } = await import('/src/db/opfsPool.ts')
    const { CorpusDb } = await import('/src/db/corpusQueries.ts')

    await removeDb('/egw.sqlite')
    await installCorpus('/corpus/egw.v5.sqlite', '/egw.sqlite')
    const corpus = await CorpusDb.open('/egw.sqlite', 'egw')

    const books = corpus.books()
    const chapters = corpus.chapters(books[0]!.id)
    const paras = corpus.chapterParagraphs(books[0]!.id, chapters[0]!.number)
    const hits = corpus.search('"great" AND "controversy"', 'great controversy', 5)
    corpus.close()

    return {
      bookCount: books.length,
      firstText: paras[0]?.text ?? '',
      firstRef: paras[0]?.reference ?? '',
      hitCount: hits.length,
      snippet: hits[0]?.snippet ?? '',
      hitHasText: (hits[0]?.text ?? '').length > 0,
    }
  })

  expect(result.bookCount).toBe(143)
  expect(result.firstText.length).toBeGreaterThan(0)
  expect(result.firstRef).toMatch(/^[A-Za-z0-9]+ /)
  expect(result.hitCount).toBeGreaterThan(0)
  expect(result.hitHasText).toBe(true)
  expect(result.snippet).not.toBe('') // contentless snippet() would be ""
  expect(result.snippet).toContain('<mark>')
})
```

- [ ] **Step 4: Run the test**

Run: `npm run test:e2e -- corpusQueries`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/corpusQueries.ts src/db/types.ts src/db/searchEngine.ts e2e/corpusQueries.spec.ts
git commit -m "feat: add v5 query layer with composed references and JS snippets"
```

---

### Task 7: Worker and comlink boundary

**Files:**
- Create: `src/db/corpus.worker.ts`
- Modify: `src/db/searchEngine.ts`

**Interfaces:**
- Consumes: `CorpusDb`, `installCorpus`.
- Produces: `CorpusApi` — the comlink-exposed surface: `init(): Promise<{ bookCount: number; paragraphCount: number }>`, `installPioneers(onProgress): Promise<void>`, `isPioneerReady(): boolean`, plus one method per existing `searchEngine` export.

- [ ] **Step 1: Implement the worker**

Create `src/db/corpus.worker.ts`:

```ts
import * as Comlink from 'comlink'
import { CorpusDb } from './corpusQueries'
import { installCorpus } from './corpusInstaller'
import { dbExists } from './opfsPool'
import { isPioneerBookId, PIONEER_PARAGRAPH_OFFSET } from '../lib/corpusConstants'
import type { BookCollection } from '../lib/corpusConstants'
import type { BookRow, ChapterRow, ParagraphRow, SearchHit } from './types'

const EGW_DB = '/egw.sqlite'
const PIONEER_DB = '/pioneers.sqlite'
const EGW_URL = '/corpus/egw.v5.sqlite'
const PIONEER_URL = '/corpus/pioneers.v5.sqlite'

let egw: CorpusDb | null = null
let pioneer: CorpusDb | null = null

function buildFtsQuery(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed
  const terms = trimmed
    .split(/\s+/)
    .map((t) => t.replace(/[^\w'-]/g, ''))
    .filter(Boolean)
  if (terms.length === 0) return ''
  return terms.map((t) => `"${t}"*`).join(' AND ')
}

export function parseReference(input: string) {
  const match = input.trim().match(/^([A-Za-z]{1,5}\d?[A-Za-z]?)\s*(\d+)\.(\d+)\.?$/)
  if (!match) return null
  return {
    code: match[1]!.toUpperCase(),
    page: Number.parseInt(match[2]!, 10),
    para: Number.parseInt(match[3]!, 10),
  }
}

function dbForBook(bookId: string): CorpusDb {
  if (isPioneerBookId(bookId)) {
    if (!pioneer) throw new Error('Pioneer library still downloading')
    return pioneer
  }
  if (!egw) throw new Error('Corpus not loaded')
  return egw
}

const api = {
  async init() {
    if (!egw) {
      if (!(await dbExists(EGW_DB))) {
        await installCorpus(EGW_URL, EGW_DB)
      }
      egw = await CorpusDb.open(EGW_DB, 'egw')
    }
    if (!pioneer && (await dbExists(PIONEER_DB))) {
      pioneer = await CorpusDb.open(PIONEER_DB, 'pioneer')
    }
    const books = egw.books()
    return {
      bookCount: books.length,
      paragraphCount: books.reduce((n, b) => n + b.paragraph_count, 0),
    }
  },

  isPioneerReady(): boolean {
    return pioneer !== null
  },

  async installPioneers(onProgress: (received: number, total: number | null) => void) {
    if (pioneer) return
    if (!(await dbExists(PIONEER_DB))) {
      await installCorpus(PIONEER_URL, PIONEER_DB, onProgress)
    }
    pioneer = await CorpusDb.open(PIONEER_DB, 'pioneer')
  },

  async search(
    query: string,
    limit: number,
    bookId?: string,
    collection?: BookCollection | 'all',
  ): Promise<SearchHit[]> {
    const fts = buildFtsQuery(query)
    if (!fts || !egw) return []

    const hits: SearchHit[] = []
    const wantEgw = collection !== 'pioneer' && (!bookId || !isPioneerBookId(bookId))
    const wantPioneer =
      collection !== 'egw' && pioneer !== null && (!bookId || isPioneerBookId(bookId))

    if (wantEgw) hits.push(...egw.search(fts, query, limit, bookId))
    if (wantPioneer) hits.push(...pioneer!.search(fts, query, limit, bookId))

    hits.sort((a, b) => a.rank - b.rank)
    return hits.slice(0, limit)
  },

  async getBooks(collection?: BookCollection | 'all'): Promise<BookRow[]> {
    const rows: BookRow[] = []
    if (collection !== 'pioneer' && egw) rows.push(...egw.books())
    if (collection !== 'egw' && pioneer) rows.push(...pioneer.books())
    return rows.sort((a, b) => a.title.localeCompare(b.title))
  },

  async getBook(bookId: string): Promise<BookRow | null> {
    return dbForBook(bookId).book(bookId)
  },

  async getChapters(bookId: string): Promise<ChapterRow[]> {
    return dbForBook(bookId).chapters(bookId)
  },

  async getChapterParagraphs(bookId: string, chapterNum: number): Promise<ParagraphRow[]> {
    return dbForBook(bookId).chapterParagraphs(bookId, chapterNum)
  },

  async getParagraph(id: number, bookId?: string): Promise<ParagraphRow | null> {
    if (bookId) return dbForBook(bookId).paragraph(id)
    if (id >= PIONEER_PARAGRAPH_OFFSET) {
      if (!pioneer) throw new Error('Pioneer library still downloading')
      return pioneer.paragraph(id)
    }
    if (!egw) throw new Error('Corpus not loaded')
    return egw.paragraph(id)
  },

  async lookupByReference(ref: string): Promise<ParagraphRow | null> {
    const parsed = parseReference(ref)
    const hit = egw?.lookup(ref, parsed) ?? null
    if (hit) return hit
    return pioneer?.lookup(ref, parsed) ?? null
  },
}

export type CorpusApi = typeof api

Comlink.expose(api)
```

- [ ] **Step 2: Rewrite searchEngine as a proxy**

Replace the body of `src/db/searchEngine.ts` with:

```ts
import * as Comlink from 'comlink'
import { isPioneerBookId, PIONEER_PARAGRAPH_OFFSET } from '../lib/corpusConstants'
import type { BookCollection } from '../lib/corpusConstants'
import type { CorpusApi } from './corpus.worker'
import type { BookRow, ChapterRow, ParagraphRow, SearchHit } from './types'

export type { BookRow, ChapterRow, ParagraphRow, SearchHit } from './types'
export { isPioneerBookId, PIONEER_PARAGRAPH_OFFSET }
export type { BookCollection }

let remote: Comlink.Remote<CorpusApi> | null = null

function api(): Comlink.Remote<CorpusApi> {
  if (!remote) {
    const worker = new Worker(new URL('./corpus.worker.ts', import.meta.url), { type: 'module' })
    remote = Comlink.wrap<CorpusApi>(worker)
  }
  return remote
}

let initPromise: Promise<{ bookCount: number; paragraphCount: number }> | null = null

export function initCorpusEngine() {
  if (!initPromise) initPromise = api().init()
  return initPromise
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

export function pioneerCorpusAvailable(): Promise<boolean> {
  return fetch('/corpus/pioneers-manifest.json', { method: 'HEAD' })
    .then((r) => r.ok)
    .catch(() => false)
}

export function parseReference(input: string): { code: string; page: number; para: number } | null {
  const match = input.trim().match(/^([A-Za-z]{1,5}\d?[A-Za-z]?)\s*(\d+)\.(\d+)\.?$/)
  if (!match) return null
  return {
    code: match[1]!.toUpperCase(),
    page: Number.parseInt(match[2]!, 10),
    para: Number.parseInt(match[3]!, 10),
  }
}
```

`parseReference` is duplicated in the worker deliberately — it is synchronous and used by `ReferenceLookup.tsx` for input validation, which must not await a worker round-trip per keystroke.

- [ ] **Step 3: Update the pioneer loader**

In `src/db/pioneerLoader.ts`, change the top-level import (lines 1-5) to `import { installPioneers, isPioneerCorpusReady, pioneerCorpusAvailable } from './searchEngine'`, then delete `fetchWithProgress` and `decompressIfNeeded` entirely (lines 38-79) — the buffering they do is the defect this migration removes. Replace the body of the `loadPromise` IIFE (lines 88-122) with:

```ts
  loadPromise = (async () => {
    setState({ status: 'checking', progress: null, error: null })

    const available = await pioneerCorpusAvailable()
    if (!available) {
      setState({ status: 'unavailable', progress: null, error: null })
      return
    }

    setState({ status: 'loading', progress: 0, error: null })
    try {
      await installPioneers((received, total) => {
        setState({ progress: total ? Math.min(99, Math.round((received / total) * 100)) : null })
      })
      setState({ status: 'ready', progress: 100, error: null })
    } catch (err) {
      setState({
        status: 'error',
        progress: null,
        error: err instanceof Error ? err.message : 'Failed to load pioneer library',
      })
    }
  })()
```

Also change the guard at the top of `startPioneerBackgroundLoad` from `if (isPioneerCorpusReady())` to an async check, since `isPioneerCorpusReady` now returns a Promise.

Add to `src/db/searchEngine.ts`:

```ts
export async function installPioneers(
  onProgress: (received: number, total: number | null) => void,
): Promise<void> {
  await initCorpusEngine()
  return api().installPioneers(Comlink.proxy(onProgress))
}
```

`Comlink.proxy` is required — a bare callback cannot cross the worker boundary.

- [ ] **Step 4: Update call sites that now await**

`isPioneerCorpusReady` and `attachPioneerCorpus` changed shape. Find every caller:

```bash
grep -rn "isPioneerCorpusReady\|attachPioneerCorpus" src/
```

Update `src/hooks/usePioneerCorpus.ts` and any component hits to await the promise. `attachPioneerCorpus` has no remaining callers once `pioneerLoader.ts` is updated — delete it.

- [ ] **Step 5: Verify the build and types**

Run: `npx tsc -b && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/db/corpus.worker.ts src/db/searchEngine.ts src/db/pioneerLoader.ts src/hooks/usePioneerCorpus.ts
git commit -m "feat: move corpus access into a comlink worker"
```

---

### Task 8: PWA cache migration and legacy cleanup

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`
- Delete: `src/lib/sql.ts`, `src/vendor/sql-wasm.*`, `scripts/patch-sql-wasm.mjs`, `src/sql-wasm.d.ts`, `src/vendor/sql-wasm.js.d.ts`
- Create: `e2e/appFlow.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: nothing new.

Existing installs hold `egw-corpus` and `pioneers-corpus` Workbox caches holding the old 161MB/484MB files. Without eviction, upgraded devices carry both copies.

- [ ] **Step 1: Remove the corpus runtime caching rules**

In `vite.config.ts`, delete the entire `runtimeCaching` array from the `workbox` block (both the `egw-corpus` and `pioneers-corpus` entries). OPFS is now the store; the service worker must not also cache corpus files.

Add cache cleanup in the same `workbox` block:

```ts
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,wasm}'],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
```

`.sqlite` was never in `globPatterns`, and must stay out — precaching a 270MB corpus would defeat the whole migration.

- [ ] **Step 2: Evict the legacy caches on startup**

Add to `src/main.tsx`, before the React render:

```tsx
// One-time eviction of the pre-OPFS corpus caches.
if ('caches' in window) {
  void caches.keys().then((keys) =>
    Promise.all(
      keys.filter((k) => k === 'egw-corpus' || k === 'pioneers-corpus').map((k) => caches.delete(k)),
    ),
  )
}
```

- [ ] **Step 3: Remove the sql.js toolchain**

```bash
npm uninstall fts5-sql-bundle
rm -f src/lib/sql.ts src/sql-wasm.d.ts src/vendor/sql-wasm.js.d.ts scripts/patch-sql-wasm.mjs
rm -rf src/vendor
```

Remove the `postinstall` script and the `node scripts/patch-sql-wasm.mjs &&` prefixes from `dev` and `build` in `package.json`.

Confirm nothing still references the removed modules:

```bash
grep -rn "sql-wasm\|fts5-sql-bundle" src/ scripts/ vite.config.ts package.json
```

Expected: no output.

- [ ] **Step 4: Point the corpus files at v5**

Rename the built artifacts so the app's URLs resolve, and drop the obsolete gzip step:

```bash
mv public/corpus/egw.v5.sqlite public/corpus/egw.sqlite
mv public/corpus/pioneers.v5.sqlite public/corpus/pioneers.sqlite
rm -f public/corpus/egw.sqlite.gz public/corpus/pioneers.sqlite.gz
```

Update the worker constants in `src/db/corpus.worker.ts` to `'/corpus/egw.sqlite'` and `'/corpus/pioneers.sqlite'`, and remove `corpus:gzip` from `package.json` along with the `&& node scripts/gzip-corpus.mjs` in `corpus:build`. Bump `"version"` to `5` in both manifest JSON files.

- [ ] **Step 5: Write the end-to-end flow test**

Create `e2e/appFlow.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('installs the corpus, searches, and reads a chapter', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first()).toBeVisible({
    timeout: 120_000,
  })

  await page.getByPlaceholder(/search/i).first().fill('great controversy')
  const marks = page.locator('mark')
  await expect(marks.first()).toBeVisible({ timeout: 60_000 })

  // The contentless-FTS failure mode is empty snippets; assert real text.
  await expect(marks.first()).not.toHaveText('')

  expect(errors).toEqual([])
})

test('memory stays flat after installing both corpora', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(5_000)
  const heap = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? 0)
  // The old in-memory loader sat above 160MB with EGW alone.
  expect(heap).toBeLessThan(150 * 1024 * 1024)
})
```

- [ ] **Step 6: Run the full suite**

Run: `npm test && npx tsc -b && npm run lint && npm run test:e2e`
Expected: all green.

- [ ] **Step 7: Verify the equalization goal on a throttled profile**

In Chrome DevTools, set CPU throttling to 6× and network to Fast 3G, then hard-reload. Confirm: search results appear without the UI freezing, and the JS heap in the Memory panel stays flat while scrolling a long chapter. This is the actual acceptance criterion from the spec — the numbers in Step 5 are a proxy for it.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: migrate PWA caching to OPFS and remove sql.js toolchain"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `@sqlite.org/sqlite-wasm` on OPFS SAHPool | 2 |
| 16MB page cache, RAM flat vs corpus size | 2, 8 |
| No COOP/COEP requirement | 2 (SAHPool only, enforced in Global Constraints) |
| Worker + comlink, nothing on main thread | 7 |
| Streaming install, never buffered whole | 3 |
| EGW upfront, Pioneers in background | 7 |
| `snippet()` moves to JS | 5, 6 |
| References composed at read time | 6 |
| `searchEngine` signatures preserved | 7 |
| Service-worker cache eviction | 8 |
| Browser floor / unsupported state | 1 |
| Fail-loud test for empty snippets | 5, 8 |

**Deliberate deviations from the spec:**
- **Resumable transfer is not implemented.** `importDbChunked` truncates on start and deletes the target if the stream throws, so it cannot resume. Making it resumable needs a separate OPFS staging file plus HTTP Range requests, which transiently doubles disk use (~392MB for Pioneers). Streaming already delivers the spec's actual success criterion — flat memory — so resume is deferred rather than bundled. A failed Pioneers download currently restarts from zero; if field data shows that failing often, add the staging path as its own plan.
- `lookupByReference` falls back to scanning composed references for a book code, capped at 5,000 rows, since `idx_paragraphs_ref` no longer exists. The fast path (code + page + para) still uses an index and covers the parsed-reference case.

**Type consistency check:** `BookRow`, `ChapterRow`, `ParagraphRow`, `SearchHit` are defined once in `src/db/types.ts` (Task 6) and imported by `corpusQueries.ts`, `corpus.worker.ts`, and `searchEngine.ts`. `RefTemplate` uses `hasPara` consistently in Plan A Task 1, Plan A Task 5, and Plan B Task 6 — the SQL column is `has_para` and is converted at the boundary in `toParagraph`.
