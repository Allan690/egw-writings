import {
  getAllReadingPositions,
  getUserDb,
  listBookmarks,
  listHighlights,
} from '../db/userStore'
import type { Bookmark, Highlight, ReadingPosition } from '../types'

/**
 * Export/import for everything the reader has made.
 *
 * Local-first only holds up if your work can leave the device it was made
 * on. Highlights, bookmarks and reading positions live in IndexedDB, which
 * a cleared browser wipes without warning — so they need a portable file.
 */

export const BACKUP_VERSION = 1

export interface BackupFile {
  format: 'egw-writings-backup'
  version: number
  exportedAt: string
  bookmarks: Bookmark[]
  highlights: Highlight[]
  readingPositions: ReadingPosition[]
}

export async function buildBackup(): Promise<BackupFile> {
  const [bookmarks, highlights, readingPositions] = await Promise.all([
    listBookmarks(),
    listHighlights(),
    getAllReadingPositions(),
  ])
  return {
    format: 'egw-writings-backup',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    bookmarks,
    highlights,
    readingPositions,
  }
}

/** Readable companion to the JSON — the copy you paste into a sermon. */
export function backupToMarkdown(backup: BackupFile): string {
  const lines: string[] = ['# My EGW Writings notes', '']
  lines.push(`Exported ${new Date(backup.exportedAt).toLocaleString()}`, '')

  if (backup.highlights.length > 0) {
    lines.push(`## Highlights (${backup.highlights.length})`, '')
    for (const h of backup.highlights) {
      lines.push(`### ${h.reference}`, '', `> ${h.text}`, '')
      if (h.note) lines.push(`${h.note}`, '')
    }
  }

  if (backup.bookmarks.length > 0) {
    lines.push(`## Bookmarks (${backup.bookmarks.length})`, '')
    for (const b of backup.bookmarks) {
      lines.push(`### ${b.reference}`, '')
      if (b.text) lines.push(`> ${b.text}`, '')
      if (b.note) lines.push(`${b.note}`, '')
    }
  }

  if (backup.highlights.length === 0 && backup.bookmarks.length === 0) {
    lines.push('_Nothing saved yet._', '')
  }

  return lines.join('\n')
}

function download(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next frame so Safari has taken the blob.
  requestAnimationFrame(() => URL.revokeObjectURL(url))
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function exportBackupJson(): Promise<number> {
  const backup = await buildBackup()
  download(
    `egw-notes-${stamp()}.json`,
    JSON.stringify(backup, null, 2),
    'application/json',
  )
  return backup.bookmarks.length + backup.highlights.length
}

export async function exportBackupMarkdown(): Promise<number> {
  const backup = await buildBackup()
  download(`egw-notes-${stamp()}.md`, backupToMarkdown(backup), 'text/markdown')
  return backup.bookmarks.length + backup.highlights.length
}

export interface ImportResult {
  bookmarksAdded: number
  highlightsAdded: number
  positionsAdded: number
  skipped: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseBackup(raw: string): BackupFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (!isRecord(parsed) || parsed.format !== 'egw-writings-backup') {
    throw new Error('That file is not an EGW Writings export.')
  }
  if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION) {
    throw new Error('That export came from a newer version of the app.')
  }
  return {
    format: 'egw-writings-backup',
    version: parsed.version,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    bookmarks: Array.isArray(parsed.bookmarks) ? (parsed.bookmarks as Bookmark[]) : [],
    highlights: Array.isArray(parsed.highlights) ? (parsed.highlights as Highlight[]) : [],
    readingPositions: Array.isArray(parsed.readingPositions)
      ? (parsed.readingPositions as ReadingPosition[])
      : [],
  }
}

/**
 * Merges an export into the local stores. Existing records win — importing
 * never overwrites something you already have, so a re-import is a no-op
 * rather than a way to lose edits.
 */
export async function importBackup(backup: BackupFile): Promise<ImportResult> {
  const db = await getUserDb()
  const result: ImportResult = {
    bookmarksAdded: 0,
    highlightsAdded: 0,
    positionsAdded: 0,
    skipped: 0,
  }

  for (const bookmark of backup.bookmarks) {
    if (!bookmark?.id || typeof bookmark.paragraphId !== 'number') {
      result.skipped++
      continue
    }
    if (await db.get('bookmarks', bookmark.id)) {
      result.skipped++
      continue
    }
    await db.put('bookmarks', bookmark)
    result.bookmarksAdded++
  }

  for (const highlight of backup.highlights) {
    if (!highlight?.id || typeof highlight.paragraphId !== 'number') {
      result.skipped++
      continue
    }
    if (await db.get('highlights', highlight.id)) {
      result.skipped++
      continue
    }
    await db.put('highlights', highlight)
    result.highlightsAdded++
  }

  for (const position of backup.readingPositions) {
    if (!position?.bookId) {
      result.skipped++
      continue
    }
    const existing = await db.get('reading_positions', position.bookId)
    // Keep whichever position is more recent.
    if (existing && existing.updatedAt >= position.updatedAt) {
      result.skipped++
      continue
    }
    await db.put('reading_positions', position)
    result.positionsAdded++
  }

  return result
}
