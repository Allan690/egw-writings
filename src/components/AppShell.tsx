import type { ReactNode } from 'react'
import type { View } from '../types'
import { IconBookmark, IconLibrary, IconSearch, IconSettings } from './Icons'

interface Props {
  view: View
  onNavigate: (view: View) => void
  onOpenPalette: () => void
  onOpenSettings: () => void
  children: ReactNode
  /** Reader takes the full screen — no chrome. */
  hideChrome?: boolean
  bookCount: number
  pioneerStatus: string
}

const NAV: { id: Exclude<View, 'reader'>; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'search', label: 'Search' },
  { id: 'saved', label: 'Saved' },
]

function NavIcon({ id, active }: { id: Exclude<View, 'reader'>; active: boolean }) {
  // Fill, not just colour — active state must survive colour-blindness.
  if (id === 'library') return <IconLibrary filled={active} />
  if (id === 'search') return <IconSearch />
  return <IconBookmark filled={active} />
}

export function AppShell({
  view,
  onNavigate,
  onOpenPalette,
  onOpenSettings,
  children,
  hideChrome,
  bookCount,
  pioneerStatus,
}: Props) {
  if (hideChrome) return <>{children}</>

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--bg)] md:flex-row">
      {/* Desktop rail */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:sticky md:top-0 md:flex md:h-screen md:self-start">
        <div className="px-4 pb-3 pt-5">
          <p className="font-serif text-[15px] font-semibold leading-none text-[var(--text)]">
            EGW Writings
          </p>
          <p className="cite mt-1.5">THE WRITINGS, OFFLINE</p>
        </div>

        <button
          type="button"
          onClick={onOpenPalette}
          className="mx-3 mb-3 flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-left text-[var(--t-small)] text-[var(--text-3)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-2)]"
        >
          <IconSearch className="h-4 w-4" />
          <span className="flex-1">Jump to…</span>
          <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[10px] text-[var(--text-3)]">
            ⌘K
          </kbd>
        </button>

        <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
          {NAV.map(({ id, label }) => {
            const active = view === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={active ? 'page' : undefined}
                className="flex items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-[var(--t-base)] transition-colors"
                style={{
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-2)',
                  fontWeight: active ? 600 : 500,
                }}
              >
                <NavIcon id={id} active={active} />
                {label}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto px-3 pb-4">
          <button
            type="button"
            onClick={onOpenSettings}
            className="mb-2 flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-[var(--t-base)] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)]"
          >
            <IconSettings />
            Settings
          </button>
          <LocalStatus bookCount={bookCount} pioneerStatus={pioneerStatus} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-10">
          {children}
        </main>

        {/* Mobile tab bar */}
        <nav
          className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
          aria-label="Main"
        >
          <div className="flex">
            {NAV.map(({ id, label }) => {
              const active = view === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate(id)}
                  aria-current={active ? 'page' : undefined}
                  className="flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors"
                  style={{ color: active ? 'var(--accent)' : 'var(--text-3)' }}
                >
                  <NavIcon id={id} active={active} />
                  {label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium text-[var(--text-3)]"
            >
              <IconSettings />
              Settings
            </button>
          </div>
        </nav>
      </div>
    </div>
  )
}

/**
 * Ambient proof that the app is local-first, rather than a claim in a subtitle.
 */
function LocalStatus({
  bookCount,
  pioneerStatus,
}: {
  bookCount: number
  pioneerStatus: string
}) {
  const downloading = pioneerStatus === 'loading' || pioneerStatus === 'checking'
  return (
    <div className="rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: downloading ? 'var(--cite)' : 'var(--accent)' }}
        />
        <span className="text-[var(--t-micro)] font-medium text-[var(--text-2)]">
          {downloading ? 'Adding pioneers…' : 'Offline ready'}
        </span>
      </div>
      <p className="cite mt-1" style={{ color: 'var(--text-3)' }}>
        {bookCount > 0 ? `${bookCount} BOOKS ON DEVICE` : 'ON THIS DEVICE'}
      </p>
    </div>
  )
}
