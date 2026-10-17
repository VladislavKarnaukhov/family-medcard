import { useEffect, useState } from 'react'
import { STATUS_TEXT } from '../lib/format'

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

export function Card({ className = '', children, ...p }) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-4 ${className}`} {...p}>
      {children}
    </section>
  )
}

const BTN = {
  primary: 'bg-accent text-white hover:bg-accent-dark',
  soft: 'bg-accent-soft text-accent-dark hover:bg-[#d3e8e2]',
  ghost: 'border border-line bg-card text-ink hover:bg-paper',
  danger: 'border border-line bg-card text-alert hover:bg-alert-soft',
}

export function Button({ variant = 'primary', big, className = '', ...p }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-medium transition-colors disabled:opacity-50 ${
        big ? 'min-h-16 w-full text-lg' : ''
      } ${BTN[variant]} ${className}`}
      {...p}
    />
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  )
}

export function H({ children, right }) {
  return (
    <div className="mb-2 mt-6 flex items-end justify-between gap-3">
      <h2 className="text-xl font-semibold">{children}</h2>
      {right}
    </div>
  )
}

export function StatusBadge({ status }) {
  if (status !== 'low' && status !== 'high') return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-alert-soft px-2.5 py-0.5 text-sm font-medium text-alert">
      {status === 'low' ? '↓' : '↑'} {STATUS_TEXT[status]}
    </span>
  )
}

export function Empty({ children }) {
  return <p className="rounded-2xl border border-dashed border-line p-5 text-center text-muted">{children}</p>
}
