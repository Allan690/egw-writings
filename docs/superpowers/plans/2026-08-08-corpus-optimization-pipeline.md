# Corpus Optimization Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing 708MB corpus into a ~270MB v5 format with zstd-compressed text, contentless FTS5, and templated references — verified byte-for-byte equivalent in search behavior.

**Architecture:** A standalone `scripts/optimize-corpus.ts` reads the already-downloaded `egw.sqlite` / `pioneers.sqlite` and emits optimized `.v5.sqlite` files. It never touches the EGW API, so it runs offline in seconds and is re-runnable. Pure logic (reference codec, chunking) lives in `src/lib/` so the browser runtime in Plan B imports the exact same functions.

**Tech Stack:** TypeScript, `better-sqlite3` 13, `tsx`, `@bokuweb/zstd-wasm`, Vitest.

## Global Constraints

- Node 20+; all scripts run via `tsx`.
- Chunk size: 32KB of UTF-8 text per chunk.
- zstd dictionary: 1MB, trained with `--train`; compression level 19.
- zstd library: `@bokuweb/zstd-wasm` on **both** build and browser sides, so dictionary framing is guaranteed identical.
- FTS5: `content=''` (contentless), `detail=full`, `tokenize='porter unicode61'`, single indexed column `text`.
- **Do NOT set `columnsize=0`.** It saves only ~1.6MB on EGW but disables bm25 length normalization, changing result ranking.
- Manifest `version` becomes `5` (currently `4`).
- Source corpora are read-only. Never modify `egw.sqlite` or `pioneers.sqlite`.
- Phrase-search parity is the release gate: `"great controversy"` must return exactly **1,294** hits on EGW.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/referenceCodec.ts` | CREATE — derive/compose reference templates. Pure. Shared with Plan B. |
| `src/lib/textChunks.ts` | CREATE — chunk boundary math and offset types. Pure. Shared with Plan B. |
| `scripts/corpus-schema.ts` | MODIFY — add v5 schema alongside existing v4 creation. |
| `scripts/optimize-corpus.ts` | CREATE — the transform driver. |
| `scripts/verify-corpus.ts` | CREATE — parity harness comparing v4 vs v5. |
| `vitest.config.ts` | CREATE — Node-environment test config. |

---

### Task 1: Test infrastructure and reference codec

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/referenceCodec.ts`
- Test: `src/lib/referenceCodec.test.ts`
- Modify: `package.json` (add `vitest` devDependency, `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `RefTemplate { prefix: string; hasPara: boolean }`, `deriveTemplate(reference: string, pageNum: number, paraNum: number): RefTemplate | null`, `composeReference(t: RefTemplate, pageNum: number, paraNum: number): string`.

- [ ] **Step 1: Install Vitest and add the test script**

```bash
npm install -D vitest@^3
```

Add to `package.json` `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/referenceCodec.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { composeReference, deriveTemplate } from './referenceCodec'

describe('deriveTemplate', () => {
  it('derives a template with a paragraph suffix', () => {
    expect(deriveTemplate('CME 6.9', 6, 9)).toEqual({ prefix: 'CME ', hasPara: true })
  })

  it('derives a page-only template', () => {
    expect(deriveTemplate('CME 6', 6, 9)).toEqual({ prefix: 'CME ', hasPara: false })
  })

  it('derives a periodical template with an embedded date', () => {
    expect(deriveTemplate('GCB/GCDB February 25,  1897, page 155.10', 155, 10)).toEqual({
      prefix: 'GCB/GCDB February 25,  1897, page ',
      hasPara: true,
    })
  })

  it('does not match a page number that is only a digit suffix of a larger number', () => {
    // page_num 6 must not match the trailing "6" of "16"
    expect(deriveTemplate('CME 16', 6, 3)).toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(deriveTemplate('Appendix A', 5, 1)).toBeNull()
  })
})

describe('composeReference', () => {
  it('round-trips a paragraph-suffixed reference', () => {
    const t = deriveTemplate('CME 6.9', 6, 9)!
    expect(composeReference(t, 6, 9)).toBe('CME 6.9')
  })

  it('round-trips a page-only reference', () => {
    const t = deriveTemplate('CME 6', 6, 9)!
    expect(composeReference(t, 6, 9)).toBe('CME 6')
  })

  it('reuses one template across paragraphs in the same chapter', () => {
    const t = deriveTemplate('GCB/GCDB February 25,  1897, page 155.10', 155, 10)!
    expect(composeReference(t, 156, 3)).toBe('GCB/GCDB February 25,  1897, page 156.3')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- referenceCodec`
Expected: FAIL — `Failed to resolve import "./referenceCodec"`.

- [ ] **Step 5: Implement the codec**

Create `src/lib/referenceCodec.ts`:

```ts
export interface RefTemplate {
  prefix: string
  hasPara: boolean
}

/**
 * True when `ref` ends with the decimal form of `n` AND that match starts at a
 * digit boundary. Without the boundary check, page 6 would falsely match the
 * trailing "6" of "CME 16".
 */
function endsWithNumber(ref: string, n: number): boolean {
  const s = String(n)
  if (!ref.endsWith(s)) return false
  const start = ref.length - s.length
  return start === 0 || !/\d/.test(ref[start - 1]!)
}

export function deriveTemplate(
  reference: string,
  pageNum: number,
  paraNum: number,
): RefTemplate | null {
  // Prefer the "page.para" form; it is the more specific match.
  const withPara = `${pageNum}.${paraNum}`
  if (reference.endsWith(withPara)) {
    const start = reference.length - withPara.length
    if (start === 0 || !/\d/.test(reference[start - 1]!)) {
      return { prefix: reference.slice(0, start), hasPara: true }
    }
  }
  if (endsWithNumber(reference, pageNum)) {
    return { prefix: reference.slice(0, reference.length - String(pageNum).length), hasPara: false }
  }
  return null
}

export function composeReference(t: RefTemplate, pageNum: number, paraNum: number): string {
  return t.hasPara ? `${t.prefix}${pageNum}.${paraNum}` : `${t.prefix}${pageNum}`
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- referenceCodec`
Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/lib/referenceCodec.ts src/lib/referenceCodec.test.ts package.json package-lock.json
git commit -m "feat: add reference template codec with Vitest setup"
```

---

### Task 2: Text chunking

**Files:**
- Create: `src/lib/textChunks.ts`
- Test: `src/lib/textChunks.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ChunkSlice { chunkId: number; off: number; len: number }`, `CHUNK_TARGET_BYTES: number`, `planChunks(texts: string[], targetBytes?: number): { chunks: Uint8Array[]; slices: ChunkSlice[] }`.

Offsets are **byte** offsets into the decompressed UTF-8 chunk, not character offsets — multi-byte characters (the corpus uses curly quotes like `’`) would otherwise corrupt slices.

- [ ] **Step 1: Write the failing test**

Create `src/lib/textChunks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { planChunks } from './textChunks'

const decode = (u8: Uint8Array) => new TextDecoder().decode(u8)

describe('planChunks', () => {
  it('places short texts into a single chunk', () => {
    const { chunks, slices } = planChunks(['alpha', 'beta'], 1024)
    expect(chunks).toHaveLength(1)
    expect(slices).toHaveLength(2)
    expect(slices[0]!.chunkId).toBe(0)
    expect(slices[1]!.chunkId).toBe(0)
  })

  it('produces slices that recover the original text exactly', () => {
    const texts = ['alpha', 'beta', 'gamma']
    const { chunks, slices } = planChunks(texts, 1024)
    texts.forEach((t, i) => {
      const s = slices[i]!
      const bytes = chunks[s.chunkId]!.subarray(s.off, s.off + s.len)
      expect(decode(bytes)).toBe(t)
    })
  })

  it('rolls over to a new chunk once the target is exceeded', () => {
    const texts = ['a'.repeat(600), 'b'.repeat(600), 'c'.repeat(600)]
    const { chunks, slices } = planChunks(texts, 1000)
    expect(chunks.length).toBeGreaterThan(1)
    texts.forEach((t, i) => {
      const s = slices[i]!
      expect(decode(chunks[s.chunkId]!.subarray(s.off, s.off + s.len))).toBe(t)
    })
  })

  it('uses byte offsets so multi-byte characters survive', () => {
    const texts = ['God’s law', 'plain']
    const { chunks, slices } = planChunks(texts, 1024)
    const s = slices[0]!
    expect(decode(chunks[s.chunkId]!.subarray(s.off, s.off + s.len))).toBe('God’s law')
    // the curly apostrophe is 3 bytes, so byte length exceeds character length
    expect(s.len).toBeGreaterThan('God’s law'.length)
  })

  it('keeps a single oversized text intact in its own chunk', () => {
    const big = 'x'.repeat(5000)
    const { chunks, slices } = planChunks([big], 1000)
    const s = slices[0]!
    expect(decode(chunks[s.chunkId]!.subarray(s.off, s.off + s.len))).toBe(big)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- textChunks`
Expected: FAIL — cannot resolve `./textChunks`.

- [ ] **Step 3: Implement chunk planning**

Create `src/lib/textChunks.ts`:

```ts
export const CHUNK_TARGET_BYTES = 32 * 1024

export interface ChunkSlice {
  chunkId: number
  off: number
  len: number
}

export function planChunks(
  texts: string[],
  targetBytes: number = CHUNK_TARGET_BYTES,
): { chunks: Uint8Array[]; slices: ChunkSlice[] } {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const slices: ChunkSlice[] = []

  let current: Uint8Array[] = []
  let currentLen = 0

  const flush = () => {
    if (current.length === 0) return
    const merged = new Uint8Array(currentLen)
    let at = 0
    for (const part of current) {
      merged.set(part, at)
      at += part.length
    }
    chunks.push(merged)
    current = []
    currentLen = 0
  }

  for (const text of texts) {
    const bytes = encoder.encode(text)
    if (currentLen > 0 && currentLen + bytes.length > targetBytes) flush()
    slices.push({ chunkId: chunks.length, off: currentLen, len: bytes.length })
    current.push(bytes)
    currentLen += bytes.length
  }
  flush()

  return { chunks, slices }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- textChunks`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/textChunks.ts src/lib/textChunks.test.ts
git commit -m "feat: add byte-accurate text chunk planner"
```

---

### Task 3: v5 schema

**Files:**
- Modify: `scripts/corpus-schema.ts` (append; leave `createCorpusSchema` untouched)
- Test: `scripts/corpus-schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `createCorpusSchemaV5(db: Database.Database): void`.

The v5 schema drops `reference`, `idx_paragraphs_ref`, `idx_paragraphs_book`, and `idx_paragraphs_chapter`; `idx_paragraphs_order` on `(book_id, chapter_num, puborder)` already covers book and chapter lookups as a prefix.

- [ ] **Step 1: Write the failing test**

Create `scripts/corpus-schema.test.ts`:

```ts
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createCorpusSchemaV5 } from './corpus-schema'

function cols(db: Database.Database, table: string): string[] {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((r: any) => r.name as string)
}

describe('createCorpusSchemaV5', () => {
  it('creates paragraphs without a reference column', () => {
    const db = new Database(':memory:')
    createCorpusSchemaV5(db)
    const c = cols(db, 'paragraphs')
    expect(c).not.toContain('reference')
    expect(c).toEqual(expect.arrayContaining(['chunk_id', 'chunk_off', 'chunk_len', 'ref_template_id']))
  })

  it('creates the supporting tables', () => {
    const db = new Database(':memory:')
    createCorpusSchemaV5(db)
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name as string)
    expect(names).toEqual(
      expect.arrayContaining(['text_chunks', 'ref_templates', 'ref_exceptions', 'corpus_meta']),
    )
  })

  it('drops the redundant book and chapter indexes but keeps the order index', () => {
    const db = new Database(':memory:')
    createCorpusSchemaV5(db)
    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r: any) => r.name as string)
    expect(idx).toContain('idx_paragraphs_order')
    expect(idx).not.toContain('idx_paragraphs_ref')
    expect(idx).not.toContain('idx_paragraphs_book')
    expect(idx).not.toContain('idx_paragraphs_chapter')
  })

  it('supports contentless phrase search', () => {
    const db = new Database(':memory:')
    createCorpusSchemaV5(db)
    db.prepare('INSERT INTO paragraphs_fts(rowid, text) VALUES (?, ?)').run(1, 'the great controversy ended')
    db.prepare('INSERT INTO paragraphs_fts(rowid, text) VALUES (?, ?)').run(2, 'great and small controversy')
    const hits = db
      .prepare(`SELECT rowid FROM paragraphs_fts WHERE paragraphs_fts MATCH '"great controversy"'`)
      .all()
    expect(hits).toHaveLength(1)
  })

  it('supports bm25 ranking', () => {
    const db = new Database(':memory:')
    createCorpusSchemaV5(db)
    db.prepare('INSERT INTO paragraphs_fts(rowid, text) VALUES (?, ?)').run(1, 'faith faith faith')
    db.prepare('INSERT INTO paragraphs_fts(rowid, text) VALUES (?, ?)').run(2, 'faith once')
    const ranked = db
      .prepare(
        `SELECT rowid FROM paragraphs_fts WHERE paragraphs_fts MATCH 'faith' ORDER BY bm25(paragraphs_fts)`,
      )
      .all()
      .map((r: any) => r.rowid as number)
    expect(ranked[0]).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- corpus-schema`
Expected: FAIL — `createCorpusSchemaV5 is not a function`.

- [ ] **Step 3: Implement the v5 schema**

Append to `scripts/corpus-schema.ts`:

```ts
export function createCorpusSchemaV5(db: Database.Database) {
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;

    CREATE TABLE books (
      id TEXT PRIMARY KEY,
      api_book_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      collection TEXT NOT NULL,
      year INTEGER,
      chapter_count INTEGER NOT NULL DEFAULT 0,
      paragraph_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX idx_books_collection ON books(collection);

    CREATE TABLE chapters (
      id INTEGER PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id),
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      UNIQUE(book_id, number)
    );

    CREATE TABLE text_chunks (
      id INTEGER PRIMARY KEY,
      data BLOB NOT NULL
    );

    CREATE TABLE ref_templates (
      id INTEGER PRIMARY KEY,
      prefix TEXT NOT NULL,
      has_para INTEGER NOT NULL,
      UNIQUE(prefix, has_para)
    );

    CREATE TABLE paragraphs (
      id INTEGER PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id),
      chapter_id INTEGER NOT NULL REFERENCES chapters(id),
      chapter_num INTEGER NOT NULL,
      page_num INTEGER NOT NULL,
      para_num INTEGER NOT NULL,
      puborder INTEGER NOT NULL DEFAULT 0,
      ref_template_id INTEGER REFERENCES ref_templates(id),
      chunk_id INTEGER NOT NULL REFERENCES text_chunks(id),
      chunk_off INTEGER NOT NULL,
      chunk_len INTEGER NOT NULL
    );

    CREATE INDEX idx_paragraphs_order ON paragraphs(book_id, chapter_num, puborder);

    CREATE TABLE ref_exceptions (
      paragraph_id INTEGER PRIMARY KEY REFERENCES paragraphs(id),
      reference TEXT NOT NULL
    );

    CREATE TABLE corpus_meta (
      key TEXT PRIMARY KEY,
      value BLOB NOT NULL
    );

    CREATE VIRTUAL TABLE paragraphs_fts USING fts5(
      text,
      content='',
      tokenize='porter unicode61'
    );
  `)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- corpus-schema`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/corpus-schema.ts scripts/corpus-schema.test.ts
git commit -m "feat: add v5 corpus schema with contentless FTS and chunked text"
```

---

### Task 4: zstd dictionary training and compression

**Files:**
- Create: `scripts/lib/zstdDict.ts`
- Test: `scripts/lib/zstdDict.test.ts`
- Modify: `package.json` (add `@bokuweb/zstd-wasm`)

**Interfaces:**
- Consumes: `planChunks` from `src/lib/textChunks.ts`.
- Produces: `trainDictionary(samples: Uint8Array[], maxBytes?: number): Promise<Uint8Array>`, `compressChunks(chunks: Uint8Array[], dict: Uint8Array, level?: number): Promise<Uint8Array[]>`.

Dictionary training uses the `zstd --train` CLI (the wasm build exposes no trainer). Compression uses `@bokuweb/zstd-wasm` so the frame format matches what the browser decoder in Plan B expects.

- [ ] **Step 1: Install the zstd library and verify the CLI**

```bash
npm install @bokuweb/zstd-wasm
zstd --version
```

If `zstd` is missing: `brew install zstd`. The trainer is build-time only and never ships to the browser.

- [ ] **Step 2: Write the failing test**

Create `scripts/lib/zstdDict.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { init, decompressUsingDict, createDCtx, freeDCtx } from '@bokuweb/zstd-wasm'
import { compressChunks, trainDictionary } from './zstdDict'

const enc = new TextEncoder()
const dec = new TextDecoder()

// Repetitive sentences give the trainer real cross-sample redundancy to find.
function samples(): Uint8Array[] {
  const out: Uint8Array[] = []
  for (let i = 0; i < 200; i++) {
    out.push(enc.encode(`The Lord is my shepherd and my salvation, paragraph number ${i}. `.repeat(40)))
  }
  return out
}

describe('zstd dictionary round-trip', () => {
  it('produces chunks that decompress back to the exact input', async () => {
    await init()
    const input = samples()
    const dict = await trainDictionary(input, 32 * 1024)
    const compressed = await compressChunks(input, dict)

    const dctx = createDCtx()
    try {
      input.forEach((original, i) => {
        const round = decompressUsingDict(dctx, compressed[i]!, dict)
        expect(dec.decode(round)).toBe(dec.decode(original))
      })
    } finally {
      freeDCtx(dctx)
    }
  }, 120_000)

  it('compresses to substantially less than the input size', async () => {
    await init()
    const input = samples()
    const dict = await trainDictionary(input, 32 * 1024)
    const compressed = await compressChunks(input, dict)

    const rawBytes = input.reduce((n, c) => n + c.length, 0)
    const compBytes = compressed.reduce((n, c) => n + c.length, 0)
    expect(compBytes).toBeLessThan(rawBytes / 2)
  }, 120_000)
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- zstdDict`
Expected: FAIL — cannot resolve `./zstdDict`.

- [ ] **Step 4: Implement training and compression**

Create `scripts/lib/zstdDict.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compressUsingDict, createCCtx, freeCCtx, init } from '@bokuweb/zstd-wasm'

export const DICT_TARGET_BYTES = 1024 * 1024
export const ZSTD_LEVEL = 19

/** Trains a zstd dictionary by shelling out to the zstd CLI (the wasm build has no trainer). */
export async function trainDictionary(
  samples: Uint8Array[],
  maxBytes: number = DICT_TARGET_BYTES,
): Promise<Uint8Array> {
  const dir = mkdtempSync(join(tmpdir(), 'zdict-'))
  try {
    samples.forEach((s, i) => writeFileSync(join(dir, `${String(i).padStart(6, '0')}.bin`), s))
    const dictPath = join(dir, 'dictionary')
    execFileSync(
      'zstd',
      ['--train', `${dir}/*.bin`, '-o', dictPath, `--maxdict=${maxBytes}`],
      { shell: true, stdio: 'pipe' },
    )
    return new Uint8Array(readFileSync(dictPath))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export async function compressChunks(
  chunks: Uint8Array[],
  dict: Uint8Array,
  level: number = ZSTD_LEVEL,
): Promise<Uint8Array[]> {
  await init()
  const cctx = createCCtx()
  try {
    return chunks.map((c) => compressUsingDict(cctx, c, dict, level))
  } finally {
    freeCCtx(cctx)
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- zstdDict`
Expected: PASS, 2 tests.

If `compressUsingDict` / `createCCtx` are not exported under those names, run `node -e "import('@bokuweb/zstd-wasm').then(m => console.log(Object.keys(m)))"` and use the actual exported names. The verified decompression side is `createDCtx`, `decompressUsingDict`, `freeDCtx`.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/zstdDict.ts scripts/lib/zstdDict.test.ts package.json package-lock.json
git commit -m "feat: add zstd dictionary training and chunk compression"
```

---

### Task 5: The optimize-corpus transform

**Files:**
- Create: `scripts/optimize-corpus.ts`
- Test: `scripts/optimize-corpus.test.ts`
- Modify: `package.json` (add `corpus:optimize` script)

**Interfaces:**
- Consumes: `createCorpusSchemaV5`, `planChunks`, `deriveTemplate`, `trainDictionary`, `compressChunks`.
- Produces: `optimizeCorpus(srcPath: string, outPath: string): Promise<OptimizeStats>` where `OptimizeStats = { paragraphs: number; chunks: number; templates: number; exceptions: number; dictBytes: number }`.

- [ ] **Step 1: Write the failing test**

Create `scripts/optimize-corpus.test.ts`:

```ts
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { init, createDCtx, decompressUsingDict, freeDCtx } from '@bokuweb/zstd-wasm'
import { createCorpusSchema } from './corpus-schema'
import { composeReference } from '../src/lib/referenceCodec'
import { optimizeCorpus } from './optimize-corpus'

let dir: string

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'optc-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function buildSource(path: string) {
  const db = new Database(path)
  createCorpusSchema(db)
  db.prepare(
    `INSERT INTO books (id, api_book_id, code, title, author, collection, year, chapter_count, paragraph_count)
     VALUES ('cme', 1, 'CME', 'A Call to Medical Evangelism', 'Ellen Gould White', 'egw', 1933, 1, 3)`,
  ).run()
  db.prepare(`INSERT INTO chapters (id, book_id, number, title) VALUES (1, 'cme', 1, 'Chapter One')`).run()
  const ins = db.prepare(
    `INSERT INTO paragraphs (id, book_id, chapter_id, chapter_num, page_num, para_num, puborder, reference, text)
     VALUES (@id, 'cme', 1, 1, @page, @para, @id, @ref, @text)`,
  )
  ins.run({ id: 1, page: 6, para: 9, ref: 'CME 6.9', text: 'A clarion call to medical evangelism is due.' })
  ins.run({ id: 2, page: 6, para: 10, ref: 'CME 6', text: 'The great controversy is not yet ended.' })
  ins.run({ id: 3, page: 7, para: 1, ref: 'Appendix A', text: 'God’s law endures forever.' })
  db.close()
}

describe('optimizeCorpus', () => {
  it('preserves every paragraph text exactly', async () => {
    const src = join(dir, 'src.sqlite')
    const out = join(dir, 'out.sqlite')
    buildSource(src)
    await optimizeCorpus(src, out)
    await init()

    const srcDb = new Database(src, { readonly: true })
    const outDb = new Database(out, { readonly: true })
    const dict = (outDb.prepare(`SELECT value FROM corpus_meta WHERE key='zstd_dict'`).get() as any).value
    const dctx = createDCtx()
    try {
      for (const row of srcDb.prepare('SELECT id, text FROM paragraphs').all() as any[]) {
        const p = outDb
          .prepare('SELECT chunk_id, chunk_off, chunk_len FROM paragraphs WHERE id = ?')
          .get(row.id) as any
        const blob = (outDb.prepare('SELECT data FROM text_chunks WHERE id = ?').get(p.chunk_id) as any).data
        const plain = decompressUsingDict(dctx, new Uint8Array(blob), new Uint8Array(dict))
        const text = new TextDecoder().decode(plain.subarray(p.chunk_off, p.chunk_off + p.chunk_len))
        expect(text).toBe(row.text)
      }
    } finally {
      freeDCtx(dctx)
    }
  }, 120_000)

  it('reconstructs every reference exactly', async () => {
    const src = join(dir, 'src.sqlite')
    const out = join(dir, 'out.sqlite')
    buildSource(src)
    await optimizeCorpus(src, out)

    const srcDb = new Database(src, { readonly: true })
    const outDb = new Database(out, { readonly: true })
    for (const row of srcDb.prepare('SELECT id, reference, page_num, para_num FROM paragraphs').all() as any[]) {
      const p = outDb
        .prepare(
          `SELECT p.page_num, p.para_num, t.prefix, t.has_para, e.reference AS exc
           FROM paragraphs p
           LEFT JOIN ref_templates t ON p.ref_template_id = t.id
           LEFT JOIN ref_exceptions e ON e.paragraph_id = p.id
           WHERE p.id = ?`,
        )
        .get(row.id) as any
      const actual = p.exc ?? composeReference({ prefix: p.prefix, hasPara: !!p.has_para }, p.page_num, p.para_num)
      expect(actual).toBe(row.reference)
    }
  }, 120_000)

  it('stores unmatched references as exceptions', async () => {
    const src = join(dir, 'src.sqlite')
    const out = join(dir, 'out.sqlite')
    buildSource(src)
    const stats = await optimizeCorpus(src, out)
    expect(stats.exceptions).toBe(1) // "Appendix A"
  }, 120_000)

  it('carries phrase search into the contentless index', async () => {
    const src = join(dir, 'src.sqlite')
    const out = join(dir, 'out.sqlite')
    buildSource(src)
    await optimizeCorpus(src, out)

    const outDb = new Database(out, { readonly: true })
    const hits = outDb
      .prepare(`SELECT rowid FROM paragraphs_fts WHERE paragraphs_fts MATCH '"great controversy"'`)
      .all() as any[]
    expect(hits.map((h) => h.rowid)).toEqual([2])
  }, 120_000)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- optimize-corpus`
Expected: FAIL — cannot resolve `./optimize-corpus`.

- [ ] **Step 3: Implement the transform**

Create `scripts/optimize-corpus.ts`:

```ts
import Database from 'better-sqlite3'
import { existsSync, unlinkSync } from 'node:fs'
import { createCorpusSchemaV5 } from './corpus-schema'
import { compressChunks, trainDictionary } from './lib/zstdDict'
import { deriveTemplate } from '../src/lib/referenceCodec'
import { planChunks } from '../src/lib/textChunks'

export interface OptimizeStats {
  paragraphs: number
  chunks: number
  templates: number
  exceptions: number
  dictBytes: number
}

interface SrcParagraph {
  id: number
  book_id: string
  chapter_id: number
  chapter_num: number
  page_num: number
  para_num: number
  puborder: number
  reference: string
  text: string
}

export async function optimizeCorpus(srcPath: string, outPath: string): Promise<OptimizeStats> {
  if (existsSync(outPath)) unlinkSync(outPath)

  const src = new Database(srcPath, { readonly: true })
  const out = new Database(outPath)
  createCorpusSchemaV5(out)

  // Books and chapters copy across unchanged.
  const books = src.prepare('SELECT * FROM books').all() as any[]
  const insBook = out.prepare(
    `INSERT INTO books (id, api_book_id, code, title, author, collection, year, chapter_count, paragraph_count)
     VALUES (@id, @api_book_id, @code, @title, @author, @collection, @year, @chapter_count, @paragraph_count)`,
  )
  out.transaction(() => books.forEach((b) => insBook.run(b)))()

  const chapters = src.prepare('SELECT id, book_id, number, title FROM chapters').all() as any[]
  const insChapter = out.prepare(
    'INSERT INTO chapters (id, book_id, number, title) VALUES (@id, @book_id, @number, @title)',
  )
  out.transaction(() => chapters.forEach((c) => insChapter.run(c)))()

  const paragraphs = src
    .prepare(
      `SELECT id, book_id, chapter_id, chapter_num, page_num, para_num, puborder, reference, text
       FROM paragraphs ORDER BY id`,
    )
    .all() as SrcParagraph[]

  // 1. Chunk and compress the text.
  const { chunks, slices } = planChunks(paragraphs.map((p) => p.text))
  const dict = await trainDictionary(chunks)
  const compressed = await compressChunks(chunks, dict)

  const insChunk = out.prepare('INSERT INTO text_chunks (id, data) VALUES (?, ?)')
  out.transaction(() => compressed.forEach((c, i) => insChunk.run(i, Buffer.from(c))))()

  out.prepare('INSERT INTO corpus_meta (key, value) VALUES (?, ?)').run('zstd_dict', Buffer.from(dict))

  // 2. Derive reference templates, deduplicated by (prefix, has_para).
  const templateIds = new Map<string, number>()
  const insTemplate = out.prepare(
    'INSERT INTO ref_templates (id, prefix, has_para) VALUES (?, ?, ?)',
  )
  const templateIdFor = (prefix: string, hasPara: boolean): number => {
    const key = `${hasPara ? '1' : '0'} ${prefix}`
    const found = templateIds.get(key)
    if (found !== undefined) return found
    const id = templateIds.size + 1
    templateIds.set(key, id)
    insTemplate.run(id, prefix, hasPara ? 1 : 0)
    return id
  }

  const insParagraph = out.prepare(
    `INSERT INTO paragraphs (id, book_id, chapter_id, chapter_num, page_num, para_num, puborder,
                             ref_template_id, chunk_id, chunk_off, chunk_len)
     VALUES (@id, @book_id, @chapter_id, @chapter_num, @page_num, @para_num, @puborder,
             @ref_template_id, @chunk_id, @chunk_off, @chunk_len)`,
  )
  const insException = out.prepare(
    'INSERT INTO ref_exceptions (paragraph_id, reference) VALUES (?, ?)',
  )

  let exceptions = 0
  out.transaction(() => {
    paragraphs.forEach((p, i) => {
      const template = deriveTemplate(p.reference, p.page_num, p.para_num)
      const slice = slices[i]!
      insParagraph.run({
        id: p.id,
        book_id: p.book_id,
        chapter_id: p.chapter_id,
        chapter_num: p.chapter_num,
        page_num: p.page_num,
        para_num: p.para_num,
        puborder: p.puborder,
        ref_template_id: template ? templateIdFor(template.prefix, template.hasPara) : null,
        chunk_id: slice.chunkId,
        chunk_off: slice.off,
        chunk_len: slice.len,
      })
      if (!template) {
        insException.run(p.id, p.reference)
        exceptions += 1
      }
    })
  })()

  // 3. Build the contentless FTS index from the source text.
  const insFts = out.prepare('INSERT INTO paragraphs_fts(rowid, text) VALUES (?, ?)')
  out.transaction(() => paragraphs.forEach((p) => insFts.run(p.id, p.text)))()

  out.exec('ANALYZE; VACUUM;')

  const stats: OptimizeStats = {
    paragraphs: paragraphs.length,
    chunks: compressed.length,
    templates: templateIds.size,
    exceptions,
    dictBytes: dict.length,
  }

  src.close()
  out.close()
  return stats
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- optimize-corpus`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the CLI entry point**

Append to `scripts/optimize-corpus.ts`:

```ts
import { fileURLToPath } from 'node:url'

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , src, out] = process.argv
  if (!src || !out) {
    console.error('usage: tsx scripts/optimize-corpus.ts <src.sqlite> <out.sqlite>')
    process.exit(1)
  }
  optimizeCorpus(src, out).then((s) => {
    console.log(
      `paragraphs=${s.paragraphs} chunks=${s.chunks} templates=${s.templates} ` +
        `exceptions=${s.exceptions} dict=${(s.dictBytes / 1024).toFixed(0)}KB`,
    )
  })
}
```

Add to `package.json` `"scripts"`:

```json
"corpus:optimize": "tsx scripts/optimize-corpus.ts public/corpus/egw.sqlite public/corpus/egw.v5.sqlite && tsx scripts/optimize-corpus.ts public/corpus/pioneers.sqlite public/corpus/pioneers.v5.sqlite"
```

- [ ] **Step 6: Run it against the real corpus**

Run: `npm run corpus:optimize`

Expected: EGW reports roughly `paragraphs=164454 exceptions=461`, Pioneers roughly `paragraphs=534727 exceptions=4579`. Exceptions above 1% of paragraphs means `deriveTemplate` is failing on a pattern the tests do not cover — inspect samples before continuing.

- [ ] **Step 7: Commit**

```bash
git add scripts/optimize-corpus.ts scripts/optimize-corpus.test.ts package.json
git commit -m "feat: add corpus v4 to v5 optimization transform"
```

---

### Task 6: Parity verification harness

**Files:**
- Create: `scripts/verify-corpus.ts`
- Modify: `package.json` (add `corpus:verify` script)

**Interfaces:**
- Consumes: `composeReference` from `src/lib/referenceCodec.ts`, `@bokuweb/zstd-wasm`.
- Produces: a CLI that exits non-zero on any parity failure.

This is the release gate. It runs against the full real corpora, not fixtures.

- [ ] **Step 1: Write the harness**

Create `scripts/verify-corpus.ts`:

```ts
import Database from 'better-sqlite3'
import { statSync } from 'node:fs'
import { createDCtx, decompressUsingDict, freeDCtx, init } from '@bokuweb/zstd-wasm'
import { composeReference } from '../src/lib/referenceCodec'

interface Failure { check: string; detail: string }

async function verify(srcPath: string, outPath: string): Promise<Failure[]> {
  await init()
  const failures: Failure[] = []
  const src = new Database(srcPath, { readonly: true })
  const out = new Database(outPath, { readonly: true })
  const decoder = new TextDecoder()

  const dict = new Uint8Array(
    (out.prepare(`SELECT value FROM corpus_meta WHERE key='zstd_dict'`).get() as any).value,
  )

  // 1. Row counts match.
  const srcCount = (src.prepare('SELECT COUNT(*) n FROM paragraphs').get() as any).n
  const outCount = (out.prepare('SELECT COUNT(*) n FROM paragraphs').get() as any).n
  if (srcCount !== outCount) {
    failures.push({ check: 'row-count', detail: `${srcCount} vs ${outCount}` })
  }

  // 2. Every text round-trips, and every reference recomposes.
  const dctx = createDCtx()
  const chunkCache = new Map<number, Uint8Array>()
  const getChunk = (id: number): Uint8Array => {
    const hit = chunkCache.get(id)
    if (hit) return hit
    const blob = (out.prepare('SELECT data FROM text_chunks WHERE id = ?').get(id) as any).data
    const plain = decompressUsingDict(dctx, new Uint8Array(blob), dict)
    if (chunkCache.size > 64) chunkCache.clear()
    chunkCache.set(id, plain)
    return plain
  }

  const outRows = out.prepare(
    `SELECT p.id, p.page_num, p.para_num, p.chunk_id, p.chunk_off, p.chunk_len,
            t.prefix, t.has_para, e.reference AS exc
     FROM paragraphs p
     LEFT JOIN ref_templates t ON p.ref_template_id = t.id
     LEFT JOIN ref_exceptions e ON e.paragraph_id = p.id
     ORDER BY p.chunk_id, p.id`,
  ).all() as any[]

  const srcStmt = src.prepare('SELECT reference, text FROM paragraphs WHERE id = ?')
  let textMismatch = 0
  let refMismatch = 0
  for (const r of outRows) {
    const original = srcStmt.get(r.id) as any
    const chunk = getChunk(r.chunk_id)
    const text = decoder.decode(chunk.subarray(r.chunk_off, r.chunk_off + r.chunk_len))
    if (text !== original.text && textMismatch++ < 3) {
      failures.push({ check: 'text', detail: `id=${r.id}` })
    }
    const ref = r.exc ?? composeReference({ prefix: r.prefix, hasPara: !!r.has_para }, r.page_num, r.para_num)
    if (ref !== original.reference && refMismatch++ < 3) {
      failures.push({ check: 'reference', detail: `id=${r.id}: ${ref} != ${original.reference}` })
    }
  }
  freeDCtx(dctx)
  if (textMismatch > 3) failures.push({ check: 'text', detail: `${textMismatch} total mismatches` })
  if (refMismatch > 3) failures.push({ check: 'reference', detail: `${refMismatch} total mismatches` })

  // 3. Phrase search parity against the source FTS index.
  for (const phrase of ['great controversy', 'righteousness by faith', 'the third angel']) {
    const q = `"${phrase}"`
    const a = (src.prepare('SELECT COUNT(*) n FROM paragraphs_fts WHERE paragraphs_fts MATCH ?').get(q) as any).n
    const b = (out.prepare('SELECT COUNT(*) n FROM paragraphs_fts WHERE paragraphs_fts MATCH ?').get(q) as any).n
    if (a !== b) failures.push({ check: 'phrase', detail: `"${phrase}": ${a} vs ${b}` })
  }

  const before = statSync(srcPath).size / 1048576
  const after = statSync(outPath).size / 1048576
  console.log(
    `${srcPath}: ${before.toFixed(1)}MB -> ${after.toFixed(1)}MB ` +
      `(${(before / after).toFixed(2)}x), ${failures.length} failures`,
  )

  src.close()
  out.close()
  return failures
}

const pairs: [string, string][] = [
  ['public/corpus/egw.sqlite', 'public/corpus/egw.v5.sqlite'],
  ['public/corpus/pioneers.sqlite', 'public/corpus/pioneers.v5.sqlite'],
]

const all: Failure[] = []
for (const [src, out] of pairs) all.push(...(await verify(src, out)))

if (all.length > 0) {
  console.error('\nPARITY FAILURES:')
  for (const f of all) console.error(`  [${f.check}] ${f.detail}`)
  process.exit(1)
}
console.log('\nAll parity checks passed.')
```

- [ ] **Step 2: Add the script and run it**

Add to `package.json` `"scripts"`:

```json
"corpus:verify": "tsx scripts/verify-corpus.ts"
```

Run: `npm run corpus:verify`

Expected: exit 0, `All parity checks passed.` EGW should report roughly `161.4MB -> ~74MB`, Pioneers roughly `483.8MB -> ~196MB`.

- [ ] **Step 3: Confirm the headline phrase count**

Run:

```bash
sqlite3 public/corpus/egw.v5.sqlite "SELECT COUNT(*) FROM paragraphs_fts WHERE paragraphs_fts MATCH '\"great controversy\"';"
```

Expected: exactly `1294`. This is the release gate from the spec — a different number means the tokenizer or index configuration drifted.

- [ ] **Step 4: Record the achieved sizes**

Run:

```bash
for f in egw pioneers; do
  sqlite3 public/corpus/$f.v5.sqlite \
    "SELECT name, ROUND(SUM(pgsize)/1048576.0,1) mb FROM dbstat GROUP BY name ORDER BY mb DESC LIMIT 6;"
done
```

Append the real numbers to the spec's projected-budget table so Plan B works from measured values rather than estimates.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-corpus.ts package.json docs/superpowers/specs/2026-08-08-corpus-compression-and-device-equalization-design.md
git commit -m "feat: add corpus parity verification harness"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| zstd text blobs, 32KB chunks, 1MB dict | 2, 4, 5 |
| FTS5 `content=''`, `detail=full`, text only | 3, 5 |
| Drop `reference` + `idx_paragraphs_ref` | 3, 5 |
| Per-chapter reference templates + exceptions | 1, 5 |
| Drop `idx_paragraphs_book` / `idx_paragraphs_chapter` | 3 |
| Drop `sqlite_stat4` | 5 (`ANALYZE` before `VACUUM` regenerates only `sqlite_stat1`) |
| Phrase parity — 1,294 hits | 6 |
| Size target ~270MB | 6 |

**Deliberate deviations from the spec:**
- `columnsize=0` is **not** applied. Measured saving is ~1.6MB on EGW, and it disables bm25 length normalization, changing ranking. Relevance outranks the bytes.
- `book_id` stays TEXT. Normalizing to INTEGER would touch every query in `searchEngine.ts` and the `p-` prefix logic in `corpusConstants.ts` for roughly 5MB. Deferred; not worth coupling it to this change.

**Not covered here (belongs to Plan B):** OPFS, worker, streaming install, JS snippets, service-worker cache eviction.
