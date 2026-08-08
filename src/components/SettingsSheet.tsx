import { useCallback, useEffect, useRef, useState } from 'react'
import { getSearchApi } from '../db/corpus'
import { listBookmarks, listHighlights } from '../db/userStore'
import {
  exportBackupJson,
  exportBackupMarkdown,
  importBackup,
  parseBackup,
} from '../lib/backup'
import { formatBytes, formatCount, pluralize } from '../lib/format'
import type { Book } from '../types'
import { IconCheck, IconDownload, IconTrash, IconUpload } from './Icons'
import { Sheet } from './Sheet'

interface Props {
  open: boolean
  onClose: () => void
  books: Book[]
  pioneerStatus: string
  onCorpusChange: () => void
}

export function SettingsSheet({ open, onClose, books, pioneerStatus, onCorpusChange }: Props) {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)
  const [counts, setCounts] = useState({ bookmarks: 0, highlights: 0 })
  const [online, setOnline] = useState(navigator.onLine)
  const [status, setStatus] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const [marks, highs] = await Promise.all([listBookmarks(), listHighlights()])
    setCounts({ bookmarks: marks.length, highlights: highs.length })
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate()
      setUsage({ used: estimate.usage ?? 0, quota: estimate.quota ?? 0 })
    }
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const flash = (message: string) => {
    setStatus(message)
    setTimeout(() => setStatus(null), 3200)
  }

  const runExport = async (kind: 'json' | 'markdown') => {
    setBusy(true)
    try {
      const total =
        kind === 'json' ? await exportBackupJson() : await exportBackupMarkdown()
      flash(total === 0 ? 'Exported an empty file — nothing saved yet.' : `Exported ${total} items.`)
    } catch {
      flash('The export could not be created.')
    } finally {
      setBusy(false)
    }
  }

  const runImport = async (file: File) => {
    setBusy(true)
    try {
      const result = await importBackup(parseBackup(await file.text()))
      const added = result.bookmarksAdded + result.highlightsAdded
      flash(
        added === 0
          ? 'Everything in that file was already here.'
          : `Added ${added} items${result.skipped > 0 ? `, skipped ${result.skipped} already here` : ''}.`,
      )
      await refresh()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'That file could not be imported.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removePioneers = async () => {
    setBusy(true)
    try {
      await getSearchApi().removePioneers()
      onCorpusChange()
      await refresh()
      setConfirmRemove(false)
      flash('Pioneer library removed.')
    } catch {
      flash('The pioneer library could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  const egwCount = books.filter((b) => b.collection === 'egw').length
  const pioneerCount = books.filter((b) => b.collection === 'pioneer').length

  return (
    <Sheet open={open} onClose={onClose} title="Settings" size="lg">
      <div className="p-4">
        <Section label="On this device">
          <div className="rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] p-3.5">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: online ? 'var(--accent)' : 'var(--cite)' }}
              />
              <span className="text-[var(--t-small)] font-medium text-[var(--text)]">
                {online ? 'Online — but nothing needs it' : 'Offline — everything still works'}
              </span>
            </div>
            <p className="mt-1.5 text-[var(--t-small)] leading-relaxed text-[var(--text-2)]">
              Every book, search and note lives in this browser. There is no account and no
              server copy.
            </p>

            <dl className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
              <Stat label="Ellen G. White" value={`${formatCount(egwCount)} books`} />
              {pioneerCount > 0 && (
                <Stat label="Pioneer works" value={`${formatCount(pioneerCount)} books`} />
              )}
              <Stat
                label="Your notes"
                value={`${pluralize(counts.highlights, 'highlight')} · ${pluralize(
                  counts.bookmarks,
                  'bookmark',
                )}`}
              />
              {usage && (
                <Stat
                  label="Storage used"
                  value={
                    usage.quota > 0
                      ? `${formatBytes(usage.used)} of ${formatBytes(usage.quota)} available`
                      : formatBytes(usage.used)
                  }
                />
              )}
            </dl>
          </div>
        </Section>

        <Section label="Your notes">
          <p className="mb-2.5 text-[var(--t-small)] leading-relaxed text-[var(--text-2)]">
            Clearing this browser's data erases your highlights. Export a copy to keep them, or
            to move them to another device.
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <ActionButton
              icon={<IconDownload />}
              label="Export as JSON"
              hint="Import it back later"
              disabled={busy}
              onClick={() => void runExport('json')}
            />
            <ActionButton
              icon={<IconDownload />}
              label="Export as Markdown"
              hint="For reading and quoting"
              disabled={busy}
              onClick={() => void runExport('markdown')}
            />
          </div>
          <ActionButton
            className="mt-1.5"
            icon={<IconUpload />}
            label="Import from a file"
            hint="Merges in — never overwrites what you have"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void runImport(file)
            }}
          />
        </Section>

        {pioneerStatus === 'ready' && pioneerCount > 0 && (
          <Section label="Pioneer library">
            {confirmRemove ? (
              <div
                className="rounded-[var(--r-sm)] p-3.5"
                style={{ background: 'var(--danger-soft)' }}
              >
                <p className="text-[var(--t-small)] font-medium" style={{ color: 'var(--danger)' }}>
                  Remove {formatCount(pioneerCount)} pioneer works?
                </p>
                <p className="mt-1 text-[var(--t-small)] leading-relaxed text-[var(--text-2)]">
                  Ellen G. White's writings and all your notes stay. The app will offer to
                  download the pioneer library again next time you open it.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    className="flex-1 rounded-[var(--r-sm)] border border-[var(--border)] py-2 text-[var(--t-small)] font-medium text-[var(--text-2)]"
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removePioneers()}
                    className="flex-1 rounded-[var(--r-sm)] py-2 text-[var(--t-small)] font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--danger)' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <ActionButton
                icon={<IconTrash />}
                label="Remove the pioneer library"
                hint="Frees the space it takes up"
                danger
                onClick={() => setConfirmRemove(true)}
              />
            )}
          </Section>
        )}

        {status && (
          <p
            className="anim-fade mt-1 flex items-center gap-2 rounded-[var(--r-sm)] px-3 py-2.5 text-[var(--t-small)] font-medium"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            role="status"
          >
            <IconCheck />
            {status}
          </p>
        )}

        <p className="mt-5 text-center text-[var(--t-micro)] leading-relaxed text-[var(--text-3)]">
          Writings are public domain. App code is MIT licensed.
        </p>
      </div>
    </Sheet>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="cite mb-2" style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}>
        {label.toUpperCase()}
      </h3>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--t-small)] text-[var(--text-3)]">{label}</dt>
      <dd
        className="text-right font-mono text-[var(--t-tiny)] text-[var(--text-2)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </dd>
    </div>
  )
}

function ActionButton({
  icon,
  label,
  hint,
  onClick,
  disabled,
  danger,
  className = '',
}: {
  icon: React.ReactNode
  label: string
  hint: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-[var(--r-sm)] border border-[var(--border)] px-3 py-2.5 text-left transition-colors hover:border-[var(--border-strong)] disabled:opacity-50 ${className}`}
      style={{ color: danger ? 'var(--danger)' : 'var(--text)' }}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[var(--t-small)] font-medium">{label}</span>
        <span className="block truncate text-[var(--t-micro)] text-[var(--text-3)]">{hint}</span>
      </span>
    </button>
  )
}
