import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Bookmark, Highlight, ReadingPosition } from '../types'

interface EgwUserDb extends DBSchema {
  bookmarks: {
    key: string
    value: Bookmark
    indexes: { 'by-reference': string; 'by-created': number; 'by-paragraph': number }
  }
  highlights: {
    key: string
    value: Highlight
    indexes: { 'by-paragraph': number; 'by-created': number }
  }
  reading_positions: {
    key: string
    value: ReadingPosition
  }
  settings: {
    key: string
    value: { key: string; value: unknown }
  }
}

let dbPromise: Promise<IDBPDatabase<EgwUserDb>> | null = null

export function getUserDb() {
  if (!dbPromise) {
    dbPromise = openDB<EgwUserDb>('egw-user', 2, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'id' })
          bookmarks.createIndex('by-reference', 'reference')
          bookmarks.createIndex('by-created', 'createdAt')
          bookmarks.createIndex('by-paragraph', 'paragraphId')

          const highlights = db.createObjectStore('highlights', { keyPath: 'id' })
          highlights.createIndex('by-paragraph', 'paragraphId')
          highlights.createIndex('by-created', 'createdAt')

          db.createObjectStore('reading_positions', { keyPath: 'bookId' })
          db.createObjectStore('settings', { keyPath: 'key' })
        }
        if (oldVersion < 2) {
          const bookmarks = transaction.objectStore('bookmarks')
          if (!bookmarks.indexNames.contains('by-paragraph')) {
            bookmarks.createIndex('by-paragraph', 'paragraphId')
          }
          const highlights = transaction.objectStore('highlights')
          if (!highlights.indexNames.contains('by-created')) {
            highlights.createIndex('by-created', 'createdAt')
          }
        }
      },
    })
  }
  return dbPromise
}

export async function addBookmark(
  paragraphId: number,
  reference: string,
  text = '',
  note = '',
): Promise<Bookmark> {
  const db = await getUserDb()
  const found = await db.getFromIndex('bookmarks', 'by-paragraph', paragraphId)
  if (found) {
    const updated: Bookmark = { ...found, text: text || found.text, note: note || found.note }
    await db.put('bookmarks', updated)
    return updated
  }

  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    paragraphId,
    reference,
    text,
    note,
    createdAt: Date.now(),
  }
  await db.put('bookmarks', bookmark)
  return bookmark
}

export async function updateBookmarkNote(id: string, note: string) {
  const db = await getUserDb()
  const bookmark = await db.get('bookmarks', id)
  if (!bookmark) return
  await db.put('bookmarks', { ...bookmark, note })
}

export async function removeBookmark(id: string) {
  const db = await getUserDb()
  await db.delete('bookmarks', id)
}

export async function listBookmarks(): Promise<Bookmark[]> {
  const db = await getUserDb()
  const all = await db.getAllFromIndex('bookmarks', 'by-created')
  return all.reverse()
}

export async function isBookmarked(paragraphId: number): Promise<boolean> {
  const db = await getUserDb()
  const all = await db.getAllFromIndex('bookmarks', 'by-paragraph')
  return all.some((b) => b.paragraphId === paragraphId)
}

export async function saveReadingPosition(position: ReadingPosition) {
  const db = await getUserDb()
  await db.put('reading_positions', position)
}

export async function getReadingPosition(
  bookId: string,
): Promise<ReadingPosition | undefined> {
  const db = await getUserDb()
  return db.get('reading_positions', bookId)
}

export async function getAllReadingPositions(): Promise<ReadingPosition[]> {
  const db = await getUserDb()
  return db.getAll('reading_positions')
}

export async function addHighlight(
  paragraphId: number,
  reference: string,
  text: string,
  startOffset: number,
  endOffset: number,
  color = 'amber',
  note = '',
): Promise<Highlight> {
  const db = await getUserDb()
  const existing = await db.getAllFromIndex('highlights', 'by-paragraph', paragraphId)
  const duplicate = existing.find(
    (h) => h.startOffset === startOffset && h.endOffset === endOffset,
  )
  if (duplicate) {
    const updated: Highlight = {
      ...duplicate,
      color,
      text,
      note: note || duplicate.note,
    }
    await db.put('highlights', updated)
    return updated
  }

  const highlight: Highlight = {
    id: crypto.randomUUID(),
    paragraphId,
    reference,
    text,
    startOffset,
    endOffset,
    color,
    note,
    createdAt: Date.now(),
  }
  await db.put('highlights', highlight)
  return highlight
}

export async function removeHighlightsInRange(
  paragraphId: number,
  startOffset: number,
  endOffset: number,
): Promise<string[]> {
  const db = await getUserDb()
  const existing = await db.getAllFromIndex('highlights', 'by-paragraph', paragraphId)
  const toRemove = existing.filter(
    (h) => h.startOffset < endOffset && startOffset < h.endOffset,
  )
  for (const h of toRemove) {
    await db.delete('highlights', h.id)
  }
  return toRemove.map((h) => h.id)
}

export async function removeHighlight(id: string) {
  const db = await getUserDb()
  await db.delete('highlights', id)
}

export async function listHighlights(): Promise<Highlight[]> {
  const db = await getUserDb()
  const all = await db.getAllFromIndex('highlights', 'by-created')
  return all.reverse()
}

export async function getHighlightsForParagraph(
  paragraphId: number,
): Promise<Highlight[]> {
  const db = await getUserDb()
  return db.getAllFromIndex('highlights', 'by-paragraph', paragraphId)
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getUserDb()
  const row = await db.get('settings', key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown) {
  const db = await getUserDb()
  await db.put('settings', { key, value })
}
