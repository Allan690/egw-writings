export interface ParsedParagraph {
  bookId: string
  chapterNum: number
  chapterTitle: string
  pageNum: number
  paraNum: number
  text: string
  reference: string
}

const CHAPTER_HEADER_RE = /^\s*Chapter\s+(\d+)\.?\s*$/im

function normalizeText(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim()
}

function cleanLine(line: string): string {
  return line.replace(/^\s{2,}/, '').trim()
}

function splitParagraphs(body: string): string[] {
  const lines = body.split('\n')
  const paragraphs: string[] = []
  let current: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (current.length) {
        paragraphs.push(current.join(' ').replace(/\s+/g, ' ').trim())
        current = []
      }
      continue
    }

    // Skip verse-like indented poetry blocks as part of paragraph flow
    current.push(cleanLine(line))
  }

  if (current.length) {
    paragraphs.push(current.join(' ').replace(/\s+/g, ' ').trim())
  }

  return paragraphs.filter((p) => p.length > 30)
}

export function parseCcelBook(
  bookId: string,
  bookCode: string,
  raw: string,
): ParsedParagraph[] {
  const text = normalizeText(raw)
  const paragraphs: ParsedParagraph[] = []

  const chapterMatches = [...text.matchAll(/^\s*Chapter\s+(\d+)\.?\s*$/gim)]
  if (chapterMatches.length === 0) {
    console.warn(`  No chapters found in ${bookId}`)
    return []
  }

  for (let i = 0; i < chapterMatches.length; i++) {
    const match = chapterMatches[i]!
    const chapterNum = Number.parseInt(match[1]!, 10)
    const start = match.index! + match[0].length
    const end =
      i + 1 < chapterMatches.length
        ? chapterMatches[i + 1]!.index!
        : text.length

    const block = text.slice(start, end).trim()
    const blockLines = block.split('\n')

    // First non-empty line(s) before body are the chapter title
    let titleLines: string[] = []
    let bodyStart = 0
    for (let j = 0; j < blockLines.length; j++) {
      const line = blockLines[j]!.trim()
      if (!line) {
        if (titleLines.length) {
          bodyStart = j + 1
          break
        }
        continue
      }
      if (titleLines.length === 0 || (titleLines.length < 3 && line.length < 80 && !line.endsWith('.'))) {
        titleLines.push(cleanLine(blockLines[j]!))
        bodyStart = j + 1
      } else {
        bodyStart = j
        break
      }
    }

    const chapterTitle = titleLines.join(' ').trim() || `Chapter ${chapterNum}`
    const body = blockLines.slice(bodyStart).join('\n')
    const paras = splitParagraphs(body)

    paras.forEach((paraText, idx) => {
      const paraNum = idx + 1
      paragraphs.push({
        bookId,
        chapterNum,
        chapterTitle,
        pageNum: chapterNum,
        paraNum,
        text: paraText,
        reference: `${bookCode} ${chapterNum}.${paraNum}`,
      })
    })
  }

  return paragraphs
}
