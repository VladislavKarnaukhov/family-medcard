import { Area, CartesianGrid, ComposedChart, Dot, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, Chip, Empty, H, PageHeader, StatusBadge, go } from '../components/ui'
import { Icon } from '../components/icons'
import { indicatorKeys, labelFor, seriesFor } from '../lib/data'
import { getIndicator } from '../lib/indicators'
import { fmtDate, fmtNum, fmtShort, refText } from '../lib/format'

const INK = '#26332f'
const THREAD = '#0f6b57'
const ALERT = '#b3362e'
const DAY = 86400000

// Круглые деления оси: шаг 1, 2, 2.5 или 5 на степень десяти.
function niceScale(min, max, count = 5) {
  const span = max - min || Math.abs(max) || 1
  const raw = span / (count - 1)
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(10)))
  return { lo, hi, ticks }
}

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="max-w-[16rem] rounded-xl border border-line bg-white p-3 text-sm shadow-pop">
      <p className="text-base font-semibold">
        {fmtNum(p.value)} {p.unit}
      </p>
      <p className="text-muted">{fmtDate(p.date)}</p>
      <p className="text-muted">{p.lab}</p>
      <p className="text-muted">Диапазон лаборатории: {refText(p.refLow, p.refHigh)}</p>
      {p.converted && (
        <p className="mt-1 text-muted">
          Пересчитано из {fmtNum(p.origValue)} {p.origUnit}
        </p>
      )}
    </div>
  )
}

