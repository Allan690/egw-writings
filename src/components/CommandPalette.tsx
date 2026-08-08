import { useEffect, useMemo, useRef, useState } from 'react'
import { getSearchApi } from '../db/corpus'
import { parseReference } from '../db/searchEngine'
import type { Book, ReaderTarget, View } from '../types'
import { IconBookmark, IconClose, IconLibrary, IconSearch, IconSettings } from './Icons'

interface Props {
  open: boolean
  onClose: () => void
  books: Book[]
  onOpenBook: (bookId: string) => void
  onOpenTarget: (target: ReaderTarget) => void
  onSearch: (query: string) => void
  onNavigate: (view: View) => void
  onOpenSettings: () => void
}

type Item =
  | { kind: 'reference'; label: string; hint: string; run: () => void }
  | { kind: 'search'; label: string; hint: string; run: () => void }
  | { kind: 'book'; label: string; hint: string; code: string; run: () => void }
  | { kind: 'command'; label: string; hint: string; icon: React.ReactNode; run: () => void }

/**
 * One place to go anywhere: a citation, a book, a phrase, or a view.
 *
 * ⌘K used to just focus the search box. Making it resolve references too is
 * what lets the Library stop devoting prime space to a "Jump to reference"
 * form that most visits never use.
 */
export function CommandPalette({
  open,
  onClose,
  books,
  onOpenBook,
  onOpenTarget,
  onSearch,
  onNavigate,
  onOpenSettings,
}: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [refError, setRefError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement | null
    setQuery('')
    setActive(0)
    setRefError(null)
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(id)
      document.body.style.overflow = prevOverflow
      restoreTo.current?.focus?.()
    }
  }, [open])

  const trimmed = query.trim()

  const goToReference = async (ref: string) => {
    const para = await getSearchApi().lookupByReference(ref)
    if (!para) {
      setRefError(`No paragraph at ${ref.toUpperCase()}`)
      return
    }
    onOpenTarget({
      bookId: para.book_id,
      chapterNum: para.chapter_num,
      paragraphId: para.id,
    })
    onClose()
  }

  const items: Item[] = useMemo(() => {
    const list: Item[] = []
    if (!open) return list

    if (trimmed) {
      // A reference is unambiguous — it always leads.
      if (parseReference(trimmed)) {
        list.push({
          kind: 'reference',
          label: trimmed.toUpperCase(),
          hint: 'Go to this paragraph',
          run: () => void goToReference(trimmed),
        })
      }

      list.push({
        kind: 'search',
        label: `Search for “${trimmed}”`,
        hint: 'Every book on this device',
        run: () => {
          onSearch(trimmed)
          onClose()
        },
      })

      const q = trimmed.toLowerCase()
      const matches = books
        .filter(
          (b) =>
            b.title.toLowerCase().includes(q) ||
            b.code.toLowerCase().includes(q) ||
            b.author.toLowerCase().includes(q),
        )
        .slice(0, 6)
      for (const book of matches) {
        list.push({
          kind: 'book',
          label: book.title,
          code: book.code,
          hint:
            book.collection === 'pioneer'
              ? `${book.author} · ${book.chapter_count} chapters`
              : `${book.chapter_count} chapters`,
          run: () => {
            onOpenBook(book.id)
            onClose()
          },
        })
      }
    } else {
      list.push(
        {
          kind: 'command',
          label: 'Library',
          hint: 'Browse every book',
          icon: <IconLibrary className="h-4 w-4" />,
          run: () => {
            onNavigate('library')
            onClose()
          },
        },
        {
          kind: 'command',
          label: 'Search',
          hint: 'Full text, across the corpus',
          icon: <IconSearch className="h-4 w-4" />,
          run: () => {
            onNavigate('search')
            onClose()
          },
        },
        {
          kind: 'command',
          label: 'Saved',
          hint: 'Your bookmarks and highlights',
          icon: <IconBookmark className="h-4 w-4" />,
          run: () => {
            onNavigate('saved')
            onClose()
          },
        },
        {
          kind: 'command',
          label: 'Settings',
          hint: 'Storage, themes, export',
          icon: <IconSettings className="h-4 w-4" />,
          run: () => {
            onOpenSettings()
            onClose()
          },
        },
      )
    }

    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trimmed, books])

  useEffect(() => {
    setActive(0)
    setRefError(null)
  }, [trimmed])

  useEffect(() => {
    listRef.current?.querySelectorAll('[data-item]')[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % Math.max(1, items.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + items.length) % Math.max(1, items.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[active]?.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center px-3 sm:px-4 sm:pt-[12vh]"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <div
        className="anim-fade absolute inset-0"
        style={{ background: 'var(--scrim)' }}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to"
        className="anim-pop relative flex w-full max-w-lg flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)]"
        style={{ boxShadow: 'var(--shadow-pop)' }}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] pl-3.5 pr-3">
          <IconSearch className="h-[18px] w-[18px] shrink-0 text-[var(--text-3)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search, a book, or PP 155.1"
            aria-label="Search, jump to a book, or enter a reference"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-3 text-[var(--t-lg)] text-[var(--text)] outline-none placeholder:text-[var(--text-3)] sm:py-3.5"
          />
          {/* Touch devices get a real close target; pointer devices get the hint. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-2)] sm:hidden"
          >
            <IconClose />
          </button>
          <kbd className="hidden shrink-0 rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-3)] sm:block">
            esc
          </kbd>
        </div>

        {refError && (
          <p className="border-b border-[var(--border)] px-3.5 py-2 text-[var(--t-small)] text-[var(--danger)]">
            {refError}
          </p>
        )}

        <ul ref={listRef} className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain p-1.5">
          {items.map((item, i) => (
            <li key={`${item.kind}-${item.label}-${i}`}>
              <button
                type="button"
                data-item
                onClick={item.run}
                // mousemove, not mouseenter: a stationary cursor that the list
                // re-renders underneath would otherwise steal the keyboard
                // selection, and Enter would open the wrong result.
                onMouseMove={() => setActive(i)}
                className="flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2 py-2 text-left transition-colors sm:gap-3 sm:px-2.5"
                style={{ background: i === active ? 'var(--accent-soft)' : 'transparent' }}
              >
                <span className="grid w-9 shrink-0 place-items-center sm:w-11">
                  {item.kind === 'book' ? (
                    <span className="cite font-semibold">{item.code}</span>
                  ) : item.kind === 'reference' ? (
                    <span className="cite font-semibold">REF</span>
                  ) : item.kind === 'command' ? (
                    <span className="text-[var(--text-2)]">{item.icon}</span>
                  ) : (
                    <IconSearch className="h-4 w-4 text-[var(--text-3)]" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[var(--t-base)] font-medium text-[var(--text)]">
                    {item.label}
                  </span>
                  <span className="block truncate text-[var(--t-tiny)] text-[var(--text-3)]">
                    {item.hint}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-3 py-8 text-center text-[var(--t-small)] text-[var(--text-3)]">
              Nothing to jump to.
            </li>
          )}
        </ul>

        {/* Keyboard hints mean nothing on a phone, and wrapped onto two lines
            there. Only the local-first line is worth the space on touch. */}
        <div className="flex items-center gap-3 whitespace-nowrap border-t border-[var(--border)] px-3.5 py-2 text-[var(--t-micro)] text-[var(--text-3)]">
          <span className="hidden sm:inline">
            <Key>↑</Key> <Key>↓</Key> move
          </span>
          <span className="hidden sm:inline">
            <Key>↵</Key> open
          </span>
          <span className="mx-auto sm:mx-0 sm:ml-auto">Everything is on this device</span>
        </div>
      </div>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 font-mono text-[10px]">
      {children}
    </kbd>
  )
}
