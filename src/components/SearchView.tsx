import { useEffect, useMemo, useRef, useState } from 'react'
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '../lib/recentSearches'
import { SEARCH_SUGGESTIONS } from '../lib/bookStyle'
import type { BookCollection } from '../lib/corpusConstants'
import type { SearchResult } from '../types'
import { CorpusBadge, PioneerDownloadBanner } from './CorpusBadge'
import { IconClose, IconSearch } from './Icons'

interface Props {
  query: string
  onQueryChange: (q: string) => void
  results: SearchResult[]
  searching: boolean
  bookFilter?: string
  onBookFilterChange: (id: string | undefined) => void
  collectionFilter: BookCollection | 'all'
  onCollectionFilterChange: (c: BookCollection | 'all') => void
  pioneerStatus: string
  pioneerProgress: number | null
  books: { id: string; title: string; code: string; collection: BookCollection; author: string }[]
  onOpenResult: (result: SearchResult) => void
  searchInputRef?: React.RefObject<HTMLInputElement | null>
}

export function SearchView({
  query,
  onQueryChange,
  results,
  searching,
  bookFilter,
  onBookFilterChange,
  collectionFilter,
  onCollectionFilterChange,
  pioneerStatus,
  pioneerProgress,
  books,
  onOpenResult,
  searchInputRef,
}: Props) {
  const localRef = useRef<HTMLInputElement>(null)
  const inputRef = searchInputRef ?? localRef
  const [recent, setRecent] = useState<string[]>([])
  const [bookQuery, setBookQuery] = useState('')

  useEffect(() => {
    void getRecentSearches().then(setRecent)
  }, [])

  const filteredBooks = useMemo(() => {
    const q = bookQuery.trim().toLowerCase()
    let list = books
    if (collectionFilter !== 'all') {
      list = list.filter((b) => b.collection === collectionFilter)
    }
    if (!q) return list
    return list.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q),
    )
  }, [books, bookQuery, collectionFilter])

  const displayResults = useMemo(() => {
    if (!bookFilter) return results
    return results.filter((r) => r.book_id === bookFilter)
  }, [results, bookFilter])

  const hasQuery = query.trim().length >= 2
  const selectedBook = books.find((b) => b.id === bookFilter)

  const pickResult = (r: SearchResult) => {
    void addRecentSearch(query).then(() => getRecentSearches().then(setRecent))
    onOpenResult(r)
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl overflow-x-hidden px-4 py-5 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-[var(--text)] md:text-3xl">Search</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Full-text search · {books.filter((b) => b.collection === 'egw').length} EGW
          {books.some((b) => b.collection === 'pioneer')
            ? ` + ${books.filter((b) => b.collection === 'pioneer').length} pioneer`
            : ''}{' '}
          books
        </p>
      </header>

      <PioneerDownloadBanner progress={pioneerProgress} status={pioneerStatus} />

      <div className="mb-3 flex flex-wrap gap-2">
        {(['all', 'egw', 'pioneer'] as const).map((c) => (
          <button
            key={c}
            type="button"
            disabled={c === 'pioneer' && pioneerStatus !== 'ready'}
            onClick={() => {
              onCollectionFilterChange(c)
              onBookFilterChange(undefined)
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              collectionFilter === c
                ? c === 'pioneer'
                  ? 'border-slate-400 bg-slate-200 text-slate-800'
                  : 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--text-3)]'
            } disabled:opacity-40`}
          >
            {c === 'all' ? 'All' : c === 'egw' ? 'Ellen G. White' : 'Pioneers only'}
          </button>
        ))}
      </div>

      <div className="relative min-w-0">
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-3)]" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder='Try "righteousness by faith" or PP 155'
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="box-border w-full max-w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-3 pl-11 pr-10 text-base text-[var(--text)] outline-none placeholder:text-[var(--text-3)] focus:border-[var(--accent)]/40 focus:ring-2 focus:ring-[var(--accent)]/10"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--text-3)] hover:bg-[var(--surface-2)]"
            aria-label="Clear"
          >
            <IconClose />
          </button>
        )}
        {searching && (
          <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-[var(--text-3)]">
            …
          </span>
        )}
      </div>

      <div className="mt-3 min-w-0 space-y-2">
        {books.length > 30 && (
          <input
            type="search"
            value={bookQuery}
            onChange={(e) => setBookQuery(e.target.value)}
            placeholder="Filter book list…"
            className="box-border w-full max-w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none"
          />
        )}
        <select
          value={bookFilter ?? ''}
          onChange={(e) => onBookFilterChange(e.target.value || undefined)}
          className="box-border w-full max-w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/40"
        >
          <option value="">All books</option>
          {filteredBooks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.collection === 'pioneer' ? `[P] ${b.code}` : b.code} — {b.title}
            </option>
          ))}
        </select>
        {selectedBook && (
          <p className="truncate text-xs text-[var(--text-3)]">{selectedBook.title}</p>
        )}
      </div>

      {!hasQuery && (
        <div className="mt-8">
          {recent.length > 0 && (
            <section className="mb-6">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
                  Recent
                </p>
                <button
                  type="button"
                  onClick={() => void clearRecentSearches().then(() => setRecent([]))}
                  className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)]"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => onQueryChange(term)}
                    className="max-w-full truncate rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-2)] hover:border-[var(--accent)]/30"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </section>
          )}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
            Suggestions
          </p>
          <div className="flex flex-wrap gap-2">
            {SEARCH_SUGGESTIONS.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => onQueryChange(term)}
                className="max-w-full truncate rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-2)] hover:border-[var(--accent)]/30"
              >
                {term}
              </button>
            ))}
          </div>
          <p className="mt-6 text-sm leading-relaxed text-[var(--text-3)]">
            Use quotes for phrases. Results rank by relevance. Filter by book above.
          </p>
        </div>
      )}

      {hasQuery && !searching && (
        <p className="mt-5 text-sm text-[var(--text-3)]">
          {displayResults.length} result{displayResults.length !== 1 ? 's' : ''}
          {selectedBook ? ` in ${selectedBook.title}` : ''}
        </p>
      )}

      {hasQuery && !searching && displayResults.length === 0 && (
        <p className="mt-4 text-center text-sm text-[var(--text-3)]">No results.</p>
      )}

      <ul className="mt-4 min-w-0 space-y-3">
        {displayResults.map((r) => (
          <li key={r.id} className="min-w-0">
            <button
              type="button"
              onClick={() => pickResult(r)}
              className="box-border w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--accent)]/25"
            >
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">{r.reference}</span>
                <CorpusBadge collection={r.collection} author={r.book_author} />
              </div>
              <p className="mt-1 truncate text-sm font-medium text-[var(--text)]">
                {r.book_title}
                {r.collection === 'pioneer' ? (
                  <span className="font-normal text-[var(--text-3)]"> · {r.book_author}</span>
                ) : null}
              </p>
              <p className="mt-0.5 truncate text-xs text-[var(--text-3)]">{r.chapter_title}</p>
              <p
                className="search-snippet mt-2 line-clamp-3 break-words font-serif text-[15px] leading-relaxed text-[var(--text-2)]"
                dangerouslySetInnerHTML={{ __html: r.snippet }}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
