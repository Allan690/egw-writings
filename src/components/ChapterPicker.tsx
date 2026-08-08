import { useEffect, useMemo, useState } from 'react'
import { IconCheck, IconSearch } from './Icons'
import { Sheet } from './Sheet'

interface ChapterOption {
  number: number
  title: string
}

interface Props {
  open: boolean
  onClose: () => void
  chapters: ChapterOption[]
  current: number
  onSelect: (num: number) => void
}

export function ChapterPicker({ open, onClose, chapters, current, onSelect }: Props) {
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (open) setFilter('')
  }, [open])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return chapters
    return chapters.filter(
      (c) => String(c.number).includes(q) || c.title.toLowerCase().includes(q),
    )
  }, [chapters, filter])

  return (
    <Sheet open={open} onClose={onClose} title="Contents" size="lg">
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a chapter…"
            aria-label="Filter chapters"
            className="w-full rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] py-2.5 pl-9 pr-3 text-[var(--t-lg)] outline-none transition-colors focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <ul className="p-2">
        {filtered.map((ch) => {
          const active = ch.number === current
          return (
            <li key={ch.number}>
              <button
                type="button"
                onClick={() => {
                  onSelect(ch.number)
                  onClose()
                }}
                className="flex w-full items-start gap-3 rounded-[var(--r-sm)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
                style={{ background: active ? 'var(--accent-soft)' : undefined }}
              >
                <span
                  className="cite w-6 shrink-0 pt-1 text-right font-semibold"
                  style={{ color: active ? 'var(--accent)' : 'var(--cite)' }}
                >
                  {ch.number}
                </span>
                <span className="min-w-0 flex-1 font-serif text-[15px] leading-snug text-[var(--text)]">
                  {ch.title}
                </span>
                {active && <IconCheck className="mt-0.5 text-[var(--accent)]" />}
              </button>
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className="px-3 py-8 text-center text-[var(--t-small)] text-[var(--text-3)]">
            No chapter matches “{filter}”.
          </li>
        )}
      </ul>
    </Sheet>
  )
}
