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

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_READER_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getSetting<ReaderSettings>(SETTINGS_KEY, DEFAULT_READER_SETTINGS).then((s) => {
      setSettings(s)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!loaded) return
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.dataset.fontSize = settings.fontSize
    document.documentElement.dataset.lineHeight = settings.lineHeight
  }, [settings, loaded])

  const update = useCallback(async (patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      void setSetting(SETTINGS_KEY, next)
      return next
    })
  }, [])

  return {
    settings,
    loaded,
    setTheme: (theme: ReaderTheme) => void update({ theme }),
    setFontSize: (fontSize: FontSize) => void update({ fontSize }),
    setLineHeight: (lineHeight: LineHeight) => void update({ lineHeight }),
    update,
  }
}

export function readerTextClass(settings: ReaderSettings): string {
  const size =
    settings.fontSize === 'sm'
      ? 'text-[15px]'
      : settings.fontSize === 'md'
        ? 'text-[17px]'
        : settings.fontSize === 'lg'
          ? 'text-[19px]'
          : 'text-[21px]'

  const leading =
    settings.lineHeight === 'normal'
      ? 'leading-[1.6]'
      : settings.lineHeight === 'relaxed'
        ? 'leading-[1.75]'
        : 'leading-[1.9]'

  return `${size} ${leading}`
}
