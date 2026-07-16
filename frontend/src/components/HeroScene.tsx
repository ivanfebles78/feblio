import { HeroMockup } from './HeroMockup'
import { Logo } from './Logo'
import { ReceiptEuro, Users, FolderOpen } from 'lucide-react'

const PILLS = [
  { icon: ReceiptEuro, label: 'Presupuestos y facturas' },
  { icon: Users, label: 'Clientes' },
  { icon: FolderOpen, label: 'Documentos' },
]

/** Panel visual protagonista: cielo, plano de obra, edificios y grúa,
 *  con el dashboard del producto flotando encima. */
export function HeroScene() {
  return (
    <div className="blueprint relative flex min-h-[46vh] flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-50 via-sky-50 to-white p-8 lg:min-h-screen lg:p-12">
      {/* Glows */}
      <div className="animate-glow pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-300/40 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-200/50 blur-3xl" />

      {/* Skyline + grúa (line-art arquitectónico) */}
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-64 w-full text-brand-300/70"
        viewBox="0 0 800 260"
        fill="none"
        stroke="currentColor"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
      >
        {/* edificios */}
        <g strokeWidth="1.4">
          <rect x="40" y="120" width="90" height="140" />
          <rect x="150" y="70" width="70" height="190" />
          <rect x="240" y="150" width="110" height="110" />
          <rect x="600" y="100" width="80" height="160" />
          <rect x="700" y="150" width="70" height="110" />
          {/* ventanas */}
          {[60, 84, 108].map((x) =>
            [140, 165, 190, 215].map((y) => (
              <rect key={`${x}-${y}`} x={x} y={y} width="12" height="12" />
            )),
          )}
          {[165, 190].map((x) =>
            [90, 115, 140, 165, 190, 215].map((y) => (
              <rect key={`b-${x}-${y}`} x={x} y={y} width="12" height="12" />
            )),
          )}
        </g>
        {/* grúa */}
        <g strokeWidth="1.6" className="text-brand-400">
          <path d="M470 260V40M470 40h190M470 60h150M470 40l-40 20h80z" />
          <path d="M590 40v30" />
          <path d="M455 260h30" />
        </g>
      </svg>

      {/* Cabecera: logo + título/subtítulo pequeños */}
      <div className="relative z-10">
        <Logo size={34} />
        <h1 className="mt-6 max-w-sm text-2xl font-bold leading-tight tracking-tight text-slate-900">
          Gestiona tus proyectos de principio a fin
        </h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          Proyectos, presupuestos, facturas y clientes. Todo en un solo lugar.
        </p>
      </div>

      {/* Producto flotando */}
      <div className="animate-floaty relative z-10 mx-auto my-8 w-full max-w-xl">
        <HeroMockup />
      </div>

      {/* Pills */}
      <div className="relative z-10 flex flex-wrap gap-2">
        {PILLS.map((p) => (
          <span
            key={p.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 backdrop-blur"
          >
            <p.icon className="h-3.5 w-3.5 text-brand-600" />
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}
