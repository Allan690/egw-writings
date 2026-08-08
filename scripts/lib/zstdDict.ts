import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compressUsingDict, createCCtx, freeCCtx } from '@bokuweb/zstd-wasm'
import { ensureZstd } from '../../src/lib/zstd'

export const DICT_TARGET_BYTES = 1024 * 1024
export const ZSTD_LEVEL = 19

const RAW_DICT_FALLBACK_BYTES = 4096

export { ensureZstd }

/**
 * Builds a raw content dictionary from the samples themselves. zstd treats a
 * buffer that lacks the dictionary magic number as raw content, which is valid
 * input to compress/decompressUsingDict. Used when there are too few samples
 * to train a real dictionary.
 */
function rawContentDictionary(samples: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(RAW_DICT_FALLBACK_BYTES)
  let at = 0
  for (const s of samples) {
    const take = Math.min(s.length, RAW_DICT_FALLBACK_BYTES - at)
    out.set(s.subarray(0, take), at)
    at += take
    if (at >= RAW_DICT_FALLBACK_BYTES) break
  }
  // A short but non-empty dictionary is what matters; pad the remainder.
  return at === 0 ? new Uint8Array(RAW_DICT_FALLBACK_BYTES) : out
}

/**
 * Trains a zstd dictionary by shelling out to the zstd CLI (the wasm build has
 * no trainer). Falls back to a raw content dictionary when the sample set is
 * too small to train on — zstd requires roughly a hundred samples.
 */
export async function trainDictionary(
  samples: Uint8Array[],
  maxBytes: number = DICT_TARGET_BYTES,
): Promise<Uint8Array> {
  const dir = mkdtempSync(join(tmpdir(), 'zdict-'))
  try {
    samples.forEach((s, i) => writeFileSync(join(dir, `${String(i).padStart(6, '0')}.bin`), s))
    const dictPath = join(dir, 'dictionary')
    try {
      execFileSync(
        'zstd',
        ['--train', `${dir}/*.bin`, '-o', dictPath, `--maxdict=${maxBytes}`],
        { shell: true, stdio: 'pipe' },
      )
    } catch {
      return rawContentDictionary(samples)
    }
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
  await ensureZstd()
  const cctx = createCCtx()
  try {
    return chunks.map((c) => compressUsingDict(cctx, c, dict, level))
  } finally {
    freeCCtx(cctx)
  }
}
