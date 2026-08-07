interface Props {
  title: string
  subtitle?: string
  onBack?: () => void
  action?: React.ReactNode
}

export function Header({ title, subtitle, onBack, action }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-start gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 rounded-full p-2 text-stone-600 hover:bg-stone-200/60"
            aria-label="Go back"
          >
            ←
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-xl font-semibold text-[var(--text-primary)]">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-sm text-[var(--text-muted)]">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
    </header>
  )
}
