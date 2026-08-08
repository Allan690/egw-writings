import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOpfsSupported, maySupportOpfs } from './opfsSupport'

afterEach(() => {
  vi.unstubAllGlobals()
})

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

describe('maySupportOpfs', () => {
  it('is false without storage.getDirectory', () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('Worker', function () {})
    expect(maySupportOpfs()).toBe(false)
  })

  it('is false without Worker support', () => {
    vi.stubGlobal('navigator', { storage: { getDirectory: () => {} } })
    vi.stubGlobal('Worker', undefined)
    expect(maySupportOpfs()).toBe(false)
  })

  it('is true on the main thread even though createSyncAccessHandle is absent there', () => {
    // The precheck must not require the worker-only API, or it would report
    // false in every browser when called from the main thread.
    vi.stubGlobal('navigator', { storage: { getDirectory: () => {} } })
    vi.stubGlobal('Worker', function () {})
    vi.stubGlobal('FileSystemFileHandle', function () {})
    expect(maySupportOpfs()).toBe(true)
  })
})
