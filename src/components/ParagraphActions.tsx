import { useState } from 'react'
import type { Paragraph } from '../types'
import { IconBookmark, IconCheck, IconNote, IconShare } from './Icons'
import { Sheet } from './Sheet'

interface Props {
  para: Paragraph | null
  bookmarked: boolean
  onClose: () => void
  onToggleBookmark: (para: Paragraph) => void
  onShare: (para: Paragraph) => void
}

/**
 * Everything you can do to one paragraph, opened from its citation.
 * Replaces the row of hover-revealed Save/Share buttons that used to sit
 * above every paragraph in the chapter.
 */
export function ParagraphActions({
  para,
  bookmarked,
  onClose,
  onToggleBookmark,
  onShare,
}: Props) {
  const [copied, setCopied] = useState(false)

  const copyCitation = async () => {
    if (!para) return
    await navigator.clipboard
      .writeText(`“${para.text}” —${para.reference}`)
      .catch(() => undefined)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Sheet open={para !== null} onClose={onClose} title={para?.reference ?? ''}>
      {para && (
        <div className="p-4">
          <p className="line-clamp-4 font-serif text-[15px] leading-relaxed text-[var(--text-2)]">
            {para.text}
          </p>

          <div className="mt-4 space-y-1">
            <ActionRow
              icon={<IconBookmark filled={bookmarked} className="h-4 w-4" />}
              label={bookmarked ? 'Remove bookmark' : 'Bookmark this paragraph'}
              onClick={() => onToggleBookmark(para)}
            />
            <ActionRow
              icon={copied ? <IconCheck /> : <IconNote />}
              label={copied ? 'Copied with citation' : 'Copy with citation'}
              onClick={() => void copyCitation()}
              highlight={copied}
            />
            <ActionRow
              icon={<IconShare />}
              label="Share"
              onClick={() => onShare(para)}
            />
          </div>
        </div>
      )}
    </Sheet>
  )
}

function ActionRow({
  icon,
  label,
  onClick,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  highlight?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[var(--r-sm)] px-3 py-2.5 text-left text-[var(--t-base)] font-medium transition-colors hover:bg-[var(--surface-2)]"
      style={{ color: highlight ? 'var(--accent)' : 'var(--text)' }}
    >
      {icon}
      {label}
    </button>
  )
}
