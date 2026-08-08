import { useEffect, useMemo, useRef, useState } from 'react'
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '../lib/recentSearches'
import { SEARCH_SUGGESTIONS } from '../lib/bookStyle'
import { formatCount } from '../lib/format'
import type { BookCollection } from '../lib/corpusConstants'
import type { Book, SearchResult } from '../types'
import { BookPicker } from './BookPicker'
import { CorpusBadge, PioneerDownloadBanner } from './CorpusBadge'
import { IconChevronDown, IconClose, IconCorner, IconSearch } from './Icons'
import { ResultSkeleton } from './Skeletons'

interface Props {
  query: string
  onQueryChange: (q: string) => void
  results: SearchResult[]
  searching: boolean
  elapsedMs: number | null
  bookFilter?: string
  onBookFilterChange: (id: string | undefined) => void
  collectionFilter: BookCollection | 'all'
  onCollectionFilterChange: (c: BookCollection | 'all') => void
  pioneerStatus: string
  pioneerProgress: number | null
  books: Book[]
  onOpenResult: (result: SearchResult) => void
  searchInputRef?: React.RefObject<HTMLInputElement | null>
}

const SCOPES: { id: BookCollection | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'egw', label: 'Ellen G. White' },
  { id: 'pioneer', label: 'Pioneers' },
]

export function SearchView({
  query,
  onQueryChange,
  results,
  searching,
  elapsedMs,
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
  const listRef = useRef<HTMLUListElement>(null)
  const [recent, setRecent] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    void getRecentSearches().then(setRecent)
  }, [])

  const displayResults = useMemo(
    () => (bookFilter ? results.filter((r) => r.book_id === bookFilter) : results),
    [results, bookFilter],
  )

  // A new query invalidates the cursor.
  useEffect(() => {
    setActiveIndex(-1)
  }, [query, bookFilter, collectionFilter])

  useEffect(() => {
    if (activeIndex < 0) return
    listRef.current
      ?.querySelectorAll('[data-result]')
      [activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const hasQuery = query.trim().length >= 2
  const selectedBook = books.find((b) => b.id === bookFilter)
  const egwCount = books.filter((b) => b.collection === 'egw').length
  const pioneerCount = books.filter((b) => b.collection === 'pioneer').length

  const pickResult = (r: SearchResult) => {
    void addRecentSearch(query).then(() => getRecentSearches().then(setRecent))
    onOpenResult(r)
  }

  /** Arrow keys walk the results without leaving the input. */
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, displayResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      const target = displayResults[activeIndex] ?? displayResults[0]
      if (target) {
        e.preventDefault()
        pickResult(target)
      }
    } else if (e.key === 'Escape' && query) {
      e.preventDefault()
      onQueryChange('')
    }
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl px-4 pt-4 md:px-8 md:pt-7">
      <div className="sticky top-0 z-30 -mx-4 bg-[var(--bg)]/95 px-4 pb-3 pt-1 backdrop-blur-md md:-mx-8 md:px-8">
        <div className="relative min-w-0">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--text-3)]" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search every book…"
            aria-label="Search the writings"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="box-border w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] py-3 pl-11 pr-10 text-[var(--t-lg)] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-3)] focus:border-[var(--accent)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                onQueryChange('')
                inputRef.current?.focus()
              }}
              className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[var(--text-3)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              aria-label="Clear search"
            >
              <IconClose />
            </button>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {SCOPES.map((scope) => {
            const disabled = scope.id === 'pioneer' && pioneerStatus !== 'ready'
            const active = collectionFilter === scope.id
            return (
              <button
                key={scope.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onCollectionFilterChange(scope.id)
                  onBookFilterChange(undefined)
                }}
                className="rounded-full border px-2.5 py-1 text-[var(--t-tiny)] font-medium transition-colors disabled:opacity-40"
                style={{
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-3)',
                }}
              >
                {scope.label}
              </button>
            )
          })}

          <span className="mx-0.5 h-4 w-px bg-[var(--border)]" aria-hidden />

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex max-w-[14rem] items-center gap-1 rounded-full border px-2.5 py-1 text-[var(--t-tiny)] font-medium transition-colors"
            style={{
              borderColor: selectedBook ? 'var(--accent)' : 'var(--border)',
              background: selectedBook ? 'var(--accent-soft)' : 'transparent',
              color: selectedBook ? 'var(--accent)' : 'var(--text-3)',
            }}
          >
            <span className="truncate">{selectedBook ? selectedBook.code : 'Any book'}</span>
            <IconChevronDown className="h-3 w-3 opacity-60" />
          </button>

          {selectedBook && (
            <button
              type="button"
              onClick={() => onBookFilterChange(undefined)}
              className="text-[var(--t-tiny)] text-[var(--text-3)] underline underline-offset-2 hover:text-[var(--text-2)]"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <PioneerDownloadBanner progress={pioneerProgress} status={pioneerStatus} />

      {hasQuery && (
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[var(--t-tiny)] text-[var(--text-3)]">
          <span className="font-medium text-[var(--text-2)]">
            {searching
              ? 'Searching…'
              : `${formatCount(displayResults.length)} ${
                  displayResults.length === 1 ? 'passage' : 'passages'
                }`}
          </span>
          {!searching && elapsedMs != null && (
            <span className="font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {elapsedMs < 1 ? '<1' : Math.round(elapsedMs)} ms · on this device
            </span>
          )}
          {selectedBook && <span>· in {selectedBook.title}</span>}
        </p>
      )}

      {searching && displayResults.length === 0 && (
        <div className="mt-3 space-y-2.5">
          <ResultSkeleton />
          <ResultSkeleton />
          <ResultSkeleton />
        </div>
      )}

      {hasQuery && !searching && displayResults.length === 0 && (
        <div className="mt-8 rounded-[var(--r-md)] border border-dashed border-[var(--border-strong)] px-6 py-10 text-center">
          <p className="font-serif text-[17px] text-[var(--text)]">Nothing matched that</p>
          <p className="mx-auto mt-2 max-w-xs text-[var(--t-small)] leading-relaxed text-[var(--text-3)]">
            Try fewer words, or put a phrase in quotes to match it exactly —
            like <span className="font-mono text-[var(--cite)]">"righteousness by faith"</span>.
          </p>
          {selectedBook && (
            <button
              type="button"
              onClick={() => onBookFilterChange(undefined)}
              className="mt-4 rounded-[var(--r-sm)] border border-[var(--border)] px-3 py-1.5 text-[var(--t-small)] font-medium text-[var(--text-2)] transition-colors hover:border-[var(--border-strong)]"
            >
              Search all books instead
            </button>
          )}
        </div>
      )}

      {!hasQuery && (
        <div className="mt-6 anim-fade">
          {recent.length > 0 && (
            <section className="mb-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="cite" style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}>
                  RECENT
                </h2>
                <button
                  type="button"
                  onClick={() => void clearRecentSearches().then(() => setRecent([]))}
                  className="text-[var(--t-tiny)] text-[var(--text-3)] transition-colors hover:text-[var(--text-2)]"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((term) => (
                  <TermChip key={term} label={term} onClick={() => onQueryChange(term)} />
                ))}
              </div>
            </section>
          )}

          <h2 className="cite mb-2" style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}>
            START HERE
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {SEARCH_SUGGESTIONS.map((term) => (
              <TermChip key={term} label={term} onClick={() => onQueryChange(term)} />
            ))}
          </div>

          <div className="mt-8 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="text-[var(--t-small)] font-semibold text-[var(--text)]">
              Searching {formatCount(egwCount)} Ellen G. White books
              {pioneerCount > 0 ? ` and ${formatCount(pioneerCount)} pioneer works` : ''}
            </h3>
            <ul className="mt-2 space-y-1.5 text-[var(--t-small)] leading-relaxed text-[var(--text-2)]">
              <li>
                Quote a phrase to match it word for word —{' '}
                <span className="font-mono text-[var(--cite)]">"the great controversy"</span>
              </li>
              <li>
                Type a reference to go straight there —{' '}
                <span className="font-mono text-[var(--cite)]">PP 155.1</span>
              </li>
              <li>
                Use <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 font-mono text-[10px]">↑</kbd>{' '}
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 font-mono text-[10px]">↓</kbd>{' '}
                to move through results and{' '}
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 font-mono text-[10px]">↵</kbd>{' '}
                to open one
              </li>
            </ul>
          </div>
        </div>
      )}

      <ul ref={listRef} className="mt-3 min-w-0 space-y-2">
        {displayResults.map((r, i) => (
          <li key={r.id} className="min-w-0">
            <ResultCard
              result={r}
              active={i === activeIndex}
              onClick={() => pickResult(r)}
              onFocus={() => setActiveIndex(i)}
            />
          </li>
        ))}
      </ul>

      <BookPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        books={books}
        collection={collectionFilter}
        selected={bookFilter}
        onSelect={(id) => {
          onBookFilterChange(id)
          setPickerOpen(false)
        }}
      />
    </div>
  )
}

function TermChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="max-w-full truncate rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[var(--t-small)] text-[var(--text-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      {label}
    </button>
  )
}

/**
 * The citation leads. It is how these books are quoted, and it is the one
 * piece of a result you carry away with you.
 */
function ResultCard({
  result,
  active,
  onClick,
  onFocus,
}: {
  result: SearchResult
  active: boolean
  onClick: () => void
  onFocus: () => void
}) {
  return (
    <button
      type="button"
      data-result
      onClick={onClick}
      onFocus={onFocus}
      // See CommandPalette: mousemove avoids a resting cursor hijacking the
      // keyboard cursor as results re-render beneath it.
      onMouseMove={onFocus}
      className="group box-border w-full overflow-hidden rounded-[var(--r-md)] border bg-[var(--surface)] p-3.5 text-left transition-colors sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-3.5"
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background: active ? 'var(--accent-soft)' : 'var(--surface)',
      }}
    >
      <div className="flex items-baseline justify-between gap-2 sm:block">
        {/* Periodical references run long ("ARSH January 17, 1899 22.4"), so
            the rail wraps rather than spilling over the title. */}
        <span className="cite min-w-0 font-semibold leading-tight break-words sm:block">
          {result.reference}
        </span>
      </div>

      <div className="mt-1.5 min-w-0 sm:mt-0">
        <p className="min-w-0 truncate text-[var(--t-small)] font-semibold text-[var(--text)]">
          {result.book_title}
        </p>
        {/* The byline sits with the chapter line and wraps if the author's
            name is long, rather than squeezing the title beside it. */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-[var(--t-tiny)] text-[var(--text-3)]">
            Chapter {result.chapter_num} · {result.chapter_title}
          </span>
          <CorpusBadge collection={result.collection} author={result.book_author} />
        </div>
        <p
          className="search-snippet mt-2 line-clamp-3 break-words font-serif text-[15px] leading-relaxed text-[var(--text-2)]"
          dangerouslySetInnerHTML={{ __html: result.snippet }}
        />
        <span
          className="mt-2 hidden items-center gap-1 text-[var(--t-tiny)] font-medium text-[var(--accent)] sm:flex"
          style={{ opacity: active ? 1 : 0, transition: 'opacity var(--dur-1) var(--ease)' }}
        >
          <IconCorner /> Open in reader
        </span>
      </div>
    </button>
  )
}
