import { init } from '@bokuweb/zstd-wasm'

/**
 * The single initialization point for @bokuweb/zstd-wasm.
 *
 * init() is NOT idempotent: every call re-runs Module.init(), re-instantiating
 * the wasm module with fresh memory and detaching the previous heap, while
 * waitInitialized() resolves immediately because its promise already settled.
 * A second call corrupts in-flight buffers — compression silently emits
 * zero-filled frames that only fail later at decompression with zstd error 10
 * (prefix_unknown).
 *
 * This lives in src/lib so the build scripts and the browser share ONE
 * memoized promise. Defining a second memo in another module reintroduces the
 * bug, because each module memo calls init() once and the total exceeds one.
 */
let zstdReady: Promise<void> | null = null

export function ensureZstd(): Promise<void> {
  if (!zstdReady) zstdReady = init()
  return zstdReady
}
