import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CORPUS_DIR = join(__dirname, '../public/corpus')

function gzipFile(name) {
  const db = join(CORPUS_DIR, name)
  const out = `${db}.gz`
  if (!existsSync(db)) return false

  const raw = readFileSync(db)
  const gz = gzipSync(raw, { level: 9 })
  writeFileSync(out, gz)
  console.log(
    `${name}: ${(raw.length / 1024 / 1024).toFixed(1)} MB → ${(gz.length / 1024 / 1024).toFixed(1)} MB gz`,
  )

  if (process.env.VERCEL || process.env.CI) {
    unlinkSync(db)
    console.log(`Removed uncompressed ${name} (deploy uses .gz)`)
  }
  return true
}

const egw = gzipFile('egw.sqlite')
if (!egw) {
  console.error('Missing public/corpus/egw.sqlite — run: npm run corpus:build:egw')
  process.exit(1)
}

const pioneers = gzipFile('pioneers.sqlite')
if (!pioneers) {
  console.log('No pioneers.sqlite — run: npm run corpus:build:pioneers (optional)')
}
