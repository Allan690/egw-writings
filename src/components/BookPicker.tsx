import { useEffect, useMemo, useRef, useState } from 'react'
import type { BookCollection } from '../lib/corpusConstants'
import type { Book } from '../types'
import { IconCheck, IconSearch } from './Icons'
import { Sheet } from './Sheet'

interface Props {
  open: boolean
  onClose: () => void
  books: Book[]
  collection: BookCollection | 'all'
  selected?: string
  onSelect: (id: string | undefined) => void
}

/**
 * Replaces the native <select> that held 140+ books — unsearchable, and on
 * mobile a full-screen wheel you scroll blind.
 */
export function BookPicker({ open, onClose, books, collection, selected, onSelect }: Props) {
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setFilter('')
  }, [open])

  const matches = useMemo(() => {
    const scoped =
      collection === 'all' ? books : books.filter((b) => b.collection === collection)
    const q = filter.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q),
    )
  }, [books, collection, filter])

  return (
    <Sheet open={open} onClose={onClose} title="Choose a book" size="lg">
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            ref={inputRef}
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title, code, or author…"
            aria-label="Filter books"
            className="w-full rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] py-2.5 pl-9 pr-3 text-[var(--t-lg)] outline-none transition-colors focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <ul className="p-2">
        <li>
          <PickerRow
            label="Every book"
            meta={`${books.length} in your library`}
            active={!selected}
            onClick={() => onSelect(undefined)}
          />
        </li>
        {matches.map((book) => (
          <li key={book.id}>
            <PickerRow
              code={book.code}
              label={book.title}
              meta={`${book.chapter_count} chapters${
                book.collection === 'pioneer' ? ` · ${book.author}` : ''
              }`}
              active={selected === book.id}
              onClick={() => onSelect(book.id)}
            />
          </li>
        ))}
        {matches.length === 0 && (
          <li className="px-3 py-8 text-center text-[var(--t-small)] text-[var(--text-3)]">
            No book matches “{filter}”.
          </li>
        )}
      </ul>
    </Sheet>
  )
}

function PickerRow({
  code,
  label,
  meta,
  active,
  onClick,
}: {
  code?: string
  label: string
  meta: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[var(--r-sm)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
      style={{ background: active ? 'var(--accent-soft)' : undefined }}
    >
      {code && (
        <span className="cite w-12 shrink-0 font-semibold uppercase">{code}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-serif text-[15px] leading-snug text-[var(--text)]">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-[var(--t-tiny)] text-[var(--text-3)]">
          {meta}
        </span>
      </span>
      {active && <IconCheck className="text-[var(--accent)]" />}
    </button>
  )
}
