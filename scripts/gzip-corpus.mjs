import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB = join(__dirname, '../public/corpus/egw.sqlite')
const OUT = `${DB}.gz`

if (!existsSync(DB)) {
  console.error('Missing public/corpus/egw.sqlite — run: npm run corpus:build')
  process.exit(1)
}

const raw = readFileSync(DB)
const gz = gzipSync(raw, { level: 9 })
writeFileSync(OUT, gz)
console.log(`Corpus: ${(raw.length / 1024 / 1024).toFixed(1)} MB → ${(gz.length / 1024 / 1024).toFixed(1)} MB gz`)

// On deploy hosts, ship gzip only to stay under size limits
if (process.env.VERCEL || process.env.CI) {
  unlinkSync(DB)
  console.log('Removed uncompressed sqlite (deploy bundle uses .gz only)')
}
