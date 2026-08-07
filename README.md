# EGW Writings — Local-First PWA

Offline-capable Progressive Web App for reading and searching Ellen G. White's writings. Search runs in the browser via SQLite FTS5; bookmarks and reading position stay on your device.

## Features

- **117 books** from [Internet Archive](https://archive.org/details/ellen-g.-white-books)
- **Instant FTS5 search** with phrase matching and book filters
- **Reference lookup** (e.g. `PP 155.1`)
- **Reader** with highlights, bookmarks, themes, and chapter navigation
- **Installable PWA** for iPhone and desktop

## Local development

```bash
npm install
npm run corpus:build    # ~2 min, downloads & indexes writings
npm run dev
```

Open the URL shown (use LAN IP for iPhone on same Wi‑Fi).

## Deploy (Vercel)

The corpus (~130 MB) is **built during deploy**, not stored in git.

1. Push this repo to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Framework preset: **Vite** (or use included `vercel.json`)
4. Deploy — first build takes ~3–5 minutes (corpus download + index + gzip)

Or with CLI:

```bash
npx vercel --prod
```

The deploy bundle ships a **gzip-compressed** corpus (~52 MB). The browser decompresses it on first load.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run corpus:build` | Fetch Archive.org texts → SQLite FTS5 index |
| `npm run build` | Production build (requires corpus locally) |
| `npm run preview` | Preview production build |

## Tech

Vite · React 19 · TypeScript · Tailwind CSS 4 · sql.js FTS5 · vite-plugin-pwa · idb

## License

App code: MIT. Writings are public domain (Ellen G. White / Archive.org sources).
