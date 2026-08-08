import { useCallback, useEffect, useState } from 'react'
import { getSetting, setSetting } from '../db/userStore'
import {
  DEFAULT_READER_SETTINGS,
  type FontSize,
  type LineHeight,
  type ReaderSettings,
  type ReaderTheme,
} from '../types'

const SETTINGS_KEY = 'reader_settings'

/**
 * Reader settings live in one module-level store rather than in each caller's
 * state. Both App and ReaderView use this hook, and with per-instance state
 * they each wrote document.documentElement.dataset.theme from their own copy —
 * so whichever re-rendered last won, and changing the theme in the reader could
 * be silently reverted by a stale copy elsewhere.
 */
let current: ReaderSettings = DEFAULT_READER_SETTINGS
let loadedOnce = false
let loadPromise: Promise<void> | null = null
let listeners: ((s: ReaderSettings) => void)[] = []

function apply(settings: ReaderSettings) {
  const root = document.documentElement
  root.dataset.theme = settings.theme
  root.dataset.fontSize = settings.fontSize
  root.dataset.lineHeight = settings.lineHeight
}

function emit() {
  for (const fn of listeners) fn(current)
}

function ensureLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = getSetting<ReaderSettings>(SETTINGS_KEY, DEFAULT_READER_SETTINGS).then((s) => {
      current = { ...DEFAULT_READER_SETTINGS, ...s }
      loadedOnce = true
      apply(current)
      emit()
    })
  }
  return loadPromise
}

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(current)
  const [loaded, setLoaded] = useState(loadedOnce)

  useEffect(() => {
    const listener = (next: ReaderSettings) => {
      setSettings(next)
      setLoaded(true)
    }
    listeners.push(listener)
    void ensureLoaded()
    // Adopt whatever the store already holds when mounting late.
    if (loadedOnce) listener(current)
    return () => {
      listeners = listeners.filter((l) => l !== listener)
    }
  }, [])

  const update = useCallback((patch: Partial<ReaderSettings>) => {
    current = { ...current, ...patch }
    apply(current)
    void setSetting(SETTINGS_KEY, current)
    emit()
  }, [])

  return {
    settings,
    loaded,
    setTheme: (theme: ReaderTheme) => update({ theme }),
    setFontSize: (fontSize: FontSize) => update({ fontSize }),
    setLineHeight: (lineHeight: LineHeight) => update({ lineHeight }),
    update,
  }
}

/**
 * Size and leading are driven by CSS custom properties keyed off the root
 * data attributes; this remains for callers that still expect a class string.
 */
export function readerTextClass(_settings: ReaderSettings): string {
  return 'reader-text'
}
