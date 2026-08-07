import { useMemo, useState } from 'react'

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

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return chapters
    return chapters.filter(
      (c) => String(c.number).includes(q) || c.title.toLowerCase().includes(q),
    )
  }, [chapters, filter])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-2xl bg-[var(--surface)] shadow-xl sm:rounded-2xl">
        <div className="border-b border-[var(--border)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold">Chapters</h2>
            <button type="button" onClick={onClose} className="text-sm text-[var(--text-3)]">
              Done
            </button>
          </div>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-base outline-none"
          />
        </div>
        <ul className="overflow-y-auto p-2">
          {filtered.map((ch) => (
            <li key={ch.number}>
              <button
                type="button"
                onClick={() => {
                  onSelect(ch.number)
                  onClose()
                  setFilter('')
                }}
                className={`flex w-full gap-3 rounded-lg px-3 py-3 text-left ${
                  ch.number === current ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--surface-2)]'
                }`}
              >
                <span className="shrink-0 font-mono text-sm font-semibold text-[var(--accent)]">
                  {ch.number}
                </span>
                <span className="font-serif text-[15px] leading-snug">{ch.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
