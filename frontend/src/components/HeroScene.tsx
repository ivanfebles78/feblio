import { HeroMockup } from './HeroMockup'
import { Logo } from './Logo'
import { FileText, Users, BarChart3, Check } from 'lucide-react'

/** Anillo de iconos orbitando. */
function OrbitRing() {
  const bubble =
    'orbit-item grid h-11 w-11 place-items-center rounded-full bg-white text-brand-600 shadow-lg ring-1 ring-white/40'
  return (
    <div className="relative h-56 w-56">
      <svg viewBox="0 0 224 224" className="absolute inset-0 h-full w-full text-white/40">
        <circle
          cx="112"
          cy="112"
          r="96"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 7"
        />
      </svg>
      <div className="orbit absolute inset-0">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
          <span className={bubble}>
            <FileText className="h-5 w-5" />
          </span>
        </div>
        <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <span className={bubble}>
            <Users className="h-5 w-5" />
          </span>
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2">
          <span className={bubble}>
            <BarChart3 className="h-5 w-5" />
          </span>
        </div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
          <span className="orbit-item grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-emerald-400 text-white shadow-lg">
            <Check className="h-5 w-5" />
          </span>
        </div>
      </div>
    </div>
  )
}

/** Skyline de obra al fondo (line-art claro sobre panel oscuro). */
function Skyline() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-0 h-72 w-full text-white/20"
      viewBox="0 0 900 300"
      fill="none"
      stroke="currentColor"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <g strokeWidth="1.4">
        <rect x="40" y="150" width="90" height="150" />
        <rect x="150" y="90" width="70" height="210" />
        <rect x="240" y="180" width="120" height="120" />
        <rect x="690" y="120" width="90" height="180" />
        <rect x="800" y="170" width="70" height="130" />
        {[60, 86, 112].map((x) =>
          [170, 200, 230, 260].map((y) => (
            <rect key={`a-${x}-${y}`} x={x} y={y} width="12" height="14" />
          )),
        )}
        {[165, 192].map((x) =>
          [110, 140, 170, 200, 230, 260].map((y) => (
            <rect key={`b-${x}-${y}`} x={x} y={y} width="12" height="14" />
          )),
        )}
      </g>
      <g strokeWidth="1.6" className="text-cyan-300/60">
        <path d="M470 300V50M470 50h210M470 74h170M470 50l-46 24h92z" />
        <path d="M620 50v34" />
      </g>
    </svg>
  )
}

/** Panel visual protagonista: gradiente vibrante de alto contraste. */
export function HeroScene() {
  return (
    <div className="relative flex min-h-[52vh] flex-col overflow-hidden bg-gradient-to-br from-brand-700 via-indigo-700 to-violet-800 p-8 lg:min-h-screen lg:p-12">
      {/* Rejilla + glows de color */}
      <div className="blueprint absolute inset-0 opacity-[0.15]" />
      <div className="animate-glow pointer-events-none absolute -left-16 top-16 h-72 w-72 rounded-full bg-cyan-400/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 top-1/3 h-80 w-80 rounded-full bg-fuchsia-500/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-brand-400/40 blur-3xl" />
      <Skyline />

      {/* Cabecera: logo + título/subtítulo pequeños */}
      <div className="relative z-10">
        <Logo size={38} tone="white" />
        <h1 className="mt-6 max-w-md text-2xl font-bold leading-tight tracking-tight text-white">
          Gestiona tus proyectos de principio a fin
        </h1>
        <p className="mt-2 max-w-sm text-sm text-brand-100">
          Proyectos, presupuestos, facturas, provisiones y clientes. Todo en un solo
          lugar.
        </p>
      </div>

      {/* Composición: órbita + monitor */}
      <div className="relative z-10 mt-auto flex flex-1 items-center justify-center py-8">
        <div className="hidden lg:block lg:-mr-16 lg:shrink-0">
          <OrbitRing />
        </div>

        <div className="animate-floaty w-full max-w-xl">
          <div className="rounded-2xl bg-slate-900/90 p-2.5 shadow-[0_50px_90px_-25px_rgba(0,0,0,.6)] ring-1 ring-white/10">
            <div className="overflow-hidden rounded-lg">
              <HeroMockup />
            </div>
          </div>
          <div className="mx-auto mt-1 h-4 w-24 rounded-b-lg bg-slate-900/80" />
          <div className="mx-auto h-1.5 w-40 rounded-full bg-white/30" />
        </div>
      </div>

      {/* Pills de color */}
      <div className="relative z-10 flex flex-wrap gap-2">
        {[
          { label: 'Presupuestos', tone: 'bg-cyan-400/20 text-cyan-100 ring-cyan-300/30' },
          { label: 'Facturas', tone: 'bg-fuchsia-400/20 text-fuchsia-100 ring-fuchsia-300/30' },
          { label: 'Clientes', tone: 'bg-emerald-400/20 text-emerald-100 ring-emerald-300/30' },
          { label: 'Documentos', tone: 'bg-amber-400/20 text-amber-100 ring-amber-300/30' },
        ].map((p) => (
          <span
            key={p.label}
            className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${p.tone}`}
          >
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}
