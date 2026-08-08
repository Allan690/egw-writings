import type { BookCollection } from '../lib/corpusConstants'

export interface BookRow {
  id: string
  code: string
  title: string
  author: string
  collection: BookCollection
  year: number | null
  chapter_count: number
  paragraph_count: number
}

export interface ChapterRow {
  id: number
  book_id: string
  number: number
  title: string
}

export interface ParagraphRow {
  id: number
  book_id: string
  chapter_id: number
  chapter_num: number
  page_num: number
  para_num: number
  reference: string
  text: string
}

export interface SearchHit {
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

export interface ParsedReference {
  code: string
  page: number
  para: number
}
