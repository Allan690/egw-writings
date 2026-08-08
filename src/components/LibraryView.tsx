import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSearchApi } from '../db/corpus'
import { subscribePioneerLoad } from '../db/pioneerLoader'
import { getAllReadingPositions, getReadingPosition } from '../db/userStore'
import type { BookCollection } from '../lib/corpusConstants'
import type { Book, ReaderTarget } from '../types'
import { BookIcon } from './BookIcon'
import { CorpusBadge, PioneerDownloadBanner } from './CorpusBadge'
import { IconChevronRight } from './Icons'
import { ReferenceLookup } from './ReferenceLookup'

interface Props {
  onOpenBook: (bookId: string) => void
  onOpenTarget: (target: ReaderTarget) => void
}

interface ContinueItem {
  bookId: string
  title: string
  code: string
  reference: string
  chapterNum: number
  collection: BookCollection
}

type LibraryTab = 'egw' | 'pioneer'

export function LibraryView({ onOpenBook, onOpenTarget }: Props) {
  const [books, setBooks] = useState<Book[]>([])
  const [continueReading, setContinueReading] = useState<ContinueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<LibraryTab>('egw')
  const [pioneerStatus, setPioneerStatus] = useState<'idle' | 'checking' | 'loading' | 'ready' | 'unavailable' | 'error'>('idle')
  const [pioneerProgress, setPioneerProgress] = useState<number | null>(null)

  const loadBooks = useCallback(async () => {
    const api = getSearchApi()
    const rows = await api.getBooks('all')
    setBooks(rows as Book[])
    return rows
  }, [])

  useEffect(() => {
    return subscribePioneerLoad((s) => {
      setPioneerStatus(s.status)
      setPioneerProgress(s.progress)
      if (s.status === 'ready') void loadBooks()
    })
  }, [loadBooks])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const api = getSearchApi()
      const [rows, positions] = await Promise.all([
        api.getBooks('all'),
        getAllReadingPositions(),
      ])
      setBooks(rows as Book[])

      const items: ContinueItem[] = []
      for (const pos of [...positions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2)) {
        const book = rows.find((b) => b.id === pos.bookId)
        if (!book) continue
        const para = pos.paragraphId ? await api.getParagraph(pos.paragraphId, pos.bookId) : null
        items.push({
          bookId: pos.bookId,
          title: book.title,
          code: book.code,
          reference: para?.reference ?? `Chapter ${pos.chapterNum}`,
          chapterNum: pos.chapterNum,
          collection: book.collection,
        })
      }
      setContinueReading(items)
      setLoading(false)
    }
    void load()
  }, [])

  const tabBooks = useMemo(
    () => books.filter((b) => b.collection === tab),
    [books, tab],
  )

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return tabBooks
    return tabBooks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q),
    )
  }, [tabBooks, filter])

  const egwCount = books.filter((b) => b.collection === 'egw').length
  const pioneerCount = books.filter((b) => b.collection === 'pioneer').length
  const pioneersReady = pioneerStatus === 'ready'

  const openBook = async (bookId: string) => {
    const pos = await getReadingPosition(bookId)
    if (pos) {
      onOpenTarget({ bookId, chapterNum: pos.chapterNum, paragraphId: pos.paragraphId })
    } else {
      onOpenBook(bookId)
    }
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl overflow-x-hidden px-4 py-5 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-[var(--text)] md:text-3xl">
          Library
        </h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          {egwCount} Ellen G. White books
          {pioneersReady ? ` · ${pioneerCount} pioneer works` : ''} · offline after load
        </p>
      </header>

      <PioneerDownloadBanner progress={pioneerProgress} status={pioneerStatus} />

      <ReferenceLookup onOpen={onOpenTarget} />

      {continueReading.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
            Continue reading
          </h2>
          <div className="space-y-2">
            {continueReading.map((item) => (
              <button
                key={item.bookId}
                type="button"
                onClick={() => void openBook(item.bookId)}
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--accent)]/30"
              >
                <BookIcon code={item.code} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1">
                    <CorpusBadge collection={item.collection} size="sm" />
                  </div>
                  <p className="truncate text-sm font-medium text-[var(--text)]">{item.title}</p>
                  <p className="truncate text-xs text-[var(--text-3)]">
                    {item.reference} · Ch. {item.chapterNum}
                  </p>
                </div>
                <IconChevronRight className="text-[var(--text-3)]" />
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 flex gap-1 rounded-lg bg-[var(--surface-2)] p-1">
        <button
          type="button"
          onClick={() => setTab('egw')}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            tab === 'egw'
              ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
              : 'text-[var(--text-3)]'
          }`}
        >
          Ellen G. White
        </button>
        <button
          type="button"
          onClick={() => setTab('pioneer')}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            tab === 'pioneer'
              ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
              : 'text-[var(--text-3)]'
          }`}
        >
          Pioneers
          {!pioneersReady && pioneerStatus === 'loading' ? '…' : pioneersReady ? ` (${pioneerCount})` : ''}
        </button>
      </div>

      {tab === 'pioneer' && !pioneersReady && (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm leading-relaxed text-slate-600">
          {pioneerStatus === 'unavailable'
            ? 'Pioneer library is not bundled with this deployment yet.'
            : pioneerStatus === 'error'
              ? 'Could not download the pioneer library. Ellen G. White writings are still available.'
              : 'Early Adventist pioneer writings are downloading in the background. These are not by Ellen G. White.'}
        </p>
      )}

      {(tab === 'egw' || pioneersReady) && (
        <>
          <div className="relative mt-4">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={tab === 'egw' ? 'Filter EGW books…' : 'Filter pioneer works…'}
              className="box-border w-full max-w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-3 pl-4 pr-4 text-base text-[var(--text)] outline-none placeholder:text-[var(--text-3)] focus:border-[var(--accent)]/40 focus:ring-2 focus:ring-[var(--accent)]/10"
            />
          </div>

          {tab === 'pioneer' && pioneersReady && (
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              Writings of early Adventist pioneers —{' '}
              <strong>not by Ellen G. White</strong>. Authors include James White, Uriah Smith,
              J. N. Andrews, and others.
            </p>
          )}

          {loading ? (
            <p className="mt-8 text-center text-sm text-[var(--text-3)]">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="mt-8 text-center text-sm text-[var(--text-3)]">No books match.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {filtered.map((book) => (
                <li key={book.id}>
                  <button
                    type="button"
                    onClick={() => void openBook(book.id)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[var(--surface-2)]/60"
                  >
                    <BookIcon code={book.code} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <CorpusBadge collection={book.collection} author={book.author} />
                      </div>
                      <p className="font-serif text-[15px] font-medium leading-snug text-[var(--text)]">
                        {book.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--text-3)]">
                        {book.code}
                        {book.collection === 'pioneer' ? ` · ${book.author}` : ''} · {book.chapter_count}{' '}
                        ch · {book.paragraph_count.toLocaleString()} ¶
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
