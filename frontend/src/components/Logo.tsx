interface LogoProps {
  size?: number
  withText?: boolean
  tone?: 'brand' | 'white'
}

/** Isotipo Feblio: "F" de cintas plegadas en tres tonos de azul. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="fbTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id="fbMid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="fbStem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
      {/* Brazo superior (cinta plegada) */}
      <path d="M14 10 L54 10 L44 22 L24 22 Z" fill="url(#fbTop)" />
      <path d="M24 22 L44 22 L40 30 L24 30 Z" fill="#1e40af" opacity="0.55" />
      {/* Brazo central */}
      <path d="M24 30 L48 30 L38 42 L24 42 Z" fill="url(#fbMid)" />
      <path d="M24 42 L38 42 L34 48 L24 48 Z" fill="#1e40af" opacity="0.5" />
      {/* Tallo vertical */}
      <path d="M14 10 L24 22 L24 54 L14 54 Z" fill="url(#fbStem)" />
    </svg>
  )
}

export function Logo({ size = 34, withText = true, tone = 'brand' }: LogoProps) {
  const text = tone === 'white' ? 'text-white' : 'text-slate-900'
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      {withText && (
        <span className={`text-[1.4rem] font-extrabold tracking-tight ${text}`}>
          Feblio
        </span>
      )}
    </span>
  )
}
