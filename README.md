# EGW Writings — Local-First PWA

Offline-capable Progressive Web App for reading and searching Ellen G. White's writings. Search runs in the browser via SQLite FTS5; bookmarks and reading position stay on your device.

## Features

- **140+ books** from the official [EGW Writings API](https://a.egwwritings.org)
- **Instant FTS5 search** with phrase matching and book filters
- **Reference lookup** (e.g. `AA 9.1`, `PP 155.1`)
- **Reader** with highlights, bookmarks, themes, and chapter navigation
- **Installable PWA** for iPhone and desktop

## Local development

```bash
npm install
```

Create `.env` at the project root (register at [cpanel.egwwritings.org](https://cpanel.egwwritings.org/applications/create)):

```bash
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
```

```bash
npm run corpus:build:egw        # Ellen G. White only (~2 min)
npm run corpus:build:pioneers   # Pioneer library (~30+ min, optional)
npm run corpus:optimize         # v4 -> v5: compress text, slim the index
npm run corpus:verify           # parity gate; must report zero failures
npm run dev
```

On first launch the app installs **EGW writings** into OPFS, then downloads the **pioneer library** in the background. Pioneer works are clearly labeled — they are **not** by Ellen G. White.

Open the URL shown (use LAN IP for iPhone on same Wi‑Fi).

## Corpus artifacts

`corpus:build:*` fetches the raw corpus from the EGW API into `egw.sqlite` and
`pioneers.sqlite`. `corpus:optimize` turns those into the `*.v5.sqlite` files the
app actually serves: text stored as zstd chunks against a shared dictionary,
FTS5 made contentless, and references reduced to per-chapter templates.

| | Raw | v5 |
|---|---|---|
| EGW | 161.4 MB | **69.1 MB** |
| Pioneers | 483.8 MB | **197.6 MB** |

`corpus:optimize` takes about a minute for EGW and 18 for Pioneers, single-threaded.
**Run it locally, never in CI or on device.** Both raw and v5 files are gitignored.

## Deploy (Vercel)

The corpus is a **prebuilt artifact**, not built during deploy. `pioneers.v5.sqlite`
is ~198MB — past GitHub's 100MB per-file limit — so the artifacts live in
Cloudflare R2 rather than the repo.

**One time, whenever the corpus is rebuilt:**

```bash
npm run corpus:optimize
npm run corpus:verify     # must print "All parity checks passed."
npm run corpus:upload     # pushes the two .v5.sqlite files to R2
```

Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`
in `.env` first. The bucket needs public reads and this CORS policy:

```json
[
  {
    "AllowedOrigins": ["https://your-app.vercel.app", "http://localhost:5173"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

**Per deploy:**

1. Push to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Set `VITE_CORPUS_BASE_URL` to the bucket's public URL (e.g. `https://pub-xxxx.r2.dev`)
4. Deploy — builds in seconds, since it only compiles the app

Leave `VITE_CORPUS_BASE_URL` unset locally to serve the corpus from `public/corpus`.

## Architecture

All corpus access runs in a worker (`src/db/corpus.worker.ts`) over OPFS, because
`createSyncAccessHandle` does not exist on the main thread. SQLite pages from disk
against a 16MB cache rather than loading the corpus into memory, so RAM stays flat
regardless of corpus size — a budget Android and a flagship behave the same.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run corpus:build` | Fetch EGW Writings API → SQLite, then optimize |
| `npm run corpus:optimize` | Raw corpus → compressed v5 artifacts |
| `npm run corpus:verify` | Verify v5 matches the source exactly |
| `npm run corpus:upload` | Publish v5 artifacts to Cloudflare R2 |
| `npm run build` | Production build (app only) |
| `npm test` | Unit tests |
| `npm run test:e2e` | Playwright browser tests |
| `npm run preview` | Preview production build |

## Tech

Vite · React 19 · TypeScript · Tailwind CSS 4 · sqlite-wasm (OPFS SAHPool) FTS5 · zstd · Comlink · vite-plugin-pwa · idb

## License

App code: MIT. Writings are public domain (Ellen G. White / EGW Writings).
