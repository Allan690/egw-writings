/**
 * Content-shaped placeholders. A local corpus answers in milliseconds, so a
 * spinner reads as "something is wrong" — the shape of the thing arriving
 * reads as "almost there".
 */

export function ResultSkeleton() {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5 sm:grid sm:grid-cols-[5.5rem_1fr] sm:gap-3.5">
      <div className="skeleton h-3 w-16" />
      <div className="mt-2 sm:mt-0">
        <div className="skeleton h-3 w-1/2" />
        <div className="skeleton mt-2 h-2.5 w-1/3" />
        <div className="skeleton mt-3 h-3 w-full" />
        <div className="skeleton mt-1.5 h-3 w-[92%]" />
        <div className="skeleton mt-1.5 h-3 w-2/3" />
      </div>
    </div>
  )
}

export function BookRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="skeleton h-10 w-8 rounded-[3px]" />
      <div className="min-w-0 flex-1">
        <div className="skeleton h-3.5 w-2/3" />
        <div className="skeleton mt-2 h-2.5 w-1/3" />
      </div>
    </div>
  )
}

export function ChapterSkeleton() {
  const widths = ['100%', '97%', '99%', '84%', '100%', '95%', '100%', '72%']
  return (
    <div aria-hidden>
      <div className="skeleton h-2.5 w-24" />
      <div className="skeleton mt-4 h-7 w-3/4" />
      <div className="skeleton mt-2.5 h-4 w-1/2" />
      <div className="mt-9 space-y-7">
        {[0, 1, 2].map((block) => (
          <div key={block} className="space-y-2.5">
            {widths.map((w, i) => (
              <div key={i} className="skeleton h-3.5" style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
