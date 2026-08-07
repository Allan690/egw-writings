import { useEffect, useMemo, useState } from 'react'
import { getSearchApi } from '../db/corpus'
import { getAllReadingPositions, getReadingPosition } from '../db/userStore'
import type { Book, ReaderTarget } from '../types'
import { BookIcon } from './BookIcon'
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
}

export function LibraryView({ onOpenBook, onOpenTarget }: Props) {
  const [books, setBooks] = useState<Book[]>([])
  const [continueReading, setContinueReading] = useState<ContinueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    async function load() {
      const api = getSearchApi()
      const [rows, positions] = await Promise.all([
        api.getBooks(),
        getAllReadingPositions(),
      ])
      setBooks(rows as Book[])

      const items: ContinueItem[] = []
      for (const pos of [...positions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2)) {
        const book = rows.find((b) => b.id === pos.bookId)
        if (!book) continue
        const para = pos.paragraphId ? await api.getParagraph(pos.paragraphId) : null
        items.push({
          bookId: pos.bookId,
          title: book.title,
          code: book.code,
          reference: para?.reference ?? `Chapter ${pos.chapterNum}`,
          chapterNum: pos.chapterNum,
        })
      }
      setContinueReading(items)
      setLoading(false)
    }
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return books
    return books.filter(
      (b) => b.title.toLowerCase().includes(q) || b.code.toLowerCase().includes(q),
    )
  }, [books, filter])

  const openBook = async (bookId: string) => {
    const pos = await getReadingPosition(bookId)
    if (pos) {
      onOpenTarget({ bookId, chapterNum: pos.chapterNum, paragraphId: pos.paragraphId })
    } else {
      onOpenBook(bookId)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-[var(--text)] md:text-3xl">
          Library
        </h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          {books.length} books · read offline after first load
        </p>
      </header>

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

      <div className="relative mt-6">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by title or code…"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-3 pl-4 pr-4 text-base text-[var(--text)] outline-none placeholder:text-[var(--text-3)] focus:border-[var(--accent)]/40 focus:ring-2 focus:ring-[var(--accent)]/10"
        />
      </div>

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
                  <p className="font-serif text-[15px] font-medium leading-snug text-[var(--text)]">
                    {book.title}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-3)]">
                    {book.code} · {book.chapter_count} ch · {book.paragraph_count.toLocaleString()} ¶
                  </p>
                </div>
                <IconChevronRight className="text-[var(--text-3)]/60" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
