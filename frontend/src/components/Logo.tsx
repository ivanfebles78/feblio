interface LogoProps {
  size?: number
  withText?: boolean
  tone?: 'brand' | 'white'
}

/**
 * Isotipo Feblio: "F" de trazos tipo circuito con nodos (degradado azul → verde azulado).
 * Se usa solo como respaldo cuando se pide el logo sin texto; el logo completo es una imagen.
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
        <g opacity="0.22" transform="translate(3.6 3.6)">
          <path d="M20 13 H48" />
          <path d="M20 13 V44 L14 52" />
          <path d="M20 30 H42" />
        </g>
        <path d="M20 13 H48" />
        <path d="M20 13 V44 L14 52" />
        <path d="M20 30 H42" />
      </g>
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

/**
 * Logo Feblio (icono + palabra), como imagen. Dos variantes para que se lea en cualquier fondo:
 * `brand` (palabra azul marino) sobre fondos claros; `white` (palabra en blanco, icono a color)
 * sobre fondos oscuros. `size` es la altura en píxeles.
 */
export function Logo({ size = 34, withText = true, tone = 'brand' }: LogoProps) {
  if (!withText) return <LogoMark size={size} />
  const src = `${import.meta.env.BASE_URL}feblio-logo${tone === 'white' ? '-white' : ''}.png`
  return <img src={src} alt="Feblio" style={{ height: size, width: 'auto' }} className="block max-w-none select-none" draggable={false} />
}
