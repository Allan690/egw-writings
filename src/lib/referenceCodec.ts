export interface RefTemplate {
  prefix: string
  hasPara: boolean
}

/**
 * True when `ref` ends with the decimal form of `n` AND that match starts at a
 * digit boundary. Without the boundary check, page 6 would falsely match the
 * trailing "6" of "CME 16".
 */
function endsWithNumber(ref: string, n: number): boolean {
  const s = String(n)
  if (!ref.endsWith(s)) return false
  const start = ref.length - s.length
  return start === 0 || !/\d/.test(ref[start - 1]!)
}

export function deriveTemplate(
  reference: string,
  pageNum: number,
  paraNum: number,
): RefTemplate | null {
  // Prefer the "page.para" form; it is the more specific match.
  const withPara = `${pageNum}.${paraNum}`
  if (reference.endsWith(withPara)) {
    const start = reference.length - withPara.length
    if (start === 0 || !/\d/.test(reference[start - 1]!)) {
      return { prefix: reference.slice(0, start), hasPara: true }
    }
  }
  if (endsWithNumber(reference, pageNum)) {
    return { prefix: reference.slice(0, reference.length - String(pageNum).length), hasPara: false }
  }
  return null
}

export function composeReference(t: RefTemplate, pageNum: number, paraNum: number): string {
  return t.hasPara ? `${t.prefix}${pageNum}.${paraNum}` : `${t.prefix}${pageNum}`
}
