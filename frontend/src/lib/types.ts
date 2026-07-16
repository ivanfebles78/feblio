export type UserRole = 'admin' | 'empresa' | 'cliente'

export type ProjectStatus = 'borrador' | 'en_progreso' | 'completado' | 'cancelado'

export type DocumentType =
  | 'presupuesto'
  | 'provision'
  | 'factura'
  | 'contrato'
  | 'otro'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  empresa_id: string | null
  cliente_id: string | null
}

export interface Empresa {
  id: string
  name: string
  cif: string | null
  tax_type: string | null
  logo_url: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  iban: string | null
  disclosures: string | null
  created_at: string
}

export interface Template {
  id: string
  empresa_id: string
  type: DocumentType
  name: string
  content: Record<string, unknown>
  is_default: boolean
  created_at: string
}

export interface ClientIntake {
  id: string
  empresa_id: string
  token: string
  status: 'pendiente' | 'completado'
  client_email: string | null
  submitted: Record<string, unknown> | null
  cliente_id: string | null
  created_at: string
  completed_at: string | null
}

export const TEMPLATE_TABS: { type: DocumentType; label: string }[] = [
  { type: 'presupuesto', label: 'Presupuestos' },
  { type: 'provision', label: 'Provisiones de fondos' },
  { type: 'factura', label: 'Facturas' },
]

export interface Cliente {
  id: string
  empresa_id: string
  name: string
  email: string | null
  phone: string | null
  created_at: string
}

export interface Project {
  id: string
  empresa_id: string
  cliente_id: string | null
  name: string
  status: ProjectStatus
  budget_total: number
  invoiced: number
  provision_funds: number
  pending_payments: number
  progress: number
  created_at: string
}

export interface DocumentRow {
  id: string
  empresa_id: string
  project_id: string | null
  type: DocumentType
  name: string
  amount: number | null
  status: string | null
  created_at: string
}

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrador',
  empresa: 'Empresa',
  cliente: 'Cliente',
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  borrador: 'Borrador',
  en_progreso: 'En progreso',
  completado: 'Completado',
  cancelado: 'Cancelado',
}

export function formatEUR(n: number | null | undefined): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n ?? 0)
}
