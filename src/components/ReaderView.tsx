import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSearchApi } from '../db/corpus'
import {
  addBookmark,
  addHighlight,
  getHighlightsForParagraph,
  listBookmarks,
  removeBookmark,
  removeHighlight,
  removeHighlightsInRange,
  saveReadingPosition,
} from '../db/userStore'
import { useReaderSettings } from '../hooks/useReaderSettings'
import {
  getSelectionOffsets,
  highlightsOverlapSelection,
  renderHighlightedText,
} from '../lib/highlightText'
import { findTermRanges } from '../lib/searchTerms'
import type { BookCollection } from '../lib/corpusConstants'
import type { Highlight as SavedHighlight, Paragraph, ReaderTarget } from '../types'
import { ChapterPicker } from './ChapterPicker'
import { CorpusBadge } from './CorpusBadge'
import {
  IconArrowLeft,
  IconBookmark,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconClose,
  IconList,
  IconType,
} from './Icons'
import { ParagraphActions } from './ParagraphActions'
import { ReaderSettingsPanel } from './ReaderSettingsPanel'
import { ChapterSkeleton } from './Skeletons'
import { SelectionToolbar } from './SelectionToolbar'

interface Props {
  target: ReaderTarget
  /** Where Back returns to — "Results", "Library", or "Saved". */
  backLabel: string
  onBack: () => void
  searchTerms: string[]
  searchQuery: string
  resultCount: number
  onOpenSettings: () => void
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
}

