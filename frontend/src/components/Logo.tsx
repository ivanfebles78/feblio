interface LogoProps {
  size?: number
  withText?: boolean
  tone?: 'brand' | 'white'
}

export function Logo({ size = 34, withText = true, tone = 'brand' }: LogoProps) {
  const text = tone === 'white' ? 'text-white' : 'text-slate-900'
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="11" fill="#2563eb" />
        <path d="M18 13h14v5h-9v5h8v5h-8v9h-5V13z" fill="#fff" />
        <path d="M30 13h4l-4 5v-5z" fill="#93bbfd" />
      </svg>
      {withText && (
        <span className={`text-[1.35rem] font-extrabold tracking-tight ${text}`}>
          Feblio
        </span>
      )}
    </span>
  )
}
