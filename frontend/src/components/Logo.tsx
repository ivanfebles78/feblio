interface LogoProps {
  size?: number
  withText?: boolean
  tone?: 'brand' | 'white'
}

/**
 * Isotipo Feblio: una "F" de trazos tipo circuito con nodos, en degradado azul → verde azulado.
 * El degradado es de tono medio a propósito: se lee igual de bien sobre fondo claro y oscuro.
 */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="fbGrad" x1="52" y1="10" x2="12" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f6bff" />
          <stop offset="0.55" stopColor="#23a7dd" />
          <stop offset="1" stopColor="#17c79a" />
        </linearGradient>
      </defs>
      <g stroke="url(#fbGrad)" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round">
        {/* Cinta posterior, desplazada: da profundidad de "doble trazo" */}
        <g opacity="0.22" transform="translate(3.6 3.6)">
          <path d="M20 13 H48" />
          <path d="M20 13 V44 L14 52" />
          <path d="M20 30 H42" />
        </g>
        {/* F principal */}
        <path d="M20 13 H48" />
        <path d="M20 13 V44 L14 52" />
        <path d="M20 30 H42" />
      </g>
      {/* Nodos: disco con centro claro (efecto anillo) */}
      <g>
        <circle cx="48" cy="13" r="6" fill="url(#fbGrad)" />
        <circle cx="42" cy="30" r="5.5" fill="url(#fbGrad)" />
        <circle cx="14" cy="52" r="6" fill="url(#fbGrad)" />
        <circle cx="48" cy="13" r="2.3" fill="#fff" opacity="0.92" />
        <circle cx="42" cy="30" r="2.1" fill="#fff" opacity="0.92" />
        <circle cx="14" cy="52" r="2.3" fill="#fff" opacity="0.92" />
      </g>
    </svg>
  )
}

export function Logo({ size = 34, withText = true, tone = 'brand' }: LogoProps) {
  const text = tone === 'white' ? 'text-white' : 'text-[#0f2344]'
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      {withText && (
        <span
          className={`font-extrabold tracking-tight ${text}`}
          style={{ fontFamily: "'Poppins', 'Inter', system-ui, sans-serif", fontSize: `${(size / 34) * 1.4}rem`, letterSpacing: '-0.01em' }}
        >
          Feblio
        </span>
      )}
    </span>
  )
}
