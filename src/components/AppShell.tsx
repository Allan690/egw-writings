import type { ReactNode } from 'react'
import type { View } from '../types'
import { IconBookmark, IconLibrary, IconSearch } from './Icons'

interface Props {
  view: View
  onNavigate: (view: View) => void
  children: ReactNode
  /** Reader takes the full screen — no chrome */
  hideChrome?: boolean
}

const NAV: { id: View; label: string; icon: ReactNode }[] = [
  { id: 'library', label: 'Library', icon: <IconLibrary className="h-5 w-5" /> },
  { id: 'search', label: 'Search', icon: <IconSearch className="h-5 w-5" /> },
  { id: 'bookmarks', label: 'Saved', icon: <IconBookmark className="h-5 w-5" /> },
]

export function AppShell({ view, onNavigate, children, hideChrome }: Props) {
  if (hideChrome) {
    return <div className="min-h-[100dvh] bg-[var(--bg)]">{children}</div>
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--bg)] md:min-h-screen md:flex-row">
      {/* Desktop side nav — sticky while page scrolls */}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:sticky md:top-0 md:flex md:h-screen md:self-start">
        <div className="px-5 pt-6 pb-4">
          <p className="font-serif text-lg font-semibold text-[var(--text)]">EGW Writings</p>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">Offline · Local-first</p>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                view === id
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-2)] hover:bg-[var(--surface-2)]'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:self-start">
        <main className="min-w-0 flex-1 overflow-x-hidden px-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-8">
          {children}
        </main>

        {/* Mobile bottom nav — fixed; main padding keeps content above it */}
        <nav
          className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:hidden"
          aria-label="Main"
        >
          <div className="flex">
            {NAV.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                  view === id ? 'text-[var(--accent)]' : 'text-[var(--text-3)]'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
