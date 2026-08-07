import type { ParsedParagraph } from './parse-ccel'

const REF_MARKER_RE = /\s+[A-Z]{1,5}\d?[A-Z]?\s+\d+\.\d+\.?\s*$/
const REF_INLINE_RE = /([A-Z]{1,5}\d?[A-Z]?)\s+(\d+)\.(\d+)\.?/g
const PAGE_NUMBER_RE = /^\d{1,4}$/
const FOOTNOTE_ONLY_RE = /^[A-Z]{1,5}\d?[A-Z]?\s+\d+\.\d+\.?$/

function normalizeText(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').replace(/\ufeff/g, '')
}

function isNoiseLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (PAGE_NUMBER_RE.test(t)) return true
  if (FOOTNOTE_ONLY_RE.test(t)) return true
  if (/^Table of Contents$/i.test(t)) return true
  if (/^Preface$/i.test(t)) return true
  if (/^Introduction$/i.test(t)) return true
  if (/^\*+$/.test(t)) return true
  return false
}

function findContentStart(text: string): number {
  const re = /^Chapter\s+\d+\s*[—\-–]/gim
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    const start = match.index
    const afterHeader = text.slice(start + match[0].length, start + match[0].length + 1200)
    const nextChapter = afterHeader.search(/^Chapter\s+\d+\s*[—\-–]/im)
    const chunk =
      nextChapter >= 0 ? afterHeader.slice(0, nextChapter) : afterHeader

    const prose = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !isNoiseLine(l))
      .join(' ')

    if (prose.length > 120 && /[a-z]/.test(prose)) {
      return start
    }
  }

  return 0
}

function cleanParagraphText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Split on official EGW page.paragraph markers (e.g. LP 21.1), which delimit real paragraphs. */
function splitByEgwMarkers(
  body: string,
  bookCode: string,
): Array<{ text: string; reference: string; page: number; para: number }> {
  const normalized = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !isNoiseLine(l))
    .join(' ')

  if (!normalized) return []

  const expected = bookCode.toUpperCase()
  const results: Array<{ text: string; reference: string; page: number; para: number }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  REF_INLINE_RE.lastIndex = 0
  while ((match = REF_INLINE_RE.exec(normalized)) !== null) {
    const code = match[1]!.toUpperCase()
    if (code !== expected) continue

    const text = cleanParagraphText(normalized.slice(lastIndex, match.index))
    const page = Number.parseInt(match[2]!, 10)
    const para = Number.parseInt(match[3]!, 10)
    const reference = `${match[1]} ${match[2]}.${match[3]}`

    if (text.length > 20) {
      results.push({ text, reference, page, para })
    } else if (text.length > 0 && results.length > 0) {
      const prev = results[results.length - 1]!
      prev.text = cleanParagraphText(`${prev.text} ${text}`)
    }

    lastIndex = match.index + match[0].length
  }

  const tail = cleanParagraphText(normalized.slice(lastIndex))
  if (tail.length > 40) {
    results.push({
      text: tail,
      reference: `${bookCode} ?.?`,
      page: 0,
      para: results.length + 1,
    })
  }

  return results.filter((p) => p.text.length > 20 && !p.reference.includes('?.?'))
}

const SECTION_HEADER_RE = /^[A-Z0-9][A-Za-z0-9\s,'\-—–():/]+$/

function isSectionHeader(line: string): boolean {
  const t = line.trim()
  if (t.length < 5 || t.length > 72) return false
  if (t.endsWith('.')) return false
  if (/^Table of Contents$/i.test(t)) return false
  if (/^Preface$/i.test(t)) return false
  if (PAGE_NUMBER_RE.test(t)) return false
  return SECTION_HEADER_RE.test(t)
}

function parseFallbackSections(
  bookId: string,
  bookCode: string,
  raw: string,
): ParsedParagraph[] {
  const byMarkers = splitByEgwMarkers(normalizeText(raw), bookCode)
  if (byMarkers.length > 0) {
    return byMarkers.map((p, idx) => ({
      bookId,
      chapterNum: p.page || 1,
      chapterTitle: `Section ${p.page || idx + 1}`,
      pageNum: p.page || idx + 1,
      paraNum: p.para || idx + 1,
      text: p.text,
      reference: p.reference,
    }))
  }

  const text = normalizeText(raw)
  const lines = text.split('\n')
  const paragraphs: ParsedParagraph[] = []
  let chapterNum = 1
  let chapterTitle = 'Introduction'
  let current: string[] = []
  let seenProse = false

  const flushParagraph = () => {
    if (!current.length) return
    const joined = cleanParagraphText(current.join(' '))
    current = []
    if (joined.length <= 40) return
    seenProse = true
    const paraNum =
      paragraphs.filter((p) => p.chapterNum === chapterNum).length + 1
    paragraphs.push({
      bookId,
      chapterNum,
      chapterTitle,
      pageNum: chapterNum,
      paraNum,
      text: joined,
      reference: `${bookCode} ${chapterNum}.${paraNum}`,
    })
  }

  const startSection = (title: string) => {
    flushParagraph()
    chapterNum += 1
    chapterTitle = title
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (!trimmed) {
      flushParagraph()
      continue
    }
    if (isNoiseLine(trimmed)) continue

    const prevBlank = i === 0 || !lines[i - 1]!.trim()
    const nextBlank = i + 1 >= lines.length || !lines[i + 1]!.trim()
    if (prevBlank && nextBlank && isSectionHeader(trimmed) && seenProse) {
      startSection(trimmed)
      continue
    }

    current.push(trimmed)
  }

  flushParagraph()
  return paragraphs
}

export function parseArchiveDjvu(
  bookId: string,
  bookCode: string,
  raw: string,
): ParsedParagraph[] {
  const chapterParsed = parseArchiveDjvuChapters(bookId, bookCode, raw)
  if (chapterParsed.length > 0) return chapterParsed
  return parseFallbackSections(bookId, bookCode, raw)
}

function parseArchiveDjvuChapters(
  bookId: string,
  bookCode: string,
  raw: string,
): ParsedParagraph[] {
  const text = normalizeText(raw)
  const contentStart = findContentStart(text)
  const body = text.slice(contentStart)

  const chapterMatches = [...body.matchAll(/^Chapter\s+(\d+)\s*[—\-–]\s*(.+?)\s*$/gim)]
  if (chapterMatches.length === 0) {
    console.warn(`  No chapters found in ${bookId}`)
    return []
  }

  const paragraphs: ParsedParagraph[] = []

  for (let i = 0; i < chapterMatches.length; i++) {
    const match = chapterMatches[i]!
    const sectionNum = Number.parseInt(match[1]!, 10)
    const chapterTitle = match[2]!.trim()
    const start = match.index! + match[0].length
    const end =
      i + 1 < chapterMatches.length
        ? chapterMatches[i + 1]!.index!
        : body.length

    const chapterBody = body.slice(start, end)
    const paras = splitByEgwMarkers(chapterBody, bookCode)

    if (paras.length === 0) continue

    paras.forEach((p) => {
      paragraphs.push({
        bookId,
        chapterNum: sectionNum,
        chapterTitle,
        pageNum: p.page,
        paraNum: p.para,
        text: p.text,
        reference: p.reference,
      })
    })
  }

  return paragraphs
}
