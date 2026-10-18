import { fmtNum, refText } from '../lib/format'

// Полоса значения: где значение относительно диапазона лаборатории. Цвет только у значения вне диапазона.
export function RangeBar({ value, low, high, unit = '', status, index = 0, className = '' }) {
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
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" />
      <div className="absolute top-1/2 h-1.5 -translate-y-1/2" style={{ left: `${from}%`, width: `${Math.max(2, to - from)}%` }}>
        <div className="sweep-in h-full w-full rounded-full bg-accent-mid" style={{ '--i': index }} />
      </div>
      <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos(value)}%` }}>
        <div className={`marker-in h-full w-full rounded-full border-2 border-white ${out ? 'bg-alert' : 'bg-accent-dark'}`} style={{ '--i': index, boxShadow: '0 1px 3px rgba(60,44,20,0.35)' }} />
      </div>
    </div>
  )
}
