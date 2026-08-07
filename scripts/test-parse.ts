import { fetchArchiveCatalog } from './archive-books'
import { parseArchiveDjvu } from './parse-archive-djvu'

const catalog = await fetchArchiveCatalog()
console.log('books', catalog.length)

for (const code of ['pp', 'sc', '1t', 'col', 'mb', 'ew', 'wlf', 'apm', 'gw', 'cos']) {
  const book = catalog.find((b) => b.id === code)
  if (!book) {
    console.log('missing', code)
    continue
  }
  const raw = await fetch(book.url).then((r) => r.text())
  const p = parseArchiveDjvu(book.id, book.code, raw)
  console.log(
    book.code,
    p.length,
    'paragraphs, chapters',
    new Set(p.map((x) => x.chapterNum)).size,
  )
}
