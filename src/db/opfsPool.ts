import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

export const POOL_NAME = 'egw-corpus-pool'

/** 16MB page cache. SQLite reads negative values as KiB. */
const CACHE_SIZE_KIB = -16000

type SAHPoolUtil = Awaited<
  ReturnType<Awaited<ReturnType<typeof sqlite3InitModule>>['installOpfsSAHPoolVfs']>
>
type Database = InstanceType<SAHPoolUtil['OpfsSAHPoolDb']>

let poolPromise: Promise<SAHPoolUtil> | null = null

const ACQUIRE_ATTEMPTS = 5
const ACQUIRE_BACKOFF_MS = 250

function isHandleConflict(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /Access Handle|NoModificationAllowedError|already open/i.test(msg)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Installs the OPFS SAHPool VFS. Memoized: installing twice races, and the
 * pool holds exclusive sync access handles on every slot it owns.
 *
 * SAHPool specifically (not the plain "opfs" VFS) because it needs no
 * SharedArrayBuffer, and therefore no COOP/COEP headers on the deployment.
 * Worker-only — createSyncAccessHandle does not exist on the main thread.
 *
 * Acquisition is retried because a replaced worker releases its handles
 * asynchronously: during Vite HMR, and briefly after a tab closes, the old
 * pool can still hold them. A conflict that outlives the retries means
 * another tab genuinely owns the corpus, which is reported as such.
 */
export function getPool(): Promise<SAHPoolUtil> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const sqlite3 = await sqlite3InitModule()
      let lastErr: unknown
      for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt++) {
        try {
          return await sqlite3.installOpfsSAHPoolVfs({
            name: POOL_NAME,
            // One slot per file: EGW + Pioneers + headroom for replacement.
            initialCapacity: 8,
          })
        } catch (err) {
          lastErr = err
          if (!isHandleConflict(err)) throw err
          await sleep(ACQUIRE_BACKOFF_MS * (attempt + 1))
        }
      }
      throw new Error(
        'The corpus is open in another tab. Close the other tab and reload — ' +
          'offline storage can only be used by one tab at a time.',
        { cause: lastErr },
      )
    })().catch((err) => {
      // Never cache a rejection: a retry after the conflict clears must be
      // able to succeed rather than replaying the original failure forever.
      poolPromise = null
      throw err
    })
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

export type { Database, SAHPoolUtil }
