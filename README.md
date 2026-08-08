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
npm run corpus:gzip             # compress for deploy
npm run dev
```

On first launch the app loads **EGW writings immediately**, then downloads the **pioneer library** in the background (if `pioneers.sqlite.gz` is deployed). Pioneer works are clearly labeled — they are **not** by Ellen G. White.

Open the URL shown (use LAN IP for iPhone on same Wi‑Fi).

## Deploy (Vercel)

The corpus is **built during deploy**, not stored in git.

1. Push this repo to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add environment variables: `CLIENT_ID`, `CLIENT_SECRET`
4. Deploy — first build takes ~5–10 minutes (API download + index + gzip)

Or with CLI:

```bash
npx vercel --prod
```

The deploy bundle ships a **gzip-compressed** corpus. The browser decompresses it on first load, then everything runs offline.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run corpus:build` | Fetch EGW Writings API → SQLite FTS5 index |
| `npm run build` | Production build (requires corpus locally) |
| `npm run preview` | Preview production build |

## Tech

Vite · React 19 · TypeScript · Tailwind CSS 4 · sql.js FTS5 · vite-plugin-pwa · idb

## License

App code: MIT. Writings are public domain (Ellen G. White / EGW Writings).
