import { fmtNum, refText } from '../lib/format'

// Полоса значения: где значение относительно диапазона лаборатории. Цвет только у значения вне диапазона.
export function RangeBar({ value, low, high, unit = '', status, className = '' }) {
  if (low == null && high == null) return null
  const known = [low, high].filter((v) => v != null)
  const span = known.length === 2 ? high - low : Math.abs(known[0]) || 1
  let min = Math.min(low ?? high - span, value) - span * 0.35
  let max = Math.max(high ?? low + span, value) + span * 0.35
  if (low != null && low >= 0 && min < 0) min = 0
  const pos = (v) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))
  const from = low == null ? 0 : pos(low)
  const to = high == null ? 100 : pos(high)
  const out = status === 'low' || status === 'high'
  const word = status === 'low' ? 'ниже диапазона' : status === 'high' ? 'выше диапазона' : 'в диапазоне'
  return (
    <div
      role="img"
      aria-label={`Значение ${fmtNum(value)} ${unit}, диапазон лаборатории ${refText(low, high)}, ${word}`}
      className={`relative h-5 ${className}`}
    >
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-md bg-line" />
      <div className="absolute top-1/2 h-[5px] -translate-y-1/2 rounded-md bg-accent-mid" style={{ left: `${from}%`, width: `${Math.max(2, to - from)}%` }} />
      <div
        className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-white ${out ? 'bg-alert' : 'bg-accent-dark'}`}
        style={{ left: `${pos(value)}%`, boxShadow: '0 0 0 1px rgba(60,48,28,0.25)' }}
      />
    </div>
  )
}
