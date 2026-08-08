import { useCallback, useEffect, useRef, useState } from 'react'
import { getSearchApi } from './db/corpus'
import { getReadingPosition } from './db/userStore'
import { useCorpusInit } from './hooks/useCorpusInit'
import { usePioneerCorpus } from './hooks/usePioneerCorpus'
import { useReaderSettings } from './hooks/useReaderSettings'
import { subscribePioneerLoad } from './db/pioneerLoader'
import { useSearch } from './hooks/useSearch'
import { parseSearchTerms } from './lib/searchTerms'
import type { Book, ReaderTarget, SearchResult, View } from './types'
import { AppShell } from './components/AppShell'
import { CommandPalette } from './components/CommandPalette'
import { LibraryView } from './components/LibraryView'
import { ReaderView } from './components/ReaderView'
import { SavedView } from './components/SavedView'
import { SearchView } from './components/SearchView'
import { SettingsSheet } from './components/SettingsSheet'
import { SetupScreen } from './components/SetupScreen'

/** Where a reader session was opened from, so Back can return there. */
type ReaderOrigin = Exclude<View, 'reader'>

const ORIGIN_LABEL: Record<ReaderOrigin, string> = {
  library: 'Library',
  search: 'Results',
  saved: 'Saved',
}

export default function App() {
  useReaderSettings()
  const corpus = useCorpusInit()
  const pioneer = usePioneerCorpus(corpus.ready)
  const search = useSearch()

  const [view, setView] = useState<View>('library')
  const [readerTarget, setReaderTarget] = useState<ReaderTarget | null>(null)
  const [readerOrigin, setReaderOrigin] = useState<ReaderOrigin>('library')
  const [books, setBooks] = useState<Book[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  /** Window scroll per view, so returning to results lands where you left. */
  const scrollMemory = useRef<Partial<Record<View, number>>>({})

  const refreshBooks = useCallback(() => {
    void getSearchApi()
      .getBooks('all')
      .then((rows) => setBooks(rows as Book[]))
  }, [])

  useEffect(() => {
    if (!corpus.ready) return
    refreshBooks()
  }, [corpus.ready, refreshBooks])

  useEffect(() => {
    if (!corpus.ready) return
    return subscribePioneerLoad((s) => {
      if (s.status === 'ready') refreshBooks()
    })
  }, [corpus.ready, refreshBooks])

  const navigate = useCallback(
    (next: View) => {
      setView((current) => {
        if (current === next) return current
        if (current !== 'reader') scrollMemory.current[current] = window.scrollY
        return next
      })
      if (next !== 'reader') setReaderTarget(null)
    },
    [],
  )

  // Restore the scroll position of whichever list view we returned to.
  useEffect(() => {
    if (view === 'reader') return
    const y = scrollMemory.current[view] ?? 0
    requestAnimationFrame(() => window.scrollTo(0, y))
  }, [view])

  const openReader = useCallback(
    (target: ReaderTarget, origin: ReaderOrigin) => {
      if (view !== 'reader') scrollMemory.current[view] = window.scrollY
      setReaderTarget(target)
      setReaderOrigin(origin)
      setView('reader')
    },
    [view],
  )

  const openBook = useCallback(
    async (bookId: string, origin: ReaderOrigin) => {
      const position = await getReadingPosition(bookId)
      openReader(
        {
          bookId,
          chapterNum: position?.chapterNum ?? 1,
          paragraphId: position?.paragraphId,
        },
        origin,
      )
    },
    [openReader],
  )

  /**
   * Opening a result keeps the query alive: useSearch state is untouched, so
   * Back returns to the same list, and the terms travel into the chapter.
   */
  const openResult = useCallback(
    (result: SearchResult) => {
      openReader(
        {
          bookId: result.book_id,
          chapterNum: result.chapter_num,
          paragraphId: result.id,
        },
        'search',
      )
    },
    [openReader],
  )

  const runSearch = useCallback(
    (query: string) => {
      search.setQuery(query)
      navigate('search')
      requestAnimationFrame(() => searchInputRef.current?.focus())
    },
    [navigate, search],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((open) => !open)
      }
      // "/" is the reading-app convention for search, but not while typing.
      if (e.key === '/' && !mod) {
        const el = document.activeElement
        const typing =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          (el instanceof HTMLElement && el.isContentEditable)
        if (!typing) {
          e.preventDefault()
          setPaletteOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!corpus.ready) {
    return (
      <SetupScreen
        phase={corpus.phase}
        received={corpus.received}
        total={corpus.total}
        firstRun={corpus.firstRun}
        error={corpus.error}
        onRetry={corpus.retry}
      />
    )
  }

  const searchTerms = readerOrigin === 'search' ? parseSearchTerms(search.query) : []

  return (
    <>
      <AppShell
        view={view}
        onNavigate={navigate}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        hideChrome={view === 'reader'}
        bookCount={books.length}
        pioneerStatus={pioneer.status}
      >
        {view === 'library' && (
          <LibraryView
            books={books}
            onOpenBook={(id) => void openBook(id, 'library')}
            onOpenTarget={(target) => openReader(target, 'library')}
            onOpenPalette={() => setPaletteOpen(true)}
          />
        )}

        {view === 'search' && (
          <SearchView
            query={search.query}
            onQueryChange={search.setQuery}
            results={search.results}
            searching={search.searching}
            elapsedMs={search.elapsedMs}
            bookFilter={search.bookFilter}
            onBookFilterChange={search.setBookFilter}
            collectionFilter={search.collectionFilter}
            onCollectionFilterChange={search.setCollectionFilter}
            pioneerStatus={pioneer.status}
            pioneerProgress={pioneer.progress}
            books={books}
            onOpenResult={openResult}
            searchInputRef={searchInputRef}
          />
        )}

        {view === 'saved' && (
          <SavedView
            onOpen={(target) => openReader(target, 'saved')}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </AppShell>

      {view === 'reader' && readerTarget && (
        <ReaderView
          target={readerTarget}
          backLabel={ORIGIN_LABEL[readerOrigin]}
          onBack={() => navigate(readerOrigin)}
          searchTerms={searchTerms}
          searchQuery={readerOrigin === 'search' ? search.query : ''}
          resultCount={readerOrigin === 'search' ? search.results.length : 0}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        books={books}
        onOpenBook={(id) => void openBook(id, 'library')}
        onOpenTarget={(target) => openReader(target, 'library')}
        onSearch={runSearch}
        onNavigate={navigate}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        books={books}
        pioneerStatus={pioneer.status}
        onCorpusChange={refreshBooks}
      />
    </>
  )
}
