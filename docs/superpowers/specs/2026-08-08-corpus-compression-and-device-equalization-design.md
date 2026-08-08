# Corpus Compression and Device Equalization

**Date:** 2026-08-08
**Status:** Approved design, not yet planned
**Goal:** Make the PWA behave the same on a 2–3GB budget Android as on a flagship iPhone, while cutting the on-device corpus from 708MB to ~270MB — without losing search quality, phrase search, or UI/UX.

## Problem

The corpus is 708MB on disk (`egw.sqlite` 161MB, `pioneers.sqlite` 484MB). Compressing those files is the obvious framing, but it is not the real problem.

Three independent defects make the app scale with device capability instead of being flat across devices:

1. **The whole database is held in RAM.** `searchEngine.ts:73` does `new SQL.Database(new Uint8Array(buffer))`. `fts5-sql-bundle` (a sql.js fork) has no on-disk mode — the entire file is resident in the WASM heap for the life of the session.

2. **The Pioneers load peaks around 1.3GB.** `pioneerLoader.ts:49-66` accumulates every response chunk into an array, allocates a merged `Uint8Array` (~186MB gz), decompresses to a second buffer (484MB), then sql.js copies that into the WASM heap (484MB). A flagship absorbs the spike; a 2–3GB Android renderer is killed.

3. **Everything runs on the main thread.** `comlink` is declared in `package.json` but never imported, and no worker exists anywhere in `src/`. Corpus load, gzip decompression, and every FTS query block the UI. `src/lib/sql.ts` is a dead stub confirming search was moved inline.

Compression alone fixes none of these. A 145MB download that still expands into the heap is just as fatal on the target device as 708MB. Download size and the equalization goal share one root fix.

## Where the bytes are

Measured via `dbstat`:

| Component | EGW (161MB) | Pioneers (484MB) |
|---|---|---|
| `paragraphs` table | 93.0 MB | 276.1 MB |
| `paragraphs_fts_data` | 55.7 MB | 154.9 MB |
| `idx_paragraphs_ref` | 2.7 MB | 18.1 MB |
| `idx_paragraphs_order` | 2.6 MB | 10.8 MB |
| `idx_paragraphs_book` | 1.8 MB | 8.2 MB |
| `idx_paragraphs_chapter` | 1.7 MB | 6.2 MB |
| `paragraphs_fts_docsize` | 2.4 MB | 8.3 MB |
| `chapters` | 1.0 MB | 0.6 MB |

Raw prose is 306MB across both corpora (82.1MB + 224.1MB). The other ~400MB is index and structural overhead.

## Measurements that drove the design

### Text compression, random access preserved

EGW text (82.8MB) split into 32KB chunks, each independently decompressible:

| Method | Size | Ratio |
|---|---|---|
| no dictionary, zstd-19 | 30.2 MB | 2.7:1 |
| + 110KB trained dict | 24.3 MB | 3.4:1 |
| **+ 1MB trained dict** | **21.6 MB** | **3.8:1** |
| + 4MB trained dict | 21.1 MB | 3.9:1 |
| *whole-file brotli-11 (no random access)* | *13.2 MB* | *6.3:1* |

**Decision: 32KB chunks + 1MB shared dictionary.** The 4MB dictionary buys 0.5MB while costing 3MB more resident RAM. Whole-file ratios are unreachable because random access is non-negotiable.

Whole-file baselines for reference: gzip-9 27.1MB (shipped today), zstd-19 15.0MB, brotli-11 13.2MB, xz-9e 9.9MB.

### FTS5 index configuration

Built against the real EGW corpus (164,454 paragraphs):

| Config | Size |
|---|---|
| Current (`reference`+`text`, detail=full) | 64.6 MB |
| `text` only, detail=full | 41.6 MB |
| `text` only + `columnsize=0` | 40.0 MB |
| `detail=column` | 33.7 MB |
| `detail=none` | 12.4 MB |

Indexing `reference` costs 35% of the index for a column that should be a B-tree lookup.

