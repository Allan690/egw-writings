import 'dotenv/config'

const AUTH_BASE = process.env.EGW_AUTH_BASE_URL ?? 'https://cpanel.egwwritings.org'
const API_BASE = process.env.EGW_API_BASE_URL ?? 'https://a.egwwritings.org'
const REQUEST_DELAY_MS = Number(process.env.EGW_REQUEST_DELAY_MS ?? 300)

export interface EgwCredentials {
  clientId: string
  clientSecret: string
}

export interface EgwToken {
  accessToken: string
  expiresAt: number
}

export interface EgwLanguage {
  code: string
  name: string
  book_count: number
}

export interface EgwFolder {
  folder_id: number
  name: string
  nbooks: number
  children?: EgwFolder[]
}

export interface EgwBook {
  book_id: number
  code: string
  lang: string
  title: string
  author: string
  pub_year: string | null
  npages: number
  folder_id: number
  description?: string
}

export interface EgwTocEntry {
  para_id: string
  level: number
  title: string
  refcode_short: string
  puborder: number
}

export interface EgwParagraph {
  para_id: string
  refcode: string
  refcode_short: string
  text: string
  level?: number
}

export interface EgwChapter {
  book_id: number
  para_id: string
  title: string
  refcode_short: string
  paragraphs: EgwParagraph[]
}

export function loadCredentials(): EgwCredentials {
  const clientId = process.env.EGW_CLIENT_ID ?? process.env.CLIENT_ID
  const clientSecret = process.env.EGW_CLIENT_SECRET ?? process.env.CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Set EGW_CLIENT_ID and EGW_CLIENT_SECRET (or CLIENT_ID / CLIENT_SECRET) in .env')
  }
  return { clientId, clientSecret }
}

