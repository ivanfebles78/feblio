import { useState, type ReactNode } from 'react'
import { ChevronDown, LogOut, Mail, ShieldCheck } from 'lucide-react'
import { Logo } from './Logo'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABEL, type UserRole } from '../lib/types'

export interface NavItem {
  label: string
  icon: string
}

const ROLE_TONE: Record<UserRole, string> = {
  admin: 'from-slate-800 to-slate-900',
  empresa: 'from-brand-700 to-brand-900',
  cliente: 'from-teal-700 to-teal-900',
}

export function DashboardLayout({
  role,
  nav,
  active,
  onNavigate,
  children,
}: {
  role: UserRole
  nav: NavItem[]
  active: string
  onNavigate: (label: string) => void
  children: ReactNode
}) {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const initials = (profile?.full_name ?? profile?.email ?? '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-gradient-to-b ${ROLE_TONE[role]} text-white transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center px-5">
          <Logo tone="white" size={30} />
        </div>
        <nav className="mt-2 space-y-1 px-3">
          {nav.map((item) => {
            const isActive = item.label === active
            return (
              <button
                key={item.label}
                onClick={() => {
                  onNavigate(item.label)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </nav>
        <div className="absolute inset-x-3 bottom-4">
          <div className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white/70">
            <p className="font-semibold text-white">{ROLE_LABEL[role]}</p>
            <p className="truncate">{profile?.email}</p>
          </div>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-20 bg-slate-900/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Abrir menú"
            >
              ☰
            </button>
            <h1 className="text-base font-semibold text-slate-800">{active}</h1>
          </div>
          {/* Menú de cuenta */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5 transition hover:border-brand-300 hover:shadow-sm"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-indigo-600 text-sm font-bold text-white">
                {initials}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold leading-tight text-slate-800">
                  {profile?.full_name}
                </span>
                <span className="block text-xs leading-tight text-slate-400">
                  {ROLE_LABEL[role]}
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-slate-400 transition ${menuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-64 origin-top-right overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-float">
                  <div className="bg-gradient-to-br from-brand-600 to-indigo-700 p-4 text-white">
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/20 text-base font-bold">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{profile?.full_name}</p>
                        <p className="truncate text-xs text-brand-100">{profile?.email}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 p-2 text-sm">
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-600">
                      <ShieldCheck className="h-4 w-4 text-brand-500" />
                      <span>Rol:</span>
                      <span className="ml-auto font-medium text-slate-800">
                        {ROLE_LABEL[role]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-600">
                      <Mail className="h-4 w-4 text-brand-500" />
                      <span className="truncate">{profile?.email}</span>
                    </div>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      onClick={signOut}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 font-medium text-red-600 transition hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" /> Cerrar sesión
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
