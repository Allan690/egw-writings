import Database from 'better-sqlite3'
import { statSync } from 'node:fs'
import { createDCtx, decompressUsingDict, freeDCtx } from '@bokuweb/zstd-wasm'
import { ensureZstd } from './lib/zstdDict'
import { composeReference } from '../src/lib/referenceCodec'

interface Failure {
  check: string
  detail: string
}

async function verify(srcPath: string, outPath: string): Promise<Failure[]> {
  await ensureZstd()
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
  const chunkStmt = out.prepare('SELECT data FROM text_chunks WHERE id = ?')
  const getChunk = (id: number): Uint8Array => {
    const hit = chunkCache.get(id)
    if (hit) return hit
    const blob = (chunkStmt.get(id) as any).data
    const plain = decompressUsingDict(dctx, new Uint8Array(blob), dict)
    if (chunkCache.size > 64) chunkCache.clear()
    chunkCache.set(id, plain)
    return plain
  }

  const outRows = out
    .prepare(
      `SELECT p.id, p.page_num, p.para_num, p.chunk_id, p.chunk_off, p.chunk_len,
              t.prefix, t.has_para, e.reference AS exc
       FROM paragraphs p
       LEFT JOIN ref_templates t ON p.ref_template_id = t.id
       LEFT JOIN ref_exceptions e ON e.paragraph_id = p.id
       ORDER BY p.chunk_id, p.id`,
    )
    .all() as any[]

  const srcStmt = src.prepare('SELECT reference, text FROM paragraphs WHERE id = ?')
  let textMismatch = 0
  let refMismatch = 0
  for (const r of outRows) {
    const original = srcStmt.get(r.id) as any
    const chunk = getChunk(r.chunk_id)
    const text = decoder.decode(chunk.subarray(r.chunk_off, r.chunk_off + r.chunk_len))
    if (text !== original.text) {
      if (textMismatch < 3) failures.push({ check: 'text', detail: `id=${r.id}` })
      textMismatch += 1
    }
    const ref =
      r.exc ?? composeReference({ prefix: r.prefix, hasPara: !!r.has_para }, r.page_num, r.para_num)
    if (ref !== original.reference) {
      if (refMismatch < 3) {
        failures.push({ check: 'reference', detail: `id=${r.id}: ${ref} != ${original.reference}` })
      }
      refMismatch += 1
    }
  }
  freeDCtx(dctx)
  if (textMismatch > 3) failures.push({ check: 'text', detail: `${textMismatch} total mismatches` })
  if (refMismatch > 3) {
    failures.push({ check: 'reference', detail: `${refMismatch} total mismatches` })
  }

  // 3. Phrase search parity against the source FTS index.
  for (const phrase of ['great controversy', 'righteousness by faith', 'the third angel']) {
    const q = `"${phrase}"`
    const a = (
      src.prepare('SELECT COUNT(*) n FROM paragraphs_fts WHERE paragraphs_fts MATCH ?').get(q) as any
    ).n
    const b = (
      out.prepare('SELECT COUNT(*) n FROM paragraphs_fts WHERE paragraphs_fts MATCH ?').get(q) as any
    ).n
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
