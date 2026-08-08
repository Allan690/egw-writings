import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSearchApi } from '../db/corpus'
import { subscribePioneerLoad } from '../db/pioneerLoader'
import { getAllReadingPositions, getReadingPosition } from '../db/userStore'
import { formatCount } from '../lib/format'
import type { BookCollection } from '../lib/corpusConstants'
import type { Book, ReaderTarget } from '../types'
import { BookIcon } from './BookIcon'
import { PioneerDownloadBanner } from './CorpusBadge'
import { IconChevronRight, IconSearch } from './Icons'
import { BookRowSkeleton } from './Skeletons'

interface Props {
  books: Book[]
  onOpenBook: (bookId: string) => void
  onOpenTarget: (target: ReaderTarget) => void
  onOpenPalette: () => void
}

interface ContinueItem {
  bookId: string
  title: string
  code: string
  reference: string
  chapterNum: number
  chapterCount: number
  collection: BookCollection
}

type LibraryTab = 'egw' | 'pioneer'

export function LibraryView({ books, onOpenBook, onOpenTarget, onOpenPalette }: Props) {
  const [continueReading, setContinueReading] = useState<ContinueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<LibraryTab>('egw')
  const [pioneerStatus, setPioneerStatus] = useState('idle')
  const [pioneerProgress, setPioneerProgress] = useState<number | null>(null)

  const loadContinue = useCallback(async (rows: Book[]) => {
    const api = getSearchApi()
    const positions = await getAllReadingPositions()
    const items: ContinueItem[] = []
    for (const pos of [...positions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3)) {
      const book = rows.find((b) => b.id === pos.bookId)
      if (!book) continue
      const para = pos.paragraphId ? await api.getParagraph(pos.paragraphId, pos.bookId) : null
      items.push({
        bookId: pos.bookId,
        title: book.title,
        code: book.code,
        reference: para?.reference ?? `Chapter ${pos.chapterNum}`,
        chapterNum: pos.chapterNum,
        chapterCount: book.chapter_count,
        collection: book.collection,
      })
    }
    setContinueReading(items)
    setLoading(false)
  }, [])

  useEffect(() => {
    return subscribePioneerLoad((s) => {
      setPioneerStatus(s.status)
      setPioneerProgress(s.progress)
    })
  }, [])

  useEffect(() => {
    if (books.length === 0) return
    void loadContinue(books)
  }, [books, loadContinue])

  const egwCount = books.filter((b) => b.collection === 'egw').length
  const pioneerCount = books.filter((b) => b.collection === 'pioneer').length
  const pioneersReady = pioneerStatus === 'ready'

  const filtered = useMemo(() => {
    const scoped = books.filter((b) => b.collection === tab)
    const q = filter.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q),
    )
  }, [books, tab, filter])

  const openBook = async (bookId: string) => {
    const pos = await getReadingPosition(bookId)
    if (pos) onOpenTarget({ bookId, chapterNum: pos.chapterNum, paragraphId: pos.paragraphId })
    else onOpenBook(bookId)
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <header className="mb-5">
        <h1 className="font-serif text-[var(--t-hero)] font-semibold leading-none text-[var(--text)]">
          Library
        </h1>
        <p className="mt-2 text-[var(--t-small)] text-[var(--text-3)]">
          {formatCount(egwCount)} books by Ellen G. White
          {pioneersReady ? ` · ${formatCount(pioneerCount)} pioneer works` : ''} · all on this
          device
        </p>
      </header>

      <button
        type="button"
        onClick={onOpenPalette}
        className="flex w-full items-center gap-2.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-left transition-colors hover:border-[var(--border-strong)]"
      >
        <IconSearch className="h-[18px] w-[18px] text-[var(--text-3)]" />
        <span className="flex-1 text-[var(--t-base)] text-[var(--text-3)]">
          Search, or jump to a reference
        </span>
        <kbd className="hidden rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-3)] sm:block">
          ⌘K
        </kbd>
      </button>

      <PioneerDownloadBanner progress={pioneerProgress} status={pioneerStatus} />

      {continueReading.length > 0 && (
        <section className="mt-6">
          <h2 className="cite mb-2" style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}>
            PICK UP WHERE YOU LEFT OFF
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {continueReading.map((item) => (
              <button
                key={item.bookId}
                type="button"
                onClick={() => void openBook(item.bookId)}
                className="anim-rise flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition-colors hover:border-[var(--accent)]"
              >
                <BookIcon code={item.code} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-[15px] font-medium leading-snug text-[var(--text)]">
                    {item.title}
                  </p>
                  <p className="cite mt-1 truncate">{item.reference}</p>
                  <div
                    className="mt-2 h-[2px] w-full overflow-hidden rounded-full"
                    style={{ background: 'var(--surface-3)' }}
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (item.chapterNum / Math.max(1, item.chapterCount)) * 100)}%`,
                        background: 'var(--accent)',
                      }}
                    />
                  </div>
                </div>
                <IconChevronRight className="text-[var(--text-3)]" />
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-7 flex items-end justify-between gap-3 border-b border-[var(--border)]">
        <div className="flex gap-1">
          <ShelfTab
            label="Ellen G. White"
            count={egwCount}
            active={tab === 'egw'}
            onClick={() => setTab('egw')}
          />
          <ShelfTab
            label="Pioneers"
            count={pioneersReady ? pioneerCount : null}
            pending={pioneerStatus === 'loading' || pioneerStatus === 'checking'}
            active={tab === 'pioneer'}
            onClick={() => setTab('pioneer')}
          />
        </div>
      </div>

      {tab === 'pioneer' && !pioneersReady ? (
        <div className="mt-5 rounded-[var(--r-md)] border border-dashed border-[var(--border-strong)] px-6 py-10 text-center">
          <p className="font-serif text-[17px] text-[var(--text)]">
            {pioneerStatus === 'unavailable'
              ? 'The pioneer library is not part of this deployment'
              : pioneerStatus === 'error'
                ? 'The pioneer library did not download'
                : 'The pioneer library is on its way'}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[var(--t-small)] leading-relaxed text-[var(--text-3)]">
            {pioneerStatus === 'error'
              ? 'Ellen G. White’s writings are ready and unaffected. It will try again next time you open the app.'
              : 'These are writings of early Adventist pioneers — James White, Uriah Smith, J. N. Andrews and others. They are not by Ellen G. White.'}
          </p>
        </div>
      ) : (
        <>
          <div className="relative mt-4">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={tab === 'egw' ? 'Find a book…' : 'Find a pioneer work…'}
              aria-label="Filter books"
              className="w-full rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-9 pr-3 text-[var(--t-lg)] outline-none transition-colors focus:border-[var(--accent)]"
            />
          </div>

          {loading && books.length === 0 ? (
            <div className="mt-4 divide-y divide-[var(--border)] rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)]">
              {[0, 1, 2, 3, 4].map((i) => (
                <BookRowSkeleton key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="mt-8 text-center text-[var(--t-small)] text-[var(--text-3)]">
              No book matches “{filter}”.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--border)] overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)]">
              {filtered.map((book) => (
                <li key={book.id}>
                  <button
                    type="button"
                    onClick={() => void openBook(book.id)}
                    className="flex w-full items-center gap-3.5 px-3.5 py-3 text-left transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <BookIcon code={book.code} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-[15px] font-medium leading-snug text-[var(--text)]">
                        {book.title}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[var(--t-tiny)] text-[var(--text-3)]">
                        <span className="cite font-semibold">{book.code}</span>
                        {book.collection === 'pioneer' && <span>{book.author}</span>}
                        <span>
                          {book.chapter_count} ch · {formatCount(book.paragraph_count)} ¶
                        </span>
                      </p>
                    </div>
                    <IconChevronRight className="text-[var(--text-3)]/60" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function ShelfTab({
  label,
  count,
  pending,
  active,
  onClick,
}: {
  label: string
  count: number | null
  pending?: boolean
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="relative flex items-center gap-1.5 px-2 pb-2.5 pt-1 text-[var(--t-base)] transition-colors"
      style={{
        color: active ? 'var(--text)' : 'var(--text-3)',
        fontWeight: active ? 600 : 500,
      }}
    >
      {label}
      <span
        className="font-mono text-[var(--t-micro)]"
        style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--cite)' }}
      >
        {pending ? '···' : count ?? ''}
      </span>
      {active && (
        <span
          className="absolute inset-x-0 -bottom-px h-[2px]"
          style={{ background: 'var(--accent)' }}
          aria-hidden
        />
      )}
    </button>
  )
}
