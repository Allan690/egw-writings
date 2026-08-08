import 'dotenv/config'
import { createReadStream, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'

/**
 * Uploads the prebuilt corpus artifacts to Cloudflare R2.
 *
 * The corpora are built once by `npm run corpus:optimize` and never rebuilt in
 * CI or on device. pioneers.v5.sqlite is ~198MB, past GitHub's 100MB per-file
 * limit, so the artifacts live in object storage rather than the repo.
 *
 * Required environment (see .env.example):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *
 * The bucket must allow public reads and send permissive CORS headers; see
 * the deploy section of README.md.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const CORPUS_DIR = join(__dirname, '../public/corpus')

const FILES = ['egw.v5.sqlite', 'pioneers.v5.sqlite']

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing ${name}. See .env.example.`)
    process.exit(1)
  }
  return v
}

const accountId = requireEnv('R2_ACCOUNT_ID')
const bucket = requireEnv('R2_BUCKET')

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
  },
})

for (const name of FILES) {
  const path = join(CORPUS_DIR, name)
  let size: number
  try {
    size = statSync(path).size
  } catch {
    console.error(`Missing ${path}. Run: npm run corpus:optimize`)
    process.exit(1)
  }

  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: basename(name),
      Body: createReadStream(path),
      ContentType: 'application/vnd.sqlite3',
      // Artifacts are content-addressed by name; a rebuild changes the name or
      // is republished deliberately, so a long cache is safe.
      CacheControl: 'public, max-age=31536000, immutable',
    },
    // 198MB needs multipart; lib-storage handles the split automatically.
    partSize: 16 * 1024 * 1024,
    queueSize: 4,
  })

  let lastPct = -1
  upload.on('httpUploadProgress', (p) => {
    const pct = Math.floor(((p.loaded ?? 0) / size) * 100)
    if (pct !== lastPct && pct % 5 === 0) {
      lastPct = pct
      process.stderr.write(`\r${name}: ${pct}%`)
    }
  })

  await upload.done()
  process.stderr.write(`\r${name}: done (${(size / 1048576).toFixed(1)} MB)\n`)
}

console.log('\nUploaded. Set VITE_CORPUS_BASE_URL to your bucket public URL in Vercel.')
