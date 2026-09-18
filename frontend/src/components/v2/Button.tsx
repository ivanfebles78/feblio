import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Botón del sistema visual v2 (SaaS B2B sobrio).
 * - primary: acción principal (azul Feblio). Solo uno por vista.
 * - secondary: borde + superficie blanca.
 * - ghost: texto, para acciones terciarias («Continuar después»).
 * Foco visible con anillo de 2 px (WCAG 2.2 · 2.4.11).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800',
  secondary: 'border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 active:bg-slate-100',
  ghost: 'text-slate-700 hover:bg-slate-100 active:bg-slate-200',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra = ''): string {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]} ${extra}`
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  leading?: ReactNode
  trailing?: ReactNode
  block?: boolean
}

export function Button({ variant = 'primary', size = 'md', leading, trailing, block, className = '', children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, `${block ? 'w-full' : ''} ${className}`)} {...rest}>
      {leading}
      {children}
      {trailing}
    </button>
  )
}

export interface ButtonLinkProps {
  to: string
  variant?: ButtonVariant
  size?: ButtonSize
  leading?: ReactNode
  trailing?: ReactNode
  block?: boolean
  className?: string
  children: ReactNode
}

/** Enlace con apariencia de botón (navegación, no acción). */
export function ButtonLink({ to, variant = 'primary', size = 'md', leading, trailing, block, className = '', children }: ButtonLinkProps) {
  return (
    <Link to={to} className={buttonClass(variant, size, `${block ? 'w-full' : ''} ${className}`)}>
      {leading}
      {children}
      {trailing}
    </Link>
  )
}
