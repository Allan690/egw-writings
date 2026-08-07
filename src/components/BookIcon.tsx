import { bookCoverColor } from '../lib/bookStyle'

interface Props {
  code: string
  size?: 'sm' | 'md'
}

const sizes = {
  sm: 'h-9 w-9 text-[11px] rounded-lg',
  md: 'h-11 w-11 text-xs rounded-lg',
}

export function BookIcon({ code, size = 'md' }: Props) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center font-semibold text-white ${sizes[size]}`}
      style={{ backgroundColor: bookCoverColor(code) }}
      aria-hidden
    >
      {code.slice(0, 2).toUpperCase()}
    </div>
  )
}
