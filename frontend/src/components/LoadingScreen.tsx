import { Loader2 } from 'lucide-react'

/** Pantalla de carga a pantalla completa (evita mostrar brevemente otras vistas). */
export function LoadingScreen({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-500" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {text}
      </div>
    </div>
  )
}

export function ErrorScreen({
  title = 'No se pudo cargar',
  message,
  onRetry,
  onSignOut,
}: {
  title?: string
  message: string
  onRetry?: () => void
  onSignOut?: () => void
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-5">
      <div className="surface w-full max-w-md p-6 text-center" role="alert">
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          {onRetry && (
            <button onClick={onRetry} className="btn-primary !px-4 !py-2 text-sm">
              Reintentar
            </button>
          )}
          {onSignOut && (
            <button onClick={onSignOut} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cerrar sesión
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
