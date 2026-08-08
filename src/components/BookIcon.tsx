import { bookCoverColor } from '../lib/bookStyle'

interface Props {
  code: string
  size?: 'sm' | 'md'
}

const sizes = {
  sm: { box: 'h-10 w-[1.75rem]', text: 'text-[8px]' },
  md: { box: 'h-14 w-[2.25rem]', text: 'text-[9px]' },
}

/**
 * A book spine rather than a rounded app tile — these are volumes on a shelf,
 * and the code stamped down the spine is how you find one.
 */
export function BookIcon({ code, size = 'md' }: Props) {
  const { box, text } = sizes[size]
  const color = bookCoverColor(code)

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-[2px] ${box}`}
      style={{
        background: color,
        boxShadow: `inset -3px 0 5px -3px rgba(0,0,0,0.5), inset 2px 0 0 rgba(255,255,255,0.13)`,
      }}
      aria-hidden
    >
      {/* Gilt rules, as stamped on publisher's cloth. */}
      <span
        className="absolute inset-x-[3px] top-1.5 h-px"
        style={{ background: 'rgba(214,183,122,0.5)' }}
      />
      <span
        className="absolute inset-x-[3px] bottom-1.5 h-px"
        style={{ background: 'rgba(214,183,122,0.5)' }}
      />
      <span
        className={`font-mono font-bold uppercase tracking-tight ${text}`}
        style={{ color: 'rgba(238,226,201,0.95)' }}
      >
        {code.slice(0, 4)}
      </span>
    </div>
  )
}
