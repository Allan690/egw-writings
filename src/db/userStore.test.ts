import 'fake-indexeddb/auto'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bookmark = { id: 'saved-bookmark', paragraphId: 42, reference: 'DA 22.1',
  text: 'God’s love endures.', note: 'My bookmark note', createdAt: 100 }
const highlight = { id: 'saved-highlight', paragraphId: 42, reference: 'DA 22.1',
  text: 'love', startOffset: 6, endOffset: 10, color: 'amber', note: 'My highlight note', createdAt: 101 }
const position = { bookId: 'da', chapterNum: 1, paragraphId: 42, updatedAt: 102 }

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})

async function seedHistoricalDb(version: number) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('egw-user', version)
    request.onupgradeneeded = () => {
      const db = request.result
      const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'id' })
      bookmarks.createIndex('by-reference', 'reference')
      bookmarks.createIndex('by-created', 'createdAt')
      if (version === 2) bookmarks.createIndex('by-paragraph', 'paragraphId')
      const highlights = db.createObjectStore('highlights', { keyPath: 'id' })
      highlights.createIndex('by-paragraph', 'paragraphId')
      if (version === 2) highlights.createIndex('by-created', 'createdAt')
      db.createObjectStore('reading_positions', { keyPath: 'bookId' })
      db.createObjectStore('settings', { keyPath: 'key' })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(['bookmarks', 'highlights', 'reading_positions', 'settings'], 'readwrite')
      tx.objectStore('bookmarks').put(bookmark)
      tx.objectStore('highlights').put(highlight)
      tx.objectStore('reading_positions').put(position)
      tx.objectStore('settings').put({ key: 'theme', value: 'dark' })
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    }
  })
}

describe('saved annotation compatibility across application reloads', () => {
  for (const version of [1, 2]) {
    it(`preserves v${version} IDs, offsets, notes, settings and positions`, async () => {
      await seedHistoricalDb(version)
      let store = await import('./userStore')
      expect(await store.listBookmarks()).toEqual([bookmark])
      expect(await store.getHighlightsForParagraph(42)).toEqual([highlight])
      expect(await store.getReadingPosition('da')).toEqual(position)
      expect(await store.getSetting('theme', 'light')).toBe('dark')
      expect((await store.getUserDb()).version).toBe(2)
      expect(bookmark.text.slice(highlight.startOffset, highlight.endOffset)).toBe(highlight.text)
      await store.updateBookmarkNote(bookmark.id, 'Edited bookmark note')
      await store.updateHighlightNote(highlight.id, 'Edited highlight note')
      ;(await store.getUserDb()).close()
      // Reopening models an application update/reload; the DB factory survives.
      vi.resetModules()
      store = await import('./userStore')
      expect(await store.listBookmarks()).toEqual([{ ...bookmark, note: 'Edited bookmark note' }])
      expect(await store.listHighlights()).toEqual([{ ...highlight, note: 'Edited highlight note' }])
      expect(await store.getReadingPosition('da')).toEqual(position)
      ;(await store.getUserDb()).close()
    })
  }
})
