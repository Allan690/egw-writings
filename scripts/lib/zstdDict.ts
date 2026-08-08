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
