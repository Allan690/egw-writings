export const PIONEER_BOOK_PREFIX = 'p-'
export const PIONEER_PARAGRAPH_OFFSET = 10_000_000

export type BookCollection = 'egw' | 'pioneer'

export function pioneerBookId(apiBookId: number): string {
  return `${PIONEER_BOOK_PREFIX}${apiBookId}`
}

export function isPioneerBookId(bookId: string): boolean {
  return bookId.startsWith(PIONEER_BOOK_PREFIX)
}

export function isPioneerParagraphId(paragraphId: number): boolean {
  return paragraphId >= PIONEER_PARAGRAPH_OFFSET
}
