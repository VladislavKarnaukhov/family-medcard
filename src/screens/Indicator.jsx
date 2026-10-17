import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Dot } from 'recharts'
import { Card, Empty, H, StatusBadge, go } from '../components/ui'
import { indicatorKeys, labelFor, seriesFor } from '../lib/data'
import { getIndicator } from '../lib/indicators'
import { fmtDate, fmtNum, fmtShort, refText } from '../lib/format'

const ACCENT = '#2f7d6d'
const ALERT = '#b8443a'
const DAY = 86400000

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-xl border border-line bg-white p-3 text-sm shadow">
      <div className="font-semibold">
        {fmtNum(p.value)} {p.unit}
      </div>
      <div className="text-muted">{fmtDate(p.date)}</div>
      <div className="text-muted">{p.lab}</div>
      <div className="text-muted">Диапазон лаборатории: {refText(p.refLow, p.refHigh)}</div>
      {p.converted && (
        <div className="text-muted">
          Пересчитано из {fmtNum(p.origValue)} {p.origUnit}
        </div>
      )}
    </div>
  )
}

export default function Indicator({ state, profile, keyName }) {
  if (!profile) return <Empty>Сначала создайте профиль.</Empty>
  const keys = indicatorKeys(state, profile.id)
  const series = seriesFor(state, profile.id, keyName)
  if (!series.length) {
    return (
      <div className="py-4">
        <Empty>Для этого показателя нет данных у профиля «{profile.name}».</Empty>
      </div>
    )
  }

  const ind = getIndicator(keyName)
  const label = labelFor(state, keyName, series)
  const unit = series[series.length - 1].unit
  const last = series[series.length - 1]

  const nums = series.flatMap((p) => [p.value, p.refLow, p.refHigh]).filter((v) => v != null)
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.12
  const yMin = lo - pad
  const yMax = hi + pad
  const data = series.map((p) => ({
    ...p,
    band: p.refLow == null && p.refHigh == null ? null : [p.refLow ?? yMin, p.refHigh ?? yMax],
  }))
  const t0 = series[0].t
  const t1 = series[series.length - 1].t
  const span = t1 === t0 ? 15 * DAY : 0

  const converted = series.filter((p) => p.converted)
  const labs = [...new Set(series.map((p) => p.lab))]
  const idx = keys.indexOf(keyName)

  return (
    <div className="py-4">
      <button onClick={() => go('indicators')} className="mb-2 min-h-10 text-accent-dark underline underline-offset-2">
        ← Все показатели
      </button>
      <h1 className="text-2xl font-semibold">{label}</h1>
      {ind?.abbr && <p className="text-muted">{ind.abbr}</p>}

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
        <span className="text-3xl font-semibold">
          {fmtNum(last.value)} <span className="text-lg font-normal text-muted">{unit}</span>
        </span>
        <span className="text-muted">{fmtDate(last.date)}</span>
      </div>
      <div className="mt-1 text-muted">Диапазон лаборатории: {refText(last.refLow, last.refHigh)}</div>
      <div className="mt-2">
        <StatusBadge status={last.status} />
      </div>

      <Card className="mt-4 !px-2">
        <div className="h-64" role="img" aria-label={`График: ${label}, значений ${series.length}`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#eee9e0" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={[t0 - span, t1 + span]}
                tickFormatter={fmtShort}
                tick={{ fontSize: 12, fill: '#6b665e' }}
                tickCount={4}
              />
              <YAxis
                domain={[yMin, yMax]}
                tickFormatter={(v) => fmtNum(Number(v.toPrecision(3)))}
                tick={{ fontSize: 12, fill: '#6b665e' }}
                width={44}
                allowDataOverflow
              />
              <Tooltip content={<Tip />} />
              <Area dataKey="band" stroke="none" activeDot={false} dot={false} fill={ACCENT} fillOpacity={0.14} isAnimationActive={false} connectNulls />
              <Line
                dataKey="value"
                stroke={ACCENT}
                strokeWidth={2.5}
                isAnimationActive={false}
                dot={(p) => (
                  <Dot
                    key={p.index}
                    cx={p.cx}
                    cy={p.cy}
                    r={5}
                    fill={p.payload.status === 'low' || p.payload.status === 'high' ? ALERT : ACCENT}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                )}
                activeDot={{ r: 7 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="px-2 text-sm text-muted">
          <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: 'rgba(47,125,109,.25)' }} />
          Полоса — диапазон лаборатории на момент анализа. Красная точка — значение вне диапазона лаборатории.
        </p>
      </Card>

      {(converted.length > 0 || labs.length > 1) && (
        <p className="mt-3 rounded-xl bg-accent-soft p-3 text-sm">
          {labs.length > 1 && <>На графике данные из лабораторий: {labs.join(', ')}. </>}
          {converted.length > 0 && (
            <>
              Все значения приведены к единице «{unit}». Пересчитано значений: {converted.length} (помечены ниже).
            </>
          )}
        </p>
      )}

      <H>Что это за показатель</H>
      <Card>
        <p>{ind?.about || 'Показатель из вашего бланка. Справочного описания в приложении пока нет.'}</p>
        <p className="mt-2 text-sm text-muted">
          Справочная информация. Она не является оценкой результата — по результатам обращайтесь к врачу.
        </p>
      </Card>

      <H>Все значения</H>
      <ul className="space-y-2">
        {[...series].reverse().map((p) => (
          <li key={p.id} className="rounded-2xl border border-line bg-card p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted">{fmtDate(p.date)}</span>
              <span className={`text-lg font-semibold ${p.status === 'low' || p.status === 'high' ? 'text-alert' : ''}`}>
                {fmtNum(p.value)} <span className="text-sm font-normal text-muted">{p.unit}</span>
              </span>
            </div>
            <div className="text-sm text-muted">
              {p.lab} · диапазон лаборатории {refText(p.refLow, p.refHigh)}
            </div>
            {p.converted && (
              <div className="text-sm text-muted">
                ⇄ Пересчитано из {fmtNum(p.origValue)} {p.origUnit}
              </div>
            )}
            <StatusBadge status={p.status} />
          </li>
        ))}
      </ul>

      {keys.length > 1 && (
        <div className="mt-6 flex justify-between gap-3">
          <button className="min-h-12 text-accent-dark underline underline-offset-2" onClick={() => go('indicator/' + encodeURIComponent(keys[(idx - 1 + keys.length) % keys.length]))}>
            ← Предыдущий
          </button>
          <button className="min-h-12 text-accent-dark underline underline-offset-2" onClick={() => go('indicator/' + encodeURIComponent(keys[(idx + 1) % keys.length]))}>
            Следующий →
          </button>
        </div>
      )}
    </div>
  )
}