export default function Indicator({ state, profile, keyName }) {
  if (!profile) return <Empty>Сначала создайте профиль.</Empty>
  const keys = indicatorKeys(state, profile.id)
  const series = seriesFor(state, profile.id, keyName)
  if (!series.length)
    return (
      <div>
        <PageHeader title="Показатель" back={{ href: '#/indicators', label: 'Все показатели' }} />
        <Empty icon="chart">Для этого показателя нет данных у профиля «{profile.name}».</Empty>
      </div>
    )

  const ind = getIndicator(keyName)
  const label = labelFor(state, keyName, series)
  const last = series[series.length - 1]
  const unit = last.unit

  const nums = series.flatMap((p) => [p.value, p.refLow, p.refHigh]).filter((v) => v != null)
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.08
  const { lo: yMin, hi: yMax, ticks } = niceScale(lo - pad, hi + pad)
  const data = series.map((p) => ({ ...p, band: p.refLow == null && p.refHigh == null ? null : [p.refLow ?? yMin, p.refHigh ?? yMax] }))
  const t0 = series[0].t
  const t1 = series[series.length - 1].t
  const span = t1 === t0 ? 15 * DAY : 0

  const converted = series.filter((p) => p.converted)
  const labs = [...new Set(series.map((p) => p.lab))]
  const idx = keys.indexOf(keyName)
  const out = last.status === 'low' || last.status === 'high'
  const go1 = (i) => go('indicator/' + encodeURIComponent(keys[(i + keys.length) % keys.length]))

  return (
    <div>
      <PageHeader
        title={label}
        subtitle={ind?.abbr}
        back={{ href: '#/indicators', label: 'Все показатели' }}
        actions={
          keys.length > 1 && (
            <div className="flex gap-2">
              <button className="flex h-12 w-12 items-center justify-center rounded-xl border border-line-strong bg-card hover:bg-sunken" aria-label="Предыдущий показатель" onClick={() => go1(idx - 1)}>
                <Icon name="chevL" size={19} />
              </button>
              <button className="flex h-12 w-12 items-center justify-center rounded-xl border border-line-strong bg-card hover:bg-sunken" aria-label="Следующий показатель" onClick={() => go1(idx + 1)}>
                <Icon name="chevR" size={19} />
              </button>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Card className="!px-3 lg:!px-5">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1">
              <p className={`num-display text-4xl font-bold ${out ? 'text-alert' : ''}`}>
                {fmtNum(last.value)} <span className="text-xl font-normal text-muted">{unit}</span>
              </p>
              <p className="text-muted">{fmtDate(last.date)}</p>
              <StatusBadge status={last.status} />
            </div>
            <div className="h-72" role="img" aria-label={`График: ${label}, значений ${series.length}`}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#e9e3d7" vertical={false} />
                  <XAxis dataKey="t" type="number" scale="time" domain={[t0 - span, t1 + span]} tickFormatter={fmtShort} tick={{ fontSize: 12, fill: '#67685f' }} tickCount={5} axisLine={{ stroke: '#d8d0c0' }} tickLine={false} />
                  <YAxis domain={[yMin, yMax]} ticks={ticks} tickFormatter={(v) => fmtNum(Number(v.toPrecision(4)))} tick={{ fontSize: 12, fill: '#67685f' }} width={46} axisLine={false} tickLine={false} allowDataOverflow />
                  <Tooltip content={<Tip />} />
                  <Area dataKey="band" stroke="none" fill={THREAD} fillOpacity={0.12} activeDot={false} dot={false} isAnimationActive={false} connectNulls />
                  <Line dataKey="refLow" stroke={THREAD} strokeWidth={1.5} strokeDasharray="7 6" dot={false} activeDot={false} connectNulls isAnimationActive={false} legendType="none" />
                  <Line dataKey="refHigh" stroke={THREAD} strokeWidth={1.5} strokeDasharray="7 6" dot={false} activeDot={false} connectNulls isAnimationActive={false} legendType="none" />
                  <Line
                    dataKey="value"
                    stroke={INK}
                    strokeWidth={2.5}
                    isAnimationActive animationDuration={800} animationEasing="ease-out"
                    dot={(p) => <Dot key={p.index} cx={p.cx} cy={p.cy} r={5.5} fill={p.payload.status === 'low' || p.payload.status === 'high' ? ALERT : INK} stroke="#fff" strokeWidth={2} />}
                    activeDot={{ r: 7.5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 flex items-start gap-2 px-1 text-sm text-muted">
              <span className="mt-1.5 inline-block h-0 w-6 shrink-0 border-t-2 border-dashed" style={{ borderColor: THREAD }} aria-hidden />
              Пунктир и заливка — диапазон лаборатории на момент анализа. Красная точка — значение вне диапазона лаборатории.
            </p>
          </Card>

          {(converted.length > 0 || labs.length > 1) && (
            <p className="mt-4 rounded-xl bg-accent-soft px-4 py-3 text-[0.95rem]">
              {labs.length > 1 && <>На графике данные из лабораторий: {labs.join(', ')}. </>}
              {converted.length > 0 && <>Все значения приведены к единице «{unit}». Пересчитано значений: {converted.length} (помечены ниже).</>}
            </p>
          )}

          <H>Все значения</H>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet ">
            {[...series].reverse().map((p) => {
              const o = p.status === 'low' || p.status === 'high'
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 lg:px-5">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-medium">{fmtDate(p.date)}</p>
                    <p className="text-sm text-muted">
                      {p.lab} · диапазон {refText(p.refLow, p.refHigh)}
                    </p>
                    {p.converted && (
                      <Chip tone="quiet" className="mt-1">
                        Пересчитано из {fmtNum(p.origValue)} {p.origUnit}
                      </Chip>
                    )}
                  </div>
                  {o && <StatusBadge status={p.status} />}
                  <p className={`text-lg font-semibold ${o ? 'text-alert' : ''}`}>
                    {fmtNum(p.value)} <span className="text-sm font-normal text-muted">{p.unit}</span>
                  </p>
                </li>
              )
            })}
          </ul>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
          <Card>
            <h2 className="mb-2 text-lg">Что это за показатель</h2>
            <p>{ind?.about || 'Показатель из вашего бланка. Справочного описания в сервисе пока нет.'}</p>
            <p className="mt-3 text-sm text-muted">Справочная информация, а не оценка результата. По результатам обращайтесь к врачу.</p>
          </Card>
        </aside>
      </div>
    </div>
  )
}
