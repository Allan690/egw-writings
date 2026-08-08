import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSearchApi } from '../db/corpus'
import {
  listBookmarks,
  listHighlights,
  removeBookmark,
  removeHighlight,
  updateBookmarkNote,
  updateHighlightNote,
} from '../db/userStore'
import { highlightClassName } from '../lib/highlightText'
import { formatCount, formatDate } from '../lib/format'
import type { Bookmark, Highlight as SavedHighlight, ReaderTarget } from '../types'
import { IconNote, IconSearch, IconSettings, IconTrash } from './Icons'

interface Props {
  onOpen: (target: ReaderTarget) => void
  onOpenSettings: () => void
}

type Tab = 'bookmarks' | 'highlights'

/** One shape for both kinds of saved item, so the list renders once. */
interface SavedItem {
  id: string
  paragraphId: number
  reference: string
  text: string
  note: string
  createdAt: number
  color?: string
}

export function SavedView({ onOpen, onOpenSettings }: Props) {
  const [tab, setTab] = useState<Tab>('bookmarks')
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [highlights, setHighlights] = useState<SavedHighlight[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const refresh = useCallback(async () => {
    const [marks, highs] = await Promise.all([listBookmarks(), listHighlights()])
    setBookmarks(marks)
    setHighlights(highs)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const items: SavedItem[] = useMemo(() => {
    const source: SavedItem[] =
      tab === 'bookmarks'
        ? bookmarks.map((b) => ({
            id: b.id,
            paragraphId: b.paragraphId,
            reference: b.reference,
            text: b.text,
            note: b.note,
            createdAt: b.createdAt,
          }))
        : highlights.map((h) => ({
            id: h.id,
            paragraphId: h.paragraphId,
            reference: h.reference,
            text: h.text,
            note: h.note,
            createdAt: h.createdAt,
            color: h.color,
          }))

    const q = filter.trim().toLowerCase()
    if (!q) return source
    return source.filter(
      (item) =>
        item.reference.toLowerCase().includes(q) ||
        item.text.toLowerCase().includes(q) ||
        item.note.toLowerCase().includes(q),
    )
  }, [tab, bookmarks, highlights, filter])

  const openItem = async (paragraphId: number) => {
    const para = await getSearchApi().getParagraph(paragraphId)
    if (!para) return
    onOpen({ bookId: para.book_id, chapterNum: para.chapter_num, paragraphId: para.id })
  }

  const remove = async (id: string) => {
    if (tab === 'bookmarks') await removeBookmark(id)
    else await removeHighlight(id)
    await refresh()
  }

  const saveNote = async (id: string) => {
    if (tab === 'bookmarks') await updateBookmarkNote(id, draft.trim())
    else await updateHighlightNote(id, draft.trim())
    setEditing(null)
    setDraft('')
    await refresh()
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-[var(--t-display)] font-semibold text-[var(--text)]">
            Saved
          </h1>
          <p className="mt-1 text-[var(--t-small)] text-[var(--text-3)]">
            Kept on this device only. Nothing is uploaded.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex shrink-0 items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border)] px-2.5 py-1.5 text-[var(--t-tiny)] font-medium text-[var(--text-2)] transition-colors hover:border-[var(--border-strong)]"
        >
          <IconSettings className="h-3.5 w-3.5" />
          Export
        </button>
      </header>

      <div className="flex gap-1 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-1">
        <TabButton
          label="Bookmarks"
          count={bookmarks.length}
          active={tab === 'bookmarks'}
          onClick={() => setTab('bookmarks')}
        />
        <TabButton
          label="Highlights"
          count={highlights.length}
          active={tab === 'highlights'}
          onClick={() => setTab('highlights')}
        />
      </div>

      {(bookmarks.length > 0 || highlights.length > 0) && (
        <div className="relative mt-3">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find in what you've saved…"
            aria-label="Filter saved items"
            className="w-full rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-9 pr-3 text-[var(--t-lg)] outline-none transition-colors focus:border-[var(--accent)]"
          />
        </div>
      )}

      {loading ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="skeleton h-2.5 w-16" />
              <div className="skeleton mt-2.5 h-3.5 w-full" />
              <div className="skeleton mt-1.5 h-3.5 w-3/4" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptySaved
          filtered={filter.trim().length > 0}
          tab={tab}
          onClearFilter={() => setFilter('')}
        />
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5 transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void openItem(item.paragraphId)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="cite font-semibold">{item.reference}</span>
                    <span className="text-[var(--t-micro)] text-[var(--text-3)]">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 font-serif text-[15px] leading-relaxed text-[var(--text-2)]">
                    {/* The colour marks the words, not the row. */}
                    {item.color ? (
                      <span
                        className={`rounded px-0.5 ${highlightClassName(item.color)}`}
                        style={{ boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}
                      >
                        “{item.text}”
                      </span>
                    ) : (
                      item.text
                    )}
                  </p>
                </button>

                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(editing === item.id ? null : item.id)
                      setDraft(item.note)
                    }}
                    aria-label={item.note ? 'Edit note' : 'Add a note'}
                    className="grid h-8 w-8 place-items-center rounded-[var(--r-sm)] transition-colors hover:bg-[var(--surface-2)]"
                    style={{ color: item.note ? 'var(--accent)' : 'var(--text-3)' }}
                  >
                    <IconNote />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(item.id)}
                    aria-label="Remove"
                    className="grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[var(--text-3)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>

              {editing === item.id ? (
                <div className="mt-3">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="Why does this matter to you?"
                    className="w-full resize-none rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] p-2.5 text-[var(--t-lg)] leading-relaxed outline-none transition-colors focus:border-[var(--accent)]"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-[var(--r-sm)] px-3 py-1.5 text-[var(--t-small)] font-medium text-[var(--text-3)] transition-colors hover:bg-[var(--surface-2)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveNote(item.id)}
                      className="rounded-[var(--r-sm)] px-3 py-1.5 text-[var(--t-small)] font-medium"
                      style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
                    >
                      Save note
                    </button>
                  </div>
                </div>
              ) : (
                item.note && (
                  <p className="mt-2.5 border-l-2 border-[var(--accent)] pl-2.5 text-[var(--t-small)] leading-relaxed text-[var(--text-2)]">
                    {item.note}
                  </p>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && filter.trim().length > 0 && (
        <p className="mt-4 text-center text-[var(--t-tiny)] text-[var(--text-3)]">
          {formatCount(items.length)} of{' '}
          {formatCount(tab === 'bookmarks' ? bookmarks.length : highlights.length)} shown
        </p>
      )}
    </div>
  )
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-[3px] py-2 text-[var(--t-small)] font-medium transition-colors"
      style={{
        background: active ? 'var(--surface)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text-3)',
      }}
    >
      {label}
      <span
        className="font-mono text-[var(--t-micro)]"
        style={{ fontVariantNumeric: 'tabular-nums', color: active ? 'var(--cite)' : 'inherit' }}
      >
        {count}
      </span>
    </button>
  )
}

function EmptySaved({
  filtered,
  tab,
  onClearFilter,
}: {
  filtered: boolean
  tab: Tab
  onClearFilter: () => void
}) {
  if (filtered) {
    return (
      <div className="mt-4 rounded-[var(--r-md)] border border-dashed border-[var(--border-strong)] p-10 text-center">
        <p className="font-serif text-[17px] text-[var(--text)]">Nothing matched</p>
        <button
          type="button"
          onClick={onClearFilter}
          className="mt-3 text-[var(--t-small)] font-medium text-[var(--accent)] underline underline-offset-2"
        >
          Clear the filter
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-[var(--r-md)] border border-dashed border-[var(--border-strong)] p-10 text-center">
      <p className="font-serif text-[17px] text-[var(--text)]">
        {tab === 'bookmarks' ? 'No bookmarks yet' : 'No highlights yet'}
      </p>
      <p className="mx-auto mt-2 max-w-xs text-[var(--t-small)] leading-relaxed text-[var(--text-3)]">
        {tab === 'bookmarks'
          ? 'While reading, tap a paragraph’s reference in the margin to bookmark it.'
          : 'While reading, select any passage and pick a colour to highlight it.'}
      </p>
    </div>
  )
}
