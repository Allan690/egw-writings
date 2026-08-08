import { unzipSync } from 'fflate'

export interface EgwBookInfo {
  book_id: number
  code: string
  title: string
  pub_year: string | null
  author: string
}

export interface EgwTocEntry {
  para_id: string
  level: number
  title: string
  refcode_short: string
  puborder: number
  dup?: string | null
}

export interface EgwContentElement {
  para_id: string
  refcode_1: string
  refcode_2: string
  refcode_3: string
  refcode_4: string
  refcode_short: string
  element_type: string
  content: string
  puborder: number
}

export interface ParsedParagraph {
  chapterNum: number
  chapterTitle: string
  pageNum: number
  paraNum: number
  reference: string
  text: string
  puborder: number
}

export interface ParsedBook {
  info: EgwBookInfo
  chapters: { number: number; title: string; paraId: string }[]
  paragraphs: ParsedParagraph[]
}

const META_FILES = new Set(['info.json', 'toc.json', 'tracks.json', 'para.json'])

function isChapterFile(name: string): boolean {
  return /^\d+\.\d+\.json$/.test(name)
}

function decodeJson<T>(raw: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(raw)) as T
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pageNumFromRef(ref2: string): number {
  return /^\d+$/.test(ref2) ? Number.parseInt(ref2, 10) : 0
}

function paraNumFromRef(ref3: string, ref4: string, fallback: number): number {
  if (ref3 && /^\d+$/.test(ref3)) return Number.parseInt(ref3, 10)
  if (ref4 && /^\d+$/.test(ref4)) return Number.parseInt(ref4, 10)
  return fallback
}

function referenceLabel(el: EgwContentElement): string {
  if (el.refcode_short?.trim()) return el.refcode_short.trim()
  const page = el.refcode_2?.trim()
  const para = el.refcode_3?.trim() || el.refcode_4?.trim()
  if (page && para) return `${el.refcode_1} ${page}.${para}`
  if (page) return `${el.refcode_1} ${page}`
  return el.refcode_1
}

function chapterTitleForPara(toc: EgwTocEntry[], paraId: string): string {
  const direct = toc.find((e) => e.para_id === paraId)
  if (direct) return direct.title

  const nested = toc.find((e) => e.dup === paraId)
  if (nested) return nested.title

  return paraId
}

function chapterPuborder(toc: EgwTocEntry[], paraId: string): number {
  const direct = toc.find((e) => e.para_id === paraId)
  if (direct) return direct.puborder

  const nested = toc.find((e) => e.dup === paraId)
  if (nested) return nested.puborder

  const first = toc.find((e) => e.para_id.startsWith(`${paraId.split('.')[0]}.`))
  return first?.puborder ?? 999_999
}

export function parseEgwBookZip(zipBuffer: ArrayBuffer): ParsedBook {
  const files = unzipSync(new Uint8Array(zipBuffer))
  const infoRaw = files['info.json']
  const tocRaw = files['toc.json']
  if (!infoRaw || !tocRaw) {
    throw new Error('ZIP missing info.json or toc.json')
  }

  const info = decodeJson<EgwBookInfo>(infoRaw)
  const toc = decodeJson<EgwTocEntry[]>(tocRaw)

  const chapterFiles = Object.keys(files)
    .filter((name) => isChapterFile(name))
    .map((name) => name.replace(/\.json$/, ''))
    .sort((a, b) => chapterPuborder(toc, a) - chapterPuborder(toc, b))

  const chapters = chapterFiles.map((paraId, index) => ({
    number: index + 1,
    title: chapterTitleForPara(toc, paraId),
    paraId,
  }))

  const paragraphs: ParsedParagraph[] = []

  for (const chapter of chapters) {
    const chapterRaw = files[`${chapter.paraId}.json`]
    if (!chapterRaw) continue

    const elements = decodeJson<EgwContentElement[]>(chapterRaw)
    let fallbackPara = 0

    for (const el of elements) {
      if (el.element_type !== 'p') continue

      const text = stripHtml(el.content)
      if (!text) continue

      fallbackPara++
      paragraphs.push({
        chapterNum: chapter.number,
        chapterTitle: chapter.title,
        pageNum: pageNumFromRef(el.refcode_2),
        paraNum: paraNumFromRef(el.refcode_3, el.refcode_4, fallbackPara),
        reference: referenceLabel(el),
        text,
        puborder: el.puborder,
      })
    }
  }

  return { info, chapters, paragraphs }
}
