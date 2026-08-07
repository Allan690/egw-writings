import { useState } from 'react'
import { getSearchApi } from '../db/corpus'
import type { ReaderTarget } from '../types'

interface Props {
  onOpen: (target: ReaderTarget) => void
}

export function ReferenceLookup({ onOpen }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    const trimmed = value.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const para = await getSearchApi().lookupByReference(trimmed)
      if (!para) {
        setError('Not found — try PP 155.1 or DA 25.2')
        return
      }
      onOpen({
        bookId: para.book_id,
        chapterNum: para.chapter_num,
        paragraphId: para.id,
      })
      setValue('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-3">
      <label className="mb-2 block text-xs font-medium text-[var(--text-3)]">
        Jump to reference
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder="e.g. PP 155.1"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/40"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={loading || !value.trim()}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Go
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
