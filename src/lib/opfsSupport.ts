/**
 * OPFS with synchronous access handles is what lets SQLite page from disk
 * instead of holding the whole corpus in memory. Requires Chrome 108+,
 * Safari 17+, or Firefox 111+.
 *
 * MUST be called from a worker. `createSyncAccessHandle` is exposed only in
 * worker scopes, so on the main thread this returns false in every browser,
 * including ones that fully support OPFS. The corpus worker owns this check
 * and reports the result back to the UI.
 */
export function isOpfsSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  if (!navigator.storage?.getDirectory) return false
  if (typeof FileSystemFileHandle === 'undefined') return false
  return typeof FileSystemFileHandle.prototype.createSyncAccessHandle === 'function'
}

/**
 * Main-thread precheck. Cannot confirm sync access handles — only a worker
 * can — so it verifies the prerequisites that are observable here and leaves
 * the definitive answer to isOpfsSupported() inside the worker.
 */
export function maySupportOpfs(): boolean {
  if (typeof navigator === 'undefined') return false
  if (!navigator.storage?.getDirectory) return false
  return typeof Worker !== 'undefined'
}
