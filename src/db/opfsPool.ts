import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

export const POOL_NAME = 'egw-corpus-pool'

/** 16MB page cache. SQLite reads negative values as KiB. */
const CACHE_SIZE_KIB = -16000

type SAHPoolUtil = Awaited<
  ReturnType<Awaited<ReturnType<typeof sqlite3InitModule>>['installOpfsSAHPoolVfs']>
>
type Database = InstanceType<SAHPoolUtil['OpfsSAHPoolDb']>

let poolPromise: Promise<SAHPoolUtil> | null = null

/**
 * Installs the OPFS SAHPool VFS. Memoized: installing twice races, and the
 * pool holds exclusive sync access handles.
 *
 * SAHPool specifically (not the plain "opfs" VFS) because it needs no
 * SharedArrayBuffer, and therefore no COOP/COEP headers on the deployment.
 * Worker-only — createSyncAccessHandle does not exist on the main thread.
 */
export function getPool(): Promise<SAHPoolUtil> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const sqlite3 = await sqlite3InitModule()
      return sqlite3.installOpfsSAHPoolVfs({
        name: POOL_NAME,
        // One slot per file: EGW + Pioneers + headroom for replacement.
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

export type { Database, SAHPoolUtil }
