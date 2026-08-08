import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

registerSW({ immediate: true })

// One-time eviction of the pre-OPFS corpus caches. Without this, upgraded
// installs keep the old 161MB/484MB copies alongside the new OPFS store.
if ('caches' in window) {
  void caches.keys().then((keys) =>
    Promise.all(
      keys
        .filter((k) => k === 'egw-corpus' || k === 'pioneers-corpus')
        .map((k) => caches.delete(k)),
    ),
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
