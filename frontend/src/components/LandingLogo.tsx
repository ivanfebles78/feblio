/**
 * Logo Feblio para cabeceras grandes (landing, hero del login). Imagen con dos variantes:
 * `brand` (palabra azul marino) para fondos claros; `white` (palabra en blanco, icono a color)
 * para fondos oscuros. El ancho es fijo y responsive; la altura se ajusta sola.
 */
export function LandingLogo({ tone = 'brand' }: { tone?: 'brand' | 'white' }) {
  const src = `${import.meta.env.BASE_URL}feblio-logo${tone === 'white' ? '-white' : ''}.png`
  return (
    <img
      src={src}
      alt="Feblio"
      className="block h-auto w-44 max-w-full shrink-0 select-none sm:w-52"
      draggable={false}
    />
  )
}