`detail=none` is an 81% cut but **breaks exact-phrase search**: `fts5: phrase queries are not supported (detail!=full)`. `bm25()` and `snippet()` still work under it. Phrase search matters for this corpus — users search remembered quotes — so **`detail=full` is retained by decision**, accepting ~147MB of index in the final budget.

### Contentless FTS5 verification

Compressing `text` into blobs means FTS5 can no longer read its own content table, forcing `content=''`. Verified against contentless + `detail=full`:

- Size: **41.6 MB**
- `"great controversy"` → **1,294 hits, exactly matching the external-content ground truth**
- `bm25()`: works
- `NEAR(righteousness faith, 10)`: works (541 hits)
- prefix `"sanctif"*`: works (3,738 hits)
- **`snippet()` returns an empty string — silently, with no error**

Everything the app needs survives. `snippet()` must move to JS.

### Reference column is derivable

- **EGW:** 163,993 / 164,454 (**99.7%**) match `code || ' ' || page_num` or `code || ' ' || page_num || '.' || para_num`.
- **Pioneers:** 530,148 / 534,727 (**99.1%**) match a per-chapter prefix template. Periodical citations like `GCB/GCDB February 25,  1897, page 155.10` share a constant prefix per chapter — 18,014 distinct templates replace 534,727 stored strings.

Storing templates plus a small exceptions table replaces ~35MB (text + `idx_paragraphs_ref`) with under 1MB.

### Deduplication rejected

Distinct-text analysis: EGW reclaims 4.8MB of 78.3MB (6%), Pioneers 8.2MB of 213.7MB (4%). zstd with a shared dictionary already captures this redundancy implicitly, and breaking the 1:1 paragraph↔row model would complicate every reference and citation path. **Not doing this.**

## Design

### Pillar 1 — On-disk SQLite (equalizes RAM)

Replace `fts5-sql-bundle` with **`@sqlite.org/sqlite-wasm` on the OPFS SAHPool VFS**.

The database lives on disk in OPFS. SQLite pages in only what a query touches, bounded by an explicit `cache_size` of 16MB. RAM stops scaling with corpus size: a budget Android and a flagship both sit near 40MB, and both bound search latency by the same fixed cache rather than by spare RAM.

SAHPool specifically does **not** require COOP/COEP headers (unlike the standard OPFS VFS, which needs `SharedArrayBuffer`), so the Vercel deployment is unaffected.

### Pillar 2 — Worker (equalizes UI responsiveness)

Move all corpus access behind a worker, exposed with the already-declared-but-unused `comlink`. OPFS SAHPool requires a worker anyway, so this is forced by Pillar 1 rather than additional scope. The dead `src/lib/sql.ts` stub is removed.

### Pillar 3 — Compression and schema diet (reduces disk and download)

- `text` stored as zstd blobs, 32KB chunks, 1MB shared dictionary shipped alongside.
- FTS5 becomes `content=''`, `detail=full`, `text` column only, `columnsize=0`.
- `reference` column and `idx_paragraphs_ref` dropped; references composed from per-chapter templates plus an exceptions table.
- `idx_paragraphs_book` and `idx_paragraphs_chapter` dropped — both are covered by the `idx_paragraphs_order` prefix `(book_id, chapter_num, puborder)`.
- `book_id` normalized from TEXT to INTEGER.
- `sqlite_stat4` dropped.

### Budget — measured 2026-08-08

The build pipeline has been implemented and run against the real corpora. These
are actual sizes, not projections; all parity checks passed with zero failures.

| Component | EGW before | EGW after | Pioneers before | Pioneers after |
|---|---|---|---|---|
| Text | 93.0 MB | **21.4 MB** | 276.1 MB | **60.6 MB** |
| FTS index | 55.7 MB | **35.5 MB** | 154.9 MB | **97.5 MB** |
| Row data | — | 5.6 MB | — | 20.6 MB |
| `idx_paragraphs_order` | 2.6 MB | 2.6 MB | 10.8 MB | 10.8 MB |
| FTS docsize | 2.4 MB | 1.6 MB | 8.3 MB | 5.8 MB |
| zstd dictionary | — | 1.0 MB | — | 1.0 MB |
| Reference col + index | 4.0 MB | ~0.02 MB | 31.5 MB | ~0.15 MB |
| **Total** | **161.4 MB** | **69.1 MB** | **483.8 MB** | **197.6 MB** |

