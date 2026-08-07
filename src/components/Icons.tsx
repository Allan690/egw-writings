/** Merge fixed icon dimensions with optional extra classes. Custom className must not replace size. */
function cx(base: string, className?: string) {
  return className ? `${base} ${className}` : base
}

export function IconLibrary({ className }: { className?: string }) {
  return (
    <svg className={cx('h-5 w-5 shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
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