export function ReaderView({
  target,
  backLabel,
  onBack,
  searchTerms,
  searchQuery,
  resultCount,
  onOpenSettings,
}: Props) {
  const { settings, setTheme, setFontSize, setLineHeight } = useReaderSettings()
  const [bookTitle, setBookTitle] = useState('')
  const [bookCode, setBookCode] = useState('')
  const [bookAuthor, setBookAuthor] = useState('')
  const [bookCollection, setBookCollection] = useState<BookCollection>('egw')
  const [chapters, setChapters] = useState<ChapterOption[]>([])
  const [chapterNum, setChapterNum] = useState(target.chapterNum)
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([])
  const [highlightsByPara, setHighlightsByPara] = useState<Map<number, SavedHighlight[]>>(new Map())
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showChapterPicker, setShowChapterPicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [actionsFor, setActionsFor] = useState<Paragraph | null>(null)
  const [selection, setSelection] = useState<PendingSelection | null>(null)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [progress, setProgress] = useState(0)
  const [termCursor, setTermCursor] = useState(0)
  const [termTotal, setTermTotal] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const footerRef = useRef<HTMLElement>(null)
  const lastScrollY = useRef(0)
  const suppressAutoHide = useRef(false)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jumpTo = useRef<number | undefined>(target.paragraphId)
  /**
   * Header and footer float above the text so hiding them does not reflow the
   * page mid-sentence; the scroll container reserves their height instead.
   */
  const [chromePad, setChromePad] = useState({ top: 56, bottom: 60 })

  useEffect(() => {
    const measure = () => {
      setChromePad({
        top: headerRef.current?.offsetHeight ?? 56,
        bottom: footerRef.current?.offsetHeight ?? 60,
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (headerRef.current) observer.observe(headerRef.current)
    if (footerRef.current) observer.observe(footerRef.current)
    return () => observer.disconnect()
  }, [loading, searchQuery])

  useEffect(() => {
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current)
    }
  }, [])

  const loadHighlights = useCallback(async (paras: Paragraph[]) => {
    const entries = await Promise.all(
      paras.map(async (p) => [p.id, await getHighlightsForParagraph(p.id)] as const),
    )
    setHighlightsByPara(new Map(entries))
  }, [])

  const loadChapter = useCallback(
    async (bookId: string, num: number, scrollTop = true) => {
      setLoading(true)
      setSelection(null)
      const api = getSearchApi()
      const [book, chs, paras] = await Promise.all([
        api.getBook(bookId),
        api.getChapters(bookId),
        api.getChapterParagraphs(bookId, num),
      ])
      setBookTitle(book?.title ?? '')
      setBookCode(book?.code ?? '')
      setBookAuthor(book?.author ?? 'Ellen G. White')
      setBookCollection(book?.collection ?? 'egw')
      setChapters(chs.map((c) => ({ number: c.number, title: c.title })))
      setParagraphs(paras as Paragraph[])
      setChapterNum(num)
      await loadHighlights(paras as Paragraph[])
      setLoading(false)
      setChromeVisible(true)
      if (scrollTop) scrollRef.current?.scrollTo({ top: 0 })

      await saveReadingPosition({
        bookId,
        chapterNum: num,
        paragraphId: jumpTo.current ?? paras[0]?.id ?? 0,
        updatedAt: Date.now(),
      })
    },
    [loadHighlights],
  )

  useEffect(() => {
    void loadChapter(target.bookId, target.chapterNum, false)
  }, [target.bookId, target.chapterNum, loadChapter])

  const chapterIndex = chapters.findIndex((c) => c.number === chapterNum)
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : undefined
  const nextChapter =
    chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : undefined

  /** Warm the next chapter so paging forward never blanks the screen. */
  useEffect(() => {
    if (loading || !nextChapter) return
    const id = setTimeout(() => {
      void getSearchApi()
        .getChapterParagraphs(target.bookId, nextChapter.number)
        .catch(() => undefined)
    }, 400)
    return () => clearTimeout(id)
  }, [loading, nextChapter, target.bookId])

  // Land on the paragraph that brought us here.
  useEffect(() => {
    if (loading || !jumpTo.current) return
    const el = document.getElementById(`para-${jumpTo.current}`)
    if (el) {
      // A programmatic jump is not the reader scrolling away from the chrome,
      // so it must not trigger the auto-hide — you would arrive from a search
      // result with no header and no way back. Jump instantly rather than
      // animating: you came here to be here, and a smooth scroll over a long
      // chapter outlasts any fixed suppression window.
      suppressAutoHide.current = true
      el.scrollIntoView({ block: 'center' })
      setChromeVisible(true)
    }
    jumpTo.current = undefined
  }, [loading])

  useEffect(() => {
    void listBookmarks().then((marks) => setBookmarkedIds(new Set(marks.map((m) => m.paragraphId))))
  }, [])

  // Count matched terms once the chapter is on screen.
  useEffect(() => {
    if (loading) return
    const nodes = scrollRef.current?.querySelectorAll('[data-term]')
    setTermTotal(nodes?.length ?? 0)
    setTermCursor(0)
  }, [loading, paragraphs, searchQuery])

  /** Chrome recedes while reading forward and returns the moment you look up. */
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const y = el.scrollTop
    const max = el.scrollHeight - el.clientHeight
    setProgress(max > 0 ? Math.min(1, y / max) : 0)

    // Programmatic scrolls settle over an unknown number of frames, so the
    // suppression lifts once movement stops rather than after a fixed delay.
    if (suppressAutoHide.current) {
      lastScrollY.current = y
      if (settleTimer.current) clearTimeout(settleTimer.current)
      settleTimer.current = setTimeout(() => {
        suppressAutoHide.current = false
        lastScrollY.current = scrollRef.current?.scrollTop ?? 0
      }, 150)
      return
    }

    const delta = y - lastScrollY.current
    if (Math.abs(delta) > 6) {
      setChromeVisible(delta < 0 || y < 64)
      lastScrollY.current = y
    }
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
      })
      setChromeVisible(true)
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  const goToChapter = useCallback(
    (num: number) => {
      jumpTo.current = undefined
      void loadChapter(target.bookId, num)
    },
    [loadChapter, target.bookId],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'ArrowRight' && nextChapter) {
        e.preventDefault()
        goToChapter(nextChapter.number)
      } else if (e.key === 'ArrowLeft' && prevChapter) {
        e.preventDefault()
        goToChapter(prevChapter.number)
      } else if (e.key === 'j') {
        scrollRef.current?.scrollBy({ top: 120, behavior: 'smooth' })
      } else if (e.key === 'k') {
        scrollRef.current?.scrollBy({ top: -120, behavior: 'smooth' })
      } else if (e.key === 'Escape') {
        onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goToChapter, nextChapter, prevChapter, onBack])

  const stepTerm = (direction: 1 | -1) => {
    const nodes = scrollRef.current?.querySelectorAll<HTMLElement>('[data-term]')
    if (!nodes || nodes.length === 0) return
    const next = (termCursor + direction + nodes.length) % nodes.length
    setTermCursor(next)
    nodes[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

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
    const paraHighlights = highlightsByPara.get(selection.paragraphId) ?? []
    const exact = paraHighlights.find(
      (h) => h.startOffset === selection.startOffset && h.endOffset === selection.endOffset,
    )
    if (exact?.color === color) {
      await removeHighlight(exact.id)
      setHighlightsByPara((prev) => {
        const next = new Map(prev)
        next.set(
          selection.paragraphId,
          (next.get(selection.paragraphId) ?? []).filter((h) => h.id !== exact.id),
        )
        return next
      })
      window.getSelection()?.removeAllRanges()
      setSelection(null)
      return
    }

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
      next.set(selection.paragraphId, [
        ...existing.filter(
          (item) =>
            !(
              item.startOffset === selection.startOffset && item.endOffset === selection.endOffset
            ),
        ),
        h,
      ])
      return next
    })
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  const clearHighlight = async () => {
    if (!selection) return
    const removedIds = await removeHighlightsInRange(
      selection.paragraphId,
      selection.startOffset,
      selection.endOffset,
    )
    setHighlightsByPara((prev) => {
      const next = new Map(prev)
      next.set(
        selection.paragraphId,
        (next.get(selection.paragraphId) ?? []).filter((h) => !removedIds.includes(h.id)),
      )
      return next
    })
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  const selectionHighlights = selection
    ? highlightsOverlapSelection(
        highlightsByPara.get(selection.paragraphId) ?? [],
        selection.startOffset,
        selection.endOffset,
      )
    : []

  const shareText = async (text: string) => {
    if (navigator.share) {
      await navigator.share({ text }).catch(() => undefined)
    } else {
      await navigator.clipboard.writeText(text).catch(() => undefined)
    }
  }

  const chapterTitle = chapters.find((c) => c.number === chapterNum)?.title ?? `Chapter ${chapterNum}`
  const chapterPosition = chapterIndex >= 0 ? chapterIndex + 1 : chapterNum
  const termRangesFor = useMemo(() => {
    if (searchTerms.length === 0) return null
    return (text: string) => findTermRanges(text, searchTerms)
  }, [searchTerms])

  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {/* Desktop table of contents — replaces the modal on wide screens. */}
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] lg:block">
        <p
          className="cite sticky top-0 bg-[var(--surface)] px-4 py-3"
          style={{ letterSpacing: '0.08em', color: 'var(--text-3)' }}
        >
          CONTENTS
        </p>
        <ul className="pb-6">
          {chapters.map((ch, i) => {
            const active = ch.number === chapterNum
            return (
              <li key={ch.number}>
                <button
                  type="button"
                  onClick={() => goToChapter(ch.number)}
                  aria-current={active ? 'true' : undefined}
                  className="flex w-full gap-2.5 px-4 py-2 text-left transition-colors hover:bg-[var(--surface-2)]"
                  style={{
                    background: active ? 'var(--accent-soft)' : undefined,
                    borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  <span
                    className="cite w-5 shrink-0 pt-0.5 text-right"
                    style={{ color: active ? 'var(--accent)' : 'var(--text-3)' }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="font-serif text-[13px] leading-snug"
                    style={{
                      color: active ? 'var(--text)' : 'var(--text-2)',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {ch.title}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <div className="relative min-w-0 flex-1">
      <header
        ref={headerRef}
        className="absolute inset-x-0 top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-md"
        style={{
          transition: 'transform var(--dur-2) var(--ease), opacity var(--dur-2) var(--ease)',
          transform: chromeVisible ? 'none' : 'translateY(-100%)',
          opacity: chromeVisible ? 1 : 0,
          pointerEvents: chromeVisible ? undefined : 'none',
        }}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-[2.25rem] shrink-0 items-center gap-1.5 rounded-[var(--r-sm)] px-2 text-[var(--t-small)] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <IconArrowLeft />
            {backLabel}
          </button>

          <button
            type="button"
            onClick={() => setShowChapterPicker(true)}
            className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-[var(--r-sm)] px-2 py-1 transition-colors hover:bg-[var(--surface-2)]"
          >
            <span className="truncate text-[var(--t-small)] font-medium text-[var(--text)]">
              {bookTitle || '…'}
            </span>
            <IconChevronDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
          </button>

          <div className="flex shrink-0 items-center">
            <span
              className="mr-1 hidden font-mono text-[var(--t-micro)] text-[var(--text-3)] sm:inline"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {chapterPosition}/{chapters.length || '—'}
            </span>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)]"
              aria-label="Reading settings"
            >
              <IconType />
            </button>
          </div>
        </div>

        {searchQuery && (
          <SearchContextBar
            query={searchQuery}
            resultCount={resultCount}
            termCursor={termCursor}
            termTotal={termTotal}
            onStep={stepTerm}
            onBack={onBack}
          />
        )}

        {/* Position within the chapter, as a hairline rather than a widget.
            The faint full-width track is what makes it read as progress and
            not as a stray rule belonging to whatever sits above it. */}
        <div
          className="absolute inset-x-0 bottom-0 h-[2px]"
          style={{ background: 'color-mix(in srgb, var(--border) 70%, transparent)' }}
          aria-hidden
        >
          <div
            className="h-full"
            style={{
              width: `${progress * 100}%`,
              background: 'var(--accent)',
              transition: 'width var(--dur-1) linear',
            }}
          />
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-y-contain"
        style={{ paddingTop: chromePad.top, paddingBottom: chromePad.bottom }}
      >
        <div className="reader-measure mx-auto px-5 py-7 sm:px-8 lg:pl-24">
            {loading ? (
              <ChapterSkeleton />
            ) : (
              <>
                <div className="anim-fade">
                  <p className="cite" style={{ letterSpacing: '0.08em' }}>
                    {bookCode} · CHAPTER {chapterNum}
                  </p>
                  <h1 className="mt-2.5 font-serif text-[var(--t-display)] font-semibold leading-[1.15] text-[var(--text)]">
                    {chapterTitle}
                  </h1>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <p className="font-serif text-[15px] italic text-[var(--text-2)]">{bookTitle}</p>
                    <CorpusBadge
                      collection={bookCollection}
                      author={bookAuthor}
                      size="md"
                    />
                  </div>
                </div>

                <article className="mt-9 space-y-5">
                  {paragraphs.map((para) => (
                    <ParagraphBlock
                      key={para.id}
                      para={para}
                      highlights={highlightsByPara.get(para.id) ?? []}
                      termRanges={termRangesFor ? termRangesFor(para.text) : []}
                      bookmarked={bookmarkedIds.has(para.id)}
                      isTarget={para.id === target.paragraphId}
                      onOpenActions={() => setActionsFor(para)}
                    />
                  ))}
                </article>

                {nextChapter ? (
                  <button
                    type="button"
                    onClick={() => goToChapter(nextChapter.number)}
                    className="mt-12 mb-6 flex w-full items-center gap-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors hover:border-[var(--accent)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="cite" style={{ letterSpacing: '0.08em' }}>
                        NEXT CHAPTER
                      </p>
                      <p className="mt-1 font-serif text-[17px] leading-snug text-[var(--text)]">
                        {nextChapter.title}
                      </p>
                    </div>
                    <IconChevronRight className="text-[var(--text-3)]" />
                  </button>
                ) : (
                  <p className="mt-12 mb-6 text-center font-serif text-[15px] italic text-[var(--text-3)]">
                    End of {bookTitle}
                  </p>
                )}
              </>
            )}
        </div>
      </div>

      {!loading && (
        <footer
          ref={footerRef}
          className="absolute inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)]"
          style={{
            transition: 'transform var(--dur-2) var(--ease)',
            transform: chromeVisible ? 'none' : 'translateY(100%)',
            pointerEvents: chromeVisible ? undefined : 'none',
          }}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              disabled={!prevChapter}
              onClick={() => prevChapter && goToChapter(prevChapter.number)}
              className="flex min-h-[2.5rem] items-center gap-1 rounded-[var(--r-sm)] px-3 text-[var(--t-small)] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] disabled:pointer-events-none disabled:opacity-30"
            >
              <IconChevronLeft />
              Previous
            </button>

            <button
              type="button"
              onClick={() => setShowChapterPicker(true)}
              className="flex min-h-[2.5rem] items-center gap-1.5 rounded-[var(--r-sm)] px-3 text-[var(--t-small)] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-2)] lg:hidden"
            >
              <IconList />
              <span style={{ fontVariantNumeric: 'tabular-nums' }} className="font-mono">
                {chapterPosition}/{chapters.length}
              </span>
            </button>

            <button
              type="button"
              disabled={!nextChapter}
              onClick={() => nextChapter && goToChapter(nextChapter.number)}
              className="flex min-h-[2.5rem] items-center gap-1 rounded-[var(--r-sm)] px-4 text-[var(--t-small)] font-medium transition-colors disabled:pointer-events-none disabled:opacity-30"
              style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
            >
              Next
              <IconChevronRight />
            </button>
          </div>
        </footer>
      )}
      </div>

      {selection && (
        <SelectionToolbar
          onHighlight={(color) => void applyHighlight(color)}
          onRemoveHighlight={() => void clearHighlight()}
          canRemoveHighlight={selectionHighlights.length > 0}
          onBookmark={async () => {
            await addBookmark(selection.paragraphId, selection.reference, selection.text)
            setBookmarkedIds((prev) => new Set(prev).add(selection.paragraphId))
            window.getSelection()?.removeAllRanges()
            setSelection(null)
          }}
          onShare={() => {
            void shareText(`“${selection.text}” —${selection.reference}`)
            window.getSelection()?.removeAllRanges()
            setSelection(null)
          }}
          onDismiss={() => {
            window.getSelection()?.removeAllRanges()
            setSelection(null)
          }}
        />
      )}

      <ParagraphActions
        para={actionsFor}
        bookmarked={actionsFor ? bookmarkedIds.has(actionsFor.id) : false}
        onClose={() => setActionsFor(null)}
        onToggleBookmark={async (para) => {
          await toggleBookmark(para)
          setActionsFor(null)
        }}
        onShare={(para) => {
          void shareText(
            `“${para.text.slice(0, 280)}${para.text.length > 280 ? '…' : ''}” —${para.reference}`,
          )
          setActionsFor(null)
        }}
      />

      <ChapterPicker
        open={showChapterPicker}
        onClose={() => setShowChapterPicker(false)}
        chapters={chapters}
        current={chapterNum}
        onSelect={goToChapter}
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
        onOpenAppSettings={() => {
          setShowSettings(false)
          onOpenSettings()
        }}
      />
    </div>
  )
}

/**
 * A paragraph and its citation. The reference is the rail: on wide screens it
 * sits in the margin like a critical edition's apparatus, on a phone it is a
 * quiet marker above the text. Either way it is the single control for this
 * paragraph — tapping it opens the actions, which replaces the hover row of
 * Save/Share buttons that used to sit over every paragraph.
 */
function ParagraphBlock({
  para,
  highlights,
  termRanges,
  bookmarked,
  isTarget,
  onOpenActions,
}: {
  para: Paragraph
  highlights: SavedHighlight[]
  termRanges: { start: number; end: number }[]
  bookmarked: boolean
  isTarget: boolean
  onOpenActions: () => void
}) {
  return (
    <section
      id={`para-${para.id}`}
      /**
       * The rail is a real grid column on wide screens, not an absolutely
       * positioned label. Out of flow it had no effect on row height, so a
       * long periodical reference ("ARSH January 17, 1899, page 40.4") wrapped
       * past its own paragraph and landed on the next one's citation — which
       * bookmarking made worse, because the icon ate width and forced more
       * wrapping. As a column the row simply grows to fit and cannot overlap.
       */
      className="group scroll-mt-24 lg:-ml-24 lg:grid lg:grid-cols-[5.25rem_minmax(0,1fr)] lg:gap-x-3"
      style={
        isTarget
          ? {
              background: 'var(--accent-soft)',
              borderRadius: 'var(--r-sm)',
              boxShadow: '0 0 0 10px var(--accent-soft)',
            }
          : undefined
      }
    >
      <button
        type="button"
        onClick={onOpenActions}
        aria-label={`Actions for ${para.reference}${bookmarked ? ' (bookmarked)' : ''}`}
        className="mb-1 flex items-center gap-1 rounded-[3px] px-0.5 text-left transition-opacity lg:mb-0 lg:flex-col lg:items-end lg:gap-0.5 lg:self-start lg:pt-[0.3rem] lg:opacity-55 lg:group-hover:opacity-100"
      >
        <span className="cite min-w-0 break-words font-semibold leading-tight lg:text-right">
          {para.reference}
        </span>
        {/* Below the citation, not beside it — sharing the line squeezed the
            reference into extra rows. Bookmarks stay visible without hover. */}
        {bookmarked && <IconBookmark filled className="h-3 w-3 text-[var(--accent)]" />}
      </button>

      <p
        data-para-id={para.id}
        data-reference={para.reference}
        className="reader-text"
      >
        {renderHighlightedText(para.text, highlights, termRanges)}
      </p>
    </section>
  )
}

function SearchContextBar({
  query,
  resultCount,
  termCursor,
  termTotal,
  onStep,
  onBack,
}: {
  query: string
  resultCount: number
  termCursor: number
  termTotal: number
  onStep: (direction: 1 | -1) => void
  onBack: () => void
}) {
  return (
    <div
      className="z-30 flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-1.5"
      style={{ background: 'var(--cite-soft)' }}
    >
      <button
        type="button"
        onClick={onBack}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <span className="cite shrink-0 font-semibold">
          {resultCount} {resultCount === 1 ? 'HIT' : 'HITS'}
        </span>
        <span className="truncate text-[var(--t-tiny)] text-[var(--text-2)]">“{query}”</span>
      </button>

      {termTotal > 0 && (
        <div className="flex shrink-0 items-center gap-0.5">
          <span
            className="font-mono text-[var(--t-micro)] text-[var(--text-3)]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {termCursor + 1}/{termTotal}
          </span>
          <button
            type="button"
            onClick={() => onStep(-1)}
            aria-label="Previous match in this chapter"
            className="grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[var(--text-2)] transition-colors hover:bg-[var(--surface)]"
          >
            <IconChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onStep(1)}
            aria-label="Next match in this chapter"
            className="grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[var(--text-2)] transition-colors hover:bg-[var(--surface)]"
          >
            <IconChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onBack}
        aria-label="Back to results"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-3)] transition-colors hover:bg-[var(--surface)]"
      >
        <IconClose className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
