import { useCallback, useEffect, useRef, useState } from 'react'
import { getSearchApi } from '../db/corpus'
import {
  addBookmark,
  addHighlight,
  getHighlightsForParagraph,
  listBookmarks,
  listHighlights,
  removeBookmark,
  removeHighlight,
  saveReadingPosition,
} from '../db/userStore'
import { readerTextClass, useReaderSettings } from '../hooks/useReaderSettings'
import { getSelectionOffsets, highlightColor, renderHighlightedText } from '../lib/highlightText'
import type {
  Bookmark,
  Highlight as SavedHighlight,
  Paragraph,
  ReaderTarget,
} from '../types'
import { ChapterPicker } from './ChapterPicker'
import { IconChevronDown, IconChevronLeft } from './Icons'
import { ReaderSettingsPanel } from './ReaderSettingsPanel'
import { SelectionToolbar } from './SelectionToolbar'

interface Props {
  target: ReaderTarget
  onBack: () => void
}

interface ChapterOption {
  number: number
  title: string
}

interface PendingSelection {
  paragraphId: number
  reference: string
  text: string
  startOffset: number
  endOffset: number
  fullText: string
}

export function ReaderView({ target, onBack }: Props) {
  const { settings, setTheme, setFontSize, setLineHeight } = useReaderSettings()
  const [bookTitle, setBookTitle] = useState('')
  const [bookCode, setBookCode] = useState('')
  const [chapters, setChapters] = useState<ChapterOption[]>([])
  const [chapterNum, setChapterNum] = useState(target.chapterNum)
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([])
  const [highlightsByPara, setHighlightsByPara] = useState<Map<number, SavedHighlight[]>>(new Map())
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showChapterPicker, setShowChapterPicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selection, setSelection] = useState<PendingSelection | null>(null)
  const highlightRef = useRef<number | undefined>(target.paragraphId)
  const textClass = readerTextClass(settings)

  const loadHighlights = useCallback(async (paras: Paragraph[]) => {
    const entries = await Promise.all(
      paras.map(async (p) => [p.id, await getHighlightsForParagraph(p.id)] as const),
    )
    setHighlightsByPara(new Map(entries))
  }, [])

  const loadChapter = useCallback(
    async (bookId: string, num: number) => {
      setLoading(true)
      setSelection(null)
      const api = getSearchApi()
      const [books, chs, paras] = await Promise.all([
        api.getBooks(),
        api.getChapters(bookId),
        api.getChapterParagraphs(bookId, num),
      ])
      const book = books.find((b) => b.id === bookId)
      setBookTitle(book?.title ?? '')
      setBookCode(book?.code ?? '')
      setChapters(chs.map((c) => ({ number: c.number, title: c.title })))
      setParagraphs(paras as Paragraph[])
      setChapterNum(num)
      await loadHighlights(paras as Paragraph[])
      setLoading(false)

      await saveReadingPosition({
        bookId,
        chapterNum: num,
        paragraphId: highlightRef.current ?? paras[0]?.id ?? 0,
        updatedAt: Date.now(),
      })
    },
    [loadHighlights],
  )

  useEffect(() => {
    void loadChapter(target.bookId, target.chapterNum)
  }, [target.bookId, target.chapterNum, loadChapter])

  useEffect(() => {
    if (!loading && target.paragraphId && highlightRef.current) {
      const el = document.getElementById(`para-${target.paragraphId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      highlightRef.current = undefined
    }
  }, [loading, target.paragraphId])

  useEffect(() => {
    listBookmarks().then((marks) => {
      setBookmarkedIds(new Set(marks.map((m) => m.paragraphId)))
    })
  }, [])

  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) {
        setSelection((prev) => (prev ? null : prev))
        return
      }

      const anchor = sel.anchorNode?.parentElement?.closest('[data-para-id]') as HTMLElement | null
      if (!anchor) return

      const offsets = getSelectionOffsets(anchor)
      if (!offsets) return

      setSelection({
        paragraphId: Number(anchor.dataset.paraId),
        reference: anchor.dataset.reference ?? '',
        text: offsets.text,
        startOffset: offsets.startOffset,
        endOffset: offsets.endOffset,
        fullText: anchor.dataset.fullText ?? '',
      })
    }

    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  const toggleBookmark = async (para: Paragraph) => {
    if (bookmarkedIds.has(para.id)) {
      const marks = await listBookmarks()
      const existing = marks.find((m) => m.paragraphId === para.id)
      if (existing) await removeBookmark(existing.id)
      setBookmarkedIds((prev) => {
        const next = new Set(prev)
        next.delete(para.id)
        return next
      })
    } else {
      await addBookmark(para.id, para.reference, para.text.slice(0, 200))
      setBookmarkedIds((prev) => new Set(prev).add(para.id))
    }
  }

  const applyHighlight = async (color: string) => {
    if (!selection) return
    const h = await addHighlight(
      selection.paragraphId,
      selection.reference,
      selection.text,
      selection.startOffset,
      selection.endOffset,
      color,
    )
    setHighlightsByPara((prev) => {
      const next = new Map(prev)
      const existing = next.get(selection.paragraphId) ?? []
      next.set(selection.paragraphId, [...existing, h])
      return next
    })
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  const shareSelection = async () => {
    const text = selection
      ? `${selection.reference} — "${selection.text}"`
      : ''
    if (!text) return
    if (navigator.share) {
      await navigator.share({ text }).catch(() => undefined)
    } else {
      await navigator.clipboard.writeText(text)
    }
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  const shareParagraph = async (para: Paragraph) => {
    const text = `${para.reference} — "${para.text.slice(0, 280)}${para.text.length > 280 ? '…' : ''}"`
    if (navigator.share) {
      await navigator.share({ text }).catch(() => undefined)
    } else {
      await navigator.clipboard.writeText(text)
    }
  }

  const chapterTitle =
    chapters.find((c) => c.number === chapterNum)?.title ?? `Chapter ${chapterNum}`

  const prevChapter = chapters.find((c) => c.number < chapterNum)
  const nextChapter = [...chapters].reverse().find((c) => c.number > chapterNum)

  const chapterIndex = chapters.findIndex((c) => c.number === chapterNum)
  const chapterPosition = chapterIndex >= 0 ? chapterIndex + 1 : chapterNum

  return (
    <div className="flex h-[100dvh] flex-col bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg)]/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 text-[var(--text-3)] hover:text-[var(--text)]"
          >
            ← Back
          </button>
          <span className="text-[var(--text-3)]">/</span>
          <button
            type="button"
            onClick={() => setShowChapterPicker(true)}
            className="flex min-w-0 items-center gap-1 font-medium text-[var(--text)]"
          >
            <span className="truncate">{bookTitle || '…'}</span>
            <IconChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-xs text-[var(--text-3)] sm:inline">
            Ch. {chapterPosition}/{chapters.length || '…'}
          </span>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="rounded-lg px-2.5 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]"
            aria-label="Reading settings"
          >
            Aa
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto max-w-[42rem] px-4 py-6">
        {loading ? (
          <p className="text-center text-sm text-[var(--text-3)]">Loading chapter…</p>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--accent)]">
              {bookCode} · Chapter {chapterNum}
            </p>
            <h1 className="mt-1 font-serif text-2xl font-semibold leading-tight text-[var(--text)] md:text-3xl">
              {chapterTitle}
            </h1>

            <article className="mt-8 space-y-6">
              {paragraphs.map((para) => {
                const saved = bookmarkedIds.has(para.id)
                const jumpHere = para.id === target.paragraphId
                const paraHighlights = highlightsByPara.get(para.id) ?? []
                return (
                  <section
                    key={para.id}
                    id={`para-${para.id}`}
                    className={`group scroll-mt-24 ${jumpHere ? 'rounded-lg bg-[var(--accent-soft)]/60 px-3 py-2 -mx-3' : ''}`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] text-[var(--text-3)]">{para.reference}</span>
                      <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => void toggleBookmark(para)}
                          className={`text-xs ${saved ? 'text-[var(--accent)]' : 'text-[var(--text-3)]'}`}
                        >
                          {saved ? 'Saved' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void shareParagraph(para)}
                          className="text-xs text-[var(--text-3)]"
                        >
                          Share
                        </button>
                      </div>
                    </div>
                    <p
                      data-para-id={para.id}
                      data-reference={para.reference}
                      data-full-text={para.text}
                      className={`font-serif text-[var(--text)] ${textClass}`}
                    >
                      {renderHighlightedText(para.text, paraHighlights)}
                    </p>
                  </section>
                )
              })}
            </article>
          </>
        )}
        </div>
      </div>

      {!loading && (
        <footer className="z-30 flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            disabled={!prevChapter}
            onClick={() => prevChapter && void loadChapter(target.bookId, prevChapter.number)}
            className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] disabled:opacity-30"
          >
            <IconChevronLeft className="h-4 w-4" />
            Prev
          </button>
          <button
            type="button"
            onClick={() => setShowChapterPicker(true)}
            className="text-sm text-[var(--text-3)]"
          >
            {chapterPosition} / {chapters.length}
          </button>
          <button
            type="button"
            disabled={!nextChapter}
            onClick={() => nextChapter && void loadChapter(target.bookId, nextChapter.number)}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-30"
          >
            Next →
          </button>
        </footer>
      )}

      {selection && (
        <SelectionToolbar
          onHighlight={(color) => void applyHighlight(color)}
          onBookmark={async () => {
            if (!selection) return
            await addBookmark(
              selection.paragraphId,
              selection.reference,
              selection.text,
            )
            setBookmarkedIds((prev) => new Set(prev).add(selection.paragraphId))
            window.getSelection()?.removeAllRanges()
            setSelection(null)
          }}
          onShare={() => void shareSelection()}
          onDismiss={() => {
            window.getSelection()?.removeAllRanges()
            setSelection(null)
          }}
        />
      )}

      <ChapterPicker
        open={showChapterPicker}
        onClose={() => setShowChapterPicker(false)}
        chapters={chapters}
        current={chapterNum}
        onSelect={(num) => void loadChapter(target.bookId, num)}
      />

      <ReaderSettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        theme={settings.theme}
        fontSize={settings.fontSize}
        lineHeight={settings.lineHeight}
        onThemeChange={setTheme}
        onFontSizeChange={setFontSize}
        onLineHeightChange={setLineHeight}
      />
    </div>
  )
}

interface BookmarksProps {
  onOpen: (target: ReaderTarget) => void
}

export function SavedView({ onOpen }: BookmarksProps) {
  const [tab, setTab] = useState<'bookmarks' | 'highlights'>('bookmarks')
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [highlights, setHighlights] = useState<SavedHighlight[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [marks, highs] = await Promise.all([listBookmarks(), listHighlights()])
    setBookmarks(marks)
    setHighlights(highs)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openItem = async (paragraphId: number) => {
    const para = await getSearchApi().getParagraph(paragraphId)
    if (!para) return
    onOpen({
      bookId: para.book_id,
      chapterNum: para.chapter_num,
      paragraphId: para.id,
    })
  }

  const handleRemoveBookmark = async (id: string) => {
    await removeBookmark(id)
    await refresh()
  }

  const handleRemoveHighlight = async (id: string) => {
    await removeHighlight(id)
    await refresh()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-[var(--text)] md:text-3xl">Saved</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">Bookmarks and highlights on this device</p>
      </header>

      <div className="mb-4 flex gap-1 rounded-lg bg-[var(--surface-2)] p-1">
        <button
          type="button"
          onClick={() => setTab('bookmarks')}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            tab === 'bookmarks'
              ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
              : 'text-[var(--text-3)]'
          }`}
        >
          Bookmarks ({bookmarks.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('highlights')}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            tab === 'highlights'
              ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
              : 'text-[var(--text-3)]'
          }`}
        >
          Highlights ({highlights.length})
        </button>
      </div>

        {loading ? (
          <p className="text-center text-sm text-[var(--text-3)]">Loading…</p>
        ) : tab === 'bookmarks' ? (
          bookmarks.length === 0 ? (
            <EmptySaved
              title="No bookmarks yet"
              hint="Tap Save while reading to keep a paragraph."
            />
          ) : (
            <ul className="space-y-2">
              {bookmarks.map((mark) => (
                <li
                  key={mark.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => void openItem(mark.paragraphId)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-xs font-semibold text-[var(--accent)]">{mark.reference}</p>
                      {mark.text && (
                        <p className="mt-2 line-clamp-3 font-serif text-[15px] leading-relaxed text-[var(--text-2)]">
                          {mark.text}
                        </p>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemoveBookmark(mark.id)}
                      className="text-sm text-[var(--text-3)] hover:text-red-600"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : highlights.length === 0 ? (
          <EmptySaved
            title="No highlights yet"
            hint="Select text while reading, then choose a highlight color."
          />
        ) : (
          <ul className="space-y-2">
            {highlights.map((h) => (
              <li
                key={h.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => void openItem(h.paragraphId)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="text-xs font-semibold text-[var(--accent)]">{h.reference}</p>
                    <p
                      className="mt-2 rounded px-1 font-serif text-[15px] leading-relaxed text-[var(--text-2)]"
                      style={{ backgroundColor: highlightColor(h.color) }}
                    >
                      &ldquo;{h.text}&rdquo;
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemoveHighlight(h.id)}
                    className="text-sm text-[var(--text-3)] hover:text-red-600"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

function EmptySaved({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center">
      <p className="font-serif text-lg text-[var(--text)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--text-3)]">{hint}</p>
    </div>
  )
}

/** @deprecated Use SavedView */
export const BookmarksView = SavedView
