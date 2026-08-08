/** Merge fixed icon dimensions with optional extra classes. Custom className must not replace size. */
function cx(base: string, className?: string) {
  return className ? `${base} ${className}` : base
}

export function IconLibrary({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={cx('h-5 w-5 shrink-0', className)} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M4 19V5a1 1 0 0 1 1-1h3v16H5a1 1 0 0 1-1-1Z" />
      <path d="M10 19V3h3v16h-3Z" />
      <path d="M16 19V7h3v12h-3Z" />
    </svg>
  )
}

export function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={cx('h-5 w-5 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconBookmark({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={cx('h-5 w-5 shrink-0', className)} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-3.5L6 21V4Z" />
    </svg>
  )
}

export function IconSun({ className }: { className?: string }) {
  return (
    <svg className={cx('h-5 w-5 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
    </svg>
  )
}

export function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconClose({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  )
}

export function IconBooks({ className }: { className?: string }) {
  return (
    <svg className={cx('h-5 w-5 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M5 4h6v16H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M13 4h6v16h-6V4Z" />
    </svg>
  )
}

export function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={cx('h-5 w-5 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9.1 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.47-1.1 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.47 1Z" />
    </svg>
  )
}

export function IconArrowLeft({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconChevronUp({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 12.5l5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconList({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeLinecap="round" />
    </svg>
  )
}

export function IconType({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M4 7V5h16v2M9 19h6M12 5v14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconShare({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M12 15V3M8.5 6.5L12 3l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" strokeLinecap="round" />
    </svg>
  )
}

export function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M12 3v12M8.5 11.5L12 15l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1" strokeLinecap="round" />
    </svg>
  )
}

export function IconUpload({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M12 3v12M8.5 6.5L12 3l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" strokeLinecap="round" />
    </svg>
  )
}

export function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M4 7h16M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconNote({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCorner({ className }: { className?: string }) {
  return (
    <svg className={cx('h-3 w-3 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 10L4 15l5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 4v7a4 4 0 0 1-4 4H4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
