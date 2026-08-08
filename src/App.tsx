import { useEffect, useRef, useState } from 'react'
import { getSearchApi } from './db/corpus'
import { getReadingPosition } from './db/userStore'
import { useCorpusInit } from './hooks/useCorpusInit'
import { usePioneerCorpus } from './hooks/usePioneerCorpus'
import { useReaderSettings } from './hooks/useReaderSettings'
import { subscribePioneerLoad } from './db/pioneerLoader'
import type { BookCollection } from './lib/corpusConstants'
import { useSearch } from './hooks/useSearch'
import type { ReaderTarget, SearchResult, View } from './types'
import { AppShell } from './components/AppShell'
import { LibraryView } from './components/LibraryView'
import { ReaderView, SavedView } from './components/ReaderView'
import { SearchView } from './components/SearchView'

function LoadingScreen({ message, error }: { message: string; error?: string | null }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
      <p className="font-serif text-xl font-semibold text-[var(--text)]">EGW Writings</p>
      <p className="mt-2 max-w-sm text-sm text-[var(--text-3)]">{message}</p>
      {error && (
        <pre className="mt-4 max-w-sm overflow-x-auto rounded-lg bg-red-50 p-3 text-left text-xs text-red-800">
          {error}
        </pre>
      )}
    </div>
  )
}

export default function App() {
  useReaderSettings()
  const { ready, error } = useCorpusInit()
  const pioneer = usePioneerCorpus(ready)
  const search = useSearch()
  const [view, setView] = useState<View>('library')
  const [readerTarget, setReaderTarget] = useState<ReaderTarget | null>(null)
  const [books, setBooks] = useState<
    { id: string; title: string; code: string; collection: BookCollection; author: string }[]
  >([])
  const searchInputRef = useRef<HTMLInputElement>(null)

  const refreshBooks = () => {
    getSearchApi()
      .getBooks('all')
      .then((rows) =>
        setBooks(
          rows.map((b) => ({
            id: b.id,
            title: b.title,
            code: b.code,
            collection: b.collection,
            author: b.author,
          })),
        ),
      )
  }

  useEffect(() => {
    if (!ready) return
    refreshBooks()
  }, [ready])

  useEffect(() => {
    if (!ready) return
    return subscribePioneerLoad((s) => {
      if (s.status === 'ready') refreshBooks()
    })
  }, [ready])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setView('search')
        setReaderTarget(null)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openReader = (target: ReaderTarget) => {
    setReaderTarget(target)
    setView('reader')
  }

  const openResult = (result: SearchResult) => {
    openReader({
      bookId: result.book_id,
      chapterNum: result.chapter_num,
      paragraphId: result.id,
    })
  }

  const openBook = async (bookId: string) => {
    const position = await getReadingPosition(bookId)
    openReader({
      bookId,
      chapterNum: position?.chapterNum ?? 1,
      paragraphId: position?.paragraphId,
    })
  }

  if (error) {
    return <LoadingScreen message="Could not load the writings corpus." error={error} />
  }

  if (!ready) {
    return (
      <LoadingScreen message="Loading corpus (first visit may take 30–60 seconds)…" />
    )
  }

  return (
    <AppShell
      view={view}
      onNavigate={(v) => {
        setView(v)
        if (v !== 'reader') setReaderTarget(null)
      }}
      hideChrome={view === 'reader'}
    >
      {view === 'library' && (
        <LibraryView
          onOpenBook={(id) => void openBook(id)}
          onOpenTarget={openReader}
        />
      )}

      {view === 'search' && (
        <SearchView
          query={search.query}
          onQueryChange={search.setQuery}
          results={search.results}
          searching={search.searching}
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

      {view === 'bookmarks' && <SavedView onOpen={openReader} />}

      {view === 'reader' && readerTarget && (
        <ReaderView target={readerTarget} onBack={() => setView('library')} />
      )}
    </AppShell>
  )
}
