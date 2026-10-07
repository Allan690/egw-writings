import { expect, test } from '@playwright/test'

for (const version of [1, 2]) {
  test(`opens existing v${version} annotations without losing notes or offsets`, async ({ page }) => {
    await page.route('**/src/main.tsx', route => route.fulfill({ contentType: 'text/javascript', body: '' }))
    await page.goto('/')
    const records = {
      bookmark: { id: 'old-bookmark', paragraphId: 42, reference: 'DA 22.1',
        text: 'God’s love endures.', note: 'A saved bookmark note', createdAt: 100 },
      highlight: { id: 'old-highlight', paragraphId: 42, reference: 'DA 22.1',
        text: 'love', startOffset: 6, endOffset: 10, color: 'amber',
        note: 'A saved highlight note', createdAt: 101 },
      position: { bookId: 'da', chapterNum: 1, paragraphId: 42, updatedAt: 102 },
      setting: { key: 'theme', value: 'dark' },
    }
    // Seed the historical schema directly, before loading the new userStore.
    await page.evaluate(async ({ version, records }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('egw-user', version)
        request.onupgradeneeded = () => {
          const db = request.result
          const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'id' })
          bookmarks.createIndex('by-reference', 'reference')
          bookmarks.createIndex('by-created', 'createdAt')
          if (version >= 2) bookmarks.createIndex('by-paragraph', 'paragraphId')
          const highlights = db.createObjectStore('highlights', { keyPath: 'id' })
          highlights.createIndex('by-paragraph', 'paragraphId')
          if (version >= 2) highlights.createIndex('by-created', 'createdAt')
          db.createObjectStore('reading_positions', { keyPath: 'bookId' })
          db.createObjectStore('settings', { keyPath: 'key' })
        }
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction(['bookmarks', 'highlights', 'reading_positions', 'settings'], 'readwrite')
          tx.objectStore('bookmarks').put(records.bookmark)
          tx.objectStore('highlights').put(records.highlight)
          tx.objectStore('reading_positions').put(records.position)
          tx.objectStore('settings').put(records.setting)
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(tx.error)
        }
      })
    }, { version, records })
    await page.unroute('**/src/main.tsx')
    await page.reload()
    const result = await page.evaluate(async () => {
      const path = '/src/db/userStore.ts'
      const store = await import(/* @vite-ignore */ path)
      return { bookmarks: await store.listBookmarks(), highlights: await store.listHighlights(),
        position: await store.getReadingPosition('da'), theme: await store.getSetting('theme', 'light'),
        version: (await store.getUserDb()).version }
    })
    expect(result.bookmarks).toEqual([records.bookmark])
    expect(result.highlights).toEqual([records.highlight])
    expect(result.position).toEqual(records.position)
    expect(result.theme).toBe('dark')
    expect(result.version).toBe(2)
    expect(records.bookmark.text.slice(result.highlights[0].startOffset, result.highlights[0].endOffset)).toBe('love')
    // Existing identities remain editable after the update and another reload.
    await page.evaluate(async () => {
      const path = '/src/db/userStore.ts'
      const store = await import(/* @vite-ignore */ path)
      await store.updateBookmarkNote('old-bookmark', 'Updated bookmark note')
      await store.updateHighlightNote('old-highlight', 'Updated highlight note')
    })
    await page.reload()
    const updated = await page.evaluate(async () => {
      const path = '/src/db/userStore.ts'
      const store = await import(/* @vite-ignore */ path)
      return { bookmark: (await store.listBookmarks())[0], highlight: (await store.listHighlights())[0] }
    })
    expect(updated.bookmark).toEqual({ ...records.bookmark, note: 'Updated bookmark note' })
    expect(updated.highlight).toEqual({ ...records.highlight, note: 'Updated highlight note' })
  })
}
