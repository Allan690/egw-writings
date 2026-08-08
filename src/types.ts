import type { BookCollection } from './lib/corpusConstants'

export interface Book {
  id: string
  code: string
  title: string
  author: string
  collection: BookCollection
  year: number | null
  chapter_count: number
  paragraph_count: number
}

export interface Chapter {
  id: number
  book_id: string
  number: number
  title: string
}

export interface Paragraph {
  id: number
  book_id: string
  chapter_id: number
  chapter_num: number
  page_num: number
  para_num: number
  reference: string
  text: string
}

export interface SearchResult {
  id: number
  book_id: string
  book_title: string
  book_code: string
  book_author: string
  collection: BookCollection
  chapter_num: number
  chapter_title: string
  para_num: number
  reference: string
  text: string
  snippet: string
  rank: number
}

export interface ReadingPosition {
  bookId: string
  chapterNum: number
  paragraphId: number
  updatedAt: number
}

export interface Bookmark {
  id: string
  paragraphId: number
  reference: string
  text: string
  note: string
  createdAt: number
}

export interface Highlight {
  id: string
  paragraphId: number
  reference: string
  text: string
  startOffset: number
  endOffset: number
  color: string
  note: string
  createdAt: number
}

export type View = 'search' | 'library' | 'reader' | 'bookmarks'

export type ReaderTheme = 'light' | 'sepia' | 'dark'
export type FontSize = 'sm' | 'md' | 'lg' | 'xl'
export type LineHeight = 'normal' | 'relaxed' | 'loose'

export interface ReaderSettings {
  theme: ReaderTheme
  fontSize: FontSize
  lineHeight: LineHeight
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'light',
  fontSize: 'md',
  lineHeight: 'relaxed',
}

export interface ParsedReference {
  code: string
  page: number
  para: number
}

export interface ReaderTarget {
  bookId: string
  chapterNum: number
  paragraphId?: number
}
