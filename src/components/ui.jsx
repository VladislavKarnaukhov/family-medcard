import { useEffect, useState } from 'react'
import { STATUS_TEXT } from '../lib/format'
import { Icon } from './icons'

export const go = (path) => {
  window.location.hash = '#/' + path
}

export function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [parts, setParts] = useState(read)
  useEffect(() => {
    const on = () => {
      setParts(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return parts
}

// Плоская поверхность без вложенности: белая, тонкая рамка, мягкая тень.
export function Card({ className = '', children, ...p }) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-5 shadow-card ${className}`} {...p}>
      {children}
    </section>
  )
}

const BTN = {
  primary: 'bg-accent text-white hover:bg-[#233069] active:bg-[#1c2755] shadow-sm',
  soft: 'bg-accent-soft text-accent-dark hover:bg-[#d6dcf1]',
  ghost: 'border border-line-strong bg-card text-ink hover:bg-paper',
  danger: 'border border-[#e2b9b5] bg-card text-alert hover:bg-alert-soft',
  quiet: 'text-accent-dark hover:bg-accent-soft',
}

export function Button({ variant = 'primary', big, icon, className = '', children, ...p }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-11 ${
        big ? 'min-h-14 w-full text-lg lg:min-h-12' : ''
      } ${BTN[variant]} ${className}`}
      {...p}
    >
      {icon && <Icon name={icon} size={19} />}
      {children}
    </button>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-sm text-muted">{hint}</span>}
    </label>
  )
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <header className="mb-6">
      {back && (
        <a href={back.href} className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-accent-dark hover:underline">
          <Icon name="chevL" size={16} />
          {back.label}
        </a>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] lg:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-[60ch] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex w-full flex-wrap gap-3 sm:w-auto">{actions}</div>}
      </div>
    </header>
  )
}

// Заголовок раздела; под ним строка-стёжка вместо рамки.
export function H({ children, right, className = '', plain = false }) {
  return (
    <div className={`mb-3 mt-9 first:mt-0 ${className}`}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl">{children}</h2>
        {right}
      </div>
      {!plain && <div className="stitch-h mt-2.5" aria-hidden />}
    </div>
  )
}

export function StatusBadge({ status }) {
  if (status !== 'low' && status !== 'high') return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-alert-soft px-2.5 py-0.5 text-sm font-medium text-alert">
      <Icon name={status === 'low' ? 'arrowDown' : 'arrowUp'} size={14} />
      {STATUS_TEXT[status]}
    </span>
  )
}

export function Chip({ tone = 'accent', children, className = '' }) {
  const tones = {
    accent: 'bg-accent-soft text-accent-dark',
    alert: 'bg-alert-soft text-alert',
    quiet: 'bg-paper text-muted ring-1 ring-line',
    solid: 'bg-accent text-white',
    outline: 'bg-white text-accent-dark ring-1 ring-accent-mid',
  }
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ${tones[tone]} ${className}`}>{children}</span>
}

export function Avatar({ name = '?', size = 40, tone = 'soft', className = '' }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const tones = { soft: 'bg-accent-soft text-accent-dark', solid: 'bg-accent text-white', rail: 'bg-[#33418a] text-white' }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${tones[tone]} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

export function Empty({ children, icon = 'file', action }) {
  return (
    <div className="stitch-border flex flex-col items-center gap-3 rounded-2xl px-6 py-9 text-center text-muted">
      <Icon name={icon} size={26} className="text-accent-mid" />
      <p className="max-w-[44ch]">{children}</p>
      {action}
    </div>
  )
}

export function Notice({ tone = 'info', children, className = '' }) {
  const tones = { info: 'bg-accent-soft text-ink', alert: 'bg-alert-soft text-ink', quiet: 'bg-card ring-1 ring-line text-ink' }
  return <div className={`rounded-xl px-4 py-3 text-[0.95rem] ${tones[tone]} ${className}`}>{children}</div>
}

export function ErrorText({ children }) {
  if (!children) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-alert-soft px-4 py-3 text-[0.95rem] text-alert">
      <Icon name="alert" size={18} className="mt-0.5" />
      {children}
    </p>
  )
}

export function Spinner() {
  return <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-accent-soft border-t-accent" role="status" aria-label="Загрузка" />
}

export function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="!mt-0.5 !h-6 !min-h-0 !w-6 shrink-0 !rounded-md" />
      <span className="text-[0.95rem]">{children}</span>
    </label>
  )
}

export function Tabs({ value, onChange, items, className = '' }) {
  return (
    <div className={`-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0 ${className}`} role="tablist">
      {items.map(([k, label, n]) => (
        <button
          key={k}
          role="tab"
          aria-selected={value === k}
          onClick={() => onChange(k)}
          className={`min-h-11 shrink-0 rounded-full px-4 text-[0.95rem] font-medium transition-colors ${
            value === k ? 'bg-accent text-white' : 'border border-line-strong bg-card text-ink hover:bg-paper'
          }`}
        >
          {label}
          {n ? <span className={`ml-1.5 ${value === k ? 'text-white/75' : 'text-muted'}`}>{n}</span> : null}
        </button>
      ))}
    </div>
  )
}
