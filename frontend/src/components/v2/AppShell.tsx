import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bell, ChevronRight, HelpCircle, Menu, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Logo } from '../Logo'
import { LanguageSwitcher } from '../LanguageSwitcher'

/**
 * Estructura de aplicación v2: sidebar claro y sobrio + topbar con migas, ayuda,
 * notificaciones y usuario. Navegación completa por teclado; el cajón móvil
 * atrapa el foco de forma sencilla (Escape cierra) y anuncia su estado.
 */
export interface ShellNavItem {
  key: string
  label: string
  icon: ReactNode
  badge?: string
}

export interface ShellUser {
  name: string
  email: string
  company: string
  initials: string
  /** Texto bajo el nombre de la empresa en el pie del sidebar (p. ej. plan o rol). */
  subtitle?: string
}

export interface ShellMenuItem {
  key: string
  label: string
  icon?: ReactNode
  onSelect: () => void
}

export interface AppShellProps {
  nav: ShellNavItem[]
  active: string
  onNavigate: (key: string) => void
  breadcrumbs: string[]
  user: ShellUser
  notifications?: number
  /** Entradas del menú de usuario (cuenta, configuración, cerrar sesión…). */
  menu?: ShellMenuItem[]
  /** Acción del botón de ayuda; si falta, el botón no se muestra. */
  onHelp?: () => void
  /** Sustituye la campana básica por un panel de notificaciones real (p. ej. <NotificationsBell />). */
  bell?: ReactNode
  children: ReactNode
}

export function AppShell({ nav, active, onNavigate, breadcrumbs, user, notifications = 0, menu = [], onHelp, bell, children }: AppShellProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        setMenuOpen(false)
      }
    }
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [])

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo size={28} />
        <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden" aria-label={t('common.actions.closeMenu')}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label={t('common.nav.main')}>
        {nav.map((item) => {
          const isActive = item.key === active
          return (
            <button
              key={item.key}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                onNavigate(item.key)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className={isActive ? 'text-brand-700' : 'text-slate-500'} aria-hidden="true">
                {item.icon}
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200" aria-label={t('dashboard.shell.badgePending', { badge: item.badge })}>
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white" aria-hidden="true">
            {user.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{user.company}</p>
            {user.subtitle && <p className="truncate text-xs text-slate-500">{user.subtitle}</p>}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Sidebar escritorio */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>

      {/* Cajón móvil */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t('dashboard.shell.navDialog')}>
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button type="button" onClick={() => setOpen(true)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden" aria-label={t('common.actions.openMenu')} aria-expanded={open}>
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <nav aria-label={t('common.nav.breadcrumbs')} className="min-w-0 flex-1">
              <ol className="flex items-center gap-1 text-sm">
                {breadcrumbs.map((b, i) => {
                  const last = i === breadcrumbs.length - 1
                  return (
                    <li key={b} className={`min-w-0 items-center gap-1 ${last ? 'flex' : 'hidden sm:flex'}`}>
                      {i > 0 && <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" aria-hidden="true" />}
                      <span className={`truncate ${last ? 'font-semibold text-slate-900' : 'text-slate-500'}`} aria-current={last ? 'page' : undefined}>
                        {b}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </nav>
            <div className="flex shrink-0 items-center gap-1">
              <LanguageSwitcher className="mr-1" />
              {onHelp && (
                <button type="button" onClick={onHelp} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={t('common.actions.help')}>
                  <HelpCircle className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
              {bell ?? (
                <button type="button" className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={notifications ? t('common.a11y.notificationsUnread', { count: notifications }) : t('common.a11y.notifications')}>
                  <Bell className="h-5 w-5" aria-hidden="true" />
                  {notifications > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-white" aria-hidden="true" />}
                </button>
              )}
              <div className="relative ml-1" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white" aria-hidden="true">
                    {user.initials}
                  </span>
                  <span className="hidden text-sm font-medium text-slate-800 md:inline">{user.name}</span>
                </button>
                {menuOpen && (
                  <div role="menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <div className="border-b border-slate-100 px-3 py-2">
                      <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                    </div>
                    {menu.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false)
                          m.onSelect()
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                      >
                        {m.icon && (
                          <span className="text-slate-500" aria-hidden="true">
                            {m.icon}
                          </span>
                        )}
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