Combined: **708 MB → 266.7 MB (2.65x)**. Reference derivability came in better
than measured at design time — 461 exceptions of 164,454 for EGW (99.72%) and
1,338 of 534,727 for Pioneers (99.75%), needing only 275 and 4,324 templates.
Build cost is dominated by level-19 WASM compression: ~1 min for EGW, 18 min
for Pioneers, single-threaded.

### Original projection

| | Today | Optimized |
|---|---|---|
| EGW | 161 MB | ~74 MB |
| Pioneers | 484 MB | ~196 MB |
| **Disk total** | **708 MB** | **~270 MB** |
| **Steady-state RAM** | **161–645 MB** | **~40 MB** |
| **Peak RAM (cold install)** | **~1.3 GB** | **~150 MB** |

Steady-state RAM today scales with which corpora are loaded; optimized, it is flat at roughly the 16MB page cache plus WASM runtime and app.

The FTS index is ~147MB of the remaining 270MB — the cost of native phrase search, accepted deliberately. `detail=none` would cut it to ~46MB if that tradeoff is ever revisited.

### Delivery

EGW is fetched and written into OPFS first; the app is usable once it lands. Transfer is roughly 50MB against 74MB at rest — the text blobs are already zstd-compressed so they gain nothing further on the wire, while the FTS index and B-tree pages still gzip well over HTTP. Pioneers streams in afterward, **written to OPFS chunk by chunk and never buffered whole** — this is what removes the 1.3GB spike, since nothing larger than one chunk is ever resident. The transfer is resumable, and search works over EGW while Pioneers is still arriving.

### Application changes

Deliberately narrow. Query shapes in `searchEngine.ts` stay recognizable.

- `snippet()` moves to JS. Search already selects `p.text` (`searchEngine.ts:273`) and `src/lib/highlightText.tsx` already exists.
- Paragraph reads decompress the owning chunk before returning rows.
- `reference` is composed at read time rather than selected.
- `getBooks` / `getChapters` / `lookupByReference` keep their signatures; only their internals change.
- `pioneerLoader.ts` becomes a streaming OPFS writer instead of a buffer accumulator.

## Risks

- **~50MB is still a real first download** on a Kenyan mobile connection. It is resumable and cached indefinitely, but it is not small. `detail=none` is the lever that moves this most if it becomes the binding concern.
- **`snippet()` fails silently** under contentless FTS5, returning empty strings rather than throwing. The JS snippet path needs a test that fails loudly on empty output, or a regression will ship looking fine.
- **OPFS SAHPool takes an exclusive handle per tab.** Multi-tab behavior needs an explicit decision (second tab degrades to read-only, or coordinates through the first).
- **Browser support:** OPFS with `createSyncAccessHandle` requires Chrome 108+, Safari 17+, Firefox 111+. A fallback path for older browsers must be decided — most likely a clear "unsupported, use a newer browser" state rather than silently regressing to the in-memory loader.
- **Migration:** existing installs hold the old caches. The service worker must evict `egw-corpus` / `pioneers-corpus` and the old OPFS contents on upgrade, or devices carry both copies.
- Storage quota: ~270MB is comfortable on a low-storage device; 708MB risked eviction.

## Success criteria

- Peak RAM during a cold install of both corpora stays under ~150MB, measured in DevTools.
- Steady-state RAM is flat with respect to corpus size.
- Phrase search returns results identical to the current `detail=full` external-content index — `"great controversy"` must return 1,294 hits.
- Search stays responsive on a throttled/low-end device profile, with no main-thread blocking.
- Total OPFS footprint lands near 270MB.