async function fetchToken(creds: EgwCredentials): Promise<EgwToken> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: process.env.EGW_SCOPE ?? 'writings search',
  })

  const res = await fetch(`${AUTH_BASE}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    throw new Error(`EGW auth failed (${res.status}): ${await res.text()}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

export class EgwApiClient {
  private token: EgwToken | null = null

  constructor(private creds: EgwCredentials) {}

  private async ensureToken(): Promise<string> {
    if (!this.token || Date.now() >= this.token.expiresAt - 60_000) {
      this.token = await fetchToken(this.creds)
    }
    return this.token.accessToken
  }

  private async delay() {
    if (REQUEST_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS))
    }
  }

  async get<T>(path: string): Promise<T> {
    const token = await this.ensureToken()
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`EGW API ${path} failed (${res.status}): ${(await res.text()).slice(0, 400)}`)
    }

    await this.delay()
    return (await res.json()) as T
  }

  getLanguages() {
    return this.get<EgwLanguage[]>('/content/languages')
  }

  getFolders(lang: string) {
    return this.get<EgwFolder[]>(`/content/languages/${lang}/folders`)
  }

  getBooksByFolder(folderId: number) {
    return this.get<EgwBook[]>(`/content/books/by_folder/${folderId}`)
  }

  getBook(bookId: number) {
    return this.get<EgwBook>(`/content/books/${bookId}`)
  }

  getBookToc(bookId: number) {
    return this.get<EgwTocEntry[]>(`/content/books/${bookId}/toc`)
  }

  getChapter(bookId: number, chapterId: string | number) {
    return this.get<EgwChapter>(`/content/books/${bookId}/chapter/${chapterId}`)
  }

  getParagraph(bookId: number, paragraphId: string) {
    return this.get<EgwParagraph>(`/content/books/${bookId}/content/${paragraphId}`)
  }

  async downloadBookZip(bookId: number): Promise<ArrayBuffer> {
    const token = await this.ensureToken()
    const res = await fetch(`${API_BASE}/content/books/${bookId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      throw new Error(
        `EGW download /content/books/${bookId}/download failed (${res.status}): ${(await res.text()).slice(0, 400)}`,
      )
    }

    await this.delay()
    return res.arrayBuffer()
  }
}

export async function createEgwClient() {
  return new EgwApiClient(loadCredentials())
}

export function findFolder(folders: EgwFolder[], name: string): EgwFolder | null {
  for (const folder of folders) {
    if (folder.name === name) return folder
    if (folder.children?.length) {
      const found = findFolder(folder.children, name)
      if (found) return found
    }
  }
  return null
}

export function bookIdFromCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function parseParaId(paraId: string): { page: number; para: number } | null {
  const parts = paraId.split('.')
  if (parts.length !== 2) return null
  const page = Number.parseInt(parts[1]!, 10)
  if (!Number.isFinite(page)) return null
  return { page, para: page }
}

export function parseRefcodeShort(ref: string): { page: number; para: number } | null {
  const match = ref.trim().match(/^[A-Za-z0-9]+\s+(\d+)(?:\.(\d+))?/)
  if (!match) return null
  return {
    page: Number.parseInt(match[1]!, 10),
    para: match[2] ? Number.parseInt(match[2], 10) : 1,
  }
}

export interface ParsedChapter {
  number: number
  title: string
  startParaId: string
  refcodeShort: string
}

export function chaptersFromToc(toc: EgwTocEntry[]): ParsedChapter[] {
  const chapters: ParsedChapter[] = []
  let chapterNum = 0

  for (const entry of toc) {
    if (entry.level <= 0) continue
    const isChapter =
      entry.level === 1 ||
      /^chapter\s/i.test(entry.title) ||
      entry.refcode_short.includes('.')
    if (!isChapter && chapters.length === 0) {
      chapterNum++
      chapters.push({
        number: chapterNum,
        title: entry.title,
        startParaId: entry.para_id,
        refcodeShort: entry.refcode_short,
      })
      continue
    }
    if (entry.level === 1 || /^chapter\s/i.test(entry.title)) {
      chapterNum++
      chapters.push({
        number: chapterNum,
        title: entry.title,
        startParaId: entry.para_id,
        refcodeShort: entry.refcode_short,
      })
    }
  }

  return chapters
}

export const EGW_SOURCE = 'EGW Writings API (a.egwwritings.org) — English Books & Devotionals'
export const PIONEER_SOURCE = 'EGW Writings API — Adventist Pioneer Library'

export interface PioneerBook extends EgwBook {
  authorLabel: string
}

export function collectFoldersWithBooks(folders: EgwFolder[]): EgwFolder[] {
  const out: EgwFolder[] = []
  for (const folder of folders) {
    if (folder.nbooks > 0 && !folder.children?.length) out.push(folder)
    if (folder.children?.length) out.push(...collectFoldersWithBooks(folder.children))
  }
  return out
}

export async function fetchPioneerCatalog(
  client: EgwApiClient,
  sectionNames = (process.env.PIONEER_SECTIONS ?? 'Pioneer Authors,Periodicals').split(',').map((s) => s.trim()),
): Promise<PioneerBook[]> {
  const folders = await client.getFolders('en')
  const apl = findFolder(folders, 'Adventist Pioneer Library')
  if (!apl?.children?.length) {
    throw new Error('Adventist Pioneer Library folder not found in API')
  }

  const books: PioneerBook[] = []
  const seen = new Set<number>()

  for (const sectionName of sectionNames) {
    const section = apl.children.find((c) => c.name === sectionName)
    if (!section) {
      console.warn(`Pioneer section not found: ${sectionName}`)
      continue
    }

    const leafFolders = collectFoldersWithBooks([section])
    console.log(`${sectionName}: ${leafFolders.length} author/title folders`)

    for (const leaf of leafFolders) {
      const list = await client.getBooksByFolder(leaf.folder_id)
      for (const book of list) {
        if (seen.has(book.book_id)) continue
        seen.add(book.book_id)
        books.push({
          ...book,
          authorLabel: book.author?.trim() || leaf.name,
        })
      }
    }
  }

  return books.sort((a, b) => a.title.localeCompare(b.title))
}
