export interface ArchiveBook {
  id: string
  code: string
  title: string
  filename: string
  url: string
  sizeBytes: number
}

const ARCHIVE_ITEM = 'ellen-g.-white-books'
const ARCHIVE_BASE = `https://archive.org/download/${ARCHIVE_ITEM}`

export function archiveDjvuUrl(filename: string): string {
  return `${ARCHIVE_BASE}/${encodeURIComponent(filename).replace(/%2F/g, '/')}`
}

export function parseArchiveFilename(filename: string): { code: string; title: string } | null {
  const match = filename.match(/^(.+?) - (.+?)_djvu\.txt$/)
  if (!match) return null
  return {
    code: match[1]!.trim(),
    title: match[2]!.trim(),
  }
}

export function bookIdFromCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

interface ArchiveMetadataFile {
  name: string
  size?: string
}

interface ArchiveMetadata {
  files: ArchiveMetadataFile[]
}

export async function fetchArchiveCatalog(): Promise<ArchiveBook[]> {
  const res = await fetch(`https://archive.org/metadata/${ARCHIVE_ITEM}`)
  if (!res.ok) throw new Error(`Archive.org metadata failed: ${res.status}`)

  const data = (await res.json()) as ArchiveMetadata
  const books: ArchiveBook[] = []

  for (const file of data.files) {
    if (!file.name.endsWith('_djvu.txt')) continue
    const parsed = parseArchiveFilename(file.name)
    if (!parsed) continue

    books.push({
      id: bookIdFromCode(parsed.code),
      code: parsed.code,
      title: parsed.title,
      filename: file.name,
      url: archiveDjvuUrl(file.name),
      sizeBytes: Number.parseInt(file.size ?? '0', 10) || 0,
    })
  }

  return books.sort((a, b) => a.title.localeCompare(b.title))
}

export const ARCHIVE_SOURCE = 'Internet Archive — ellen-g.-white-books collection'
