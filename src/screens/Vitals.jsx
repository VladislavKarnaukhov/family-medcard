import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button, Card, Empty, Field, H } from '../components/ui'
import { actions } from '../lib/store'
import { fmtDateTime, fmtShort, localISO, pad } from '../lib/format'

const DAY = 86400000

export function vitalsSince(state, profileId, days) {
  const from = Date.now() - days * DAY
  return state.vitals
    .filter((v) => v.profileId === profileId)
    .map((v) => ({ ...v, t: new Date(v.datetime).getTime() }))
    .filter((v) => v.t >= from)
    .sort((a, b) => a.t - b.t)
}

function parsePressure(s) {
  const m = s.trim().match(/^(\d{2,3})\s*[/\\\-\s]\s*(\d{2,3})$/)
  if (!m) return null
  const [sys, dia] = [Number(m[1]), Number(m[2])]
  return sys >= 60 && sys <= 260 && dia >= 30 && dia <= 160 && sys > dia ? { sys, dia } : null
}

export default function Vitals({ state, profile }) {
  const [bp, setBp] = useState('')
  const [pulse, setPulse] = useState('')
  const [touched, setTouched] = useState(false)

  if (!profile) return <Empty>Сначала создайте профиль.</Empty>

  const p = parsePressure(bp)
  const pl = pulse.trim() === '' ? null : Number(pulse)
  const pulseBad = pl != null && !(Number.isInteger(pl) && pl >= 30 && pl <= 220)
  const items = vitalsSince(state, profile.id, 30)

  const add = () => {
    setTouched(true)
    if (!p || pulseBad || pl == null) return
    const now = new Date()
    actions.addVital({
      profileId: profile.id,
      datetime: `${localISO(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
      systolic: p.sys,
      diastolic: p.dia,
      pulse: pl,
    })
    setBp('')
    setPulse('')
    setTouched(false)
  }

  return (
    <div className="py-4">
      <h1 className="text-2xl font-semibold">Замеры</h1>
      <p className="text-muted">Давление и пульс для профиля «{profile.name}». Дата и время подставятся автоматически.</p>

      <Card className="mt-4 space-y-3">
        <Field label="Давление (верхнее/нижнее)" hint={touched && !p ? 'Введите, например, 120/80' : undefined}>
          <input inputMode="numeric" placeholder="120/80" value={bp} onChange={(e) => setBp(e.target.value)} className="!text-2xl" />
        </Field>
        <Field label="Пульс, ударов в минуту" hint={touched && (pl == null || pulseBad) ? 'Введите число, например, 72' : undefined}>
          <input inputMode="numeric" placeholder="72" value={pulse} onChange={(e) => setPulse(e.target.value)} className="!text-2xl" />
        </Field>
        <Button big onClick={add}>
          Записать
        </Button>
      </Card>

      <H>Давление за 30 дней</H>
      {items.length === 0 ? (
        <Empty>За последние 30 дней замеров нет.</Empty>
      ) : (
        <Card className="!px-2">
          <div className="h-64" role="img" aria-label={`График давления, замеров ${items.length}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={items} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#eee9e0" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={[Date.now() - 30 * DAY, Date.now()]}
                  tickFormatter={fmtShort}
                  tick={{ fontSize: 12, fill: '#6b665e' }}
                  tickCount={4}
                />
                <YAxis domain={['dataMin - 10', 'dataMax + 10']} tick={{ fontSize: 12, fill: '#6b665e' }} width={36} />
                <Tooltip
                  labelFormatter={(t) => fmtDateTime(new Date(t).toISOString().slice(0, 16))}
                  formatter={(v, n) => [v, n]}
                />
                <Legend />
                <Line name="Верхнее" dataKey="systolic" stroke="#2f7d6d" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                <Line name="Нижнее" dataKey="diastolic" stroke="#8a8478" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <H>Записи</H>
      <ul className="space-y-2">
        {[...items].reverse().slice(0, 10).map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-3">
            <div>
              <div className="text-lg font-semibold">
                {v.systolic}/{v.diastolic} <span className="text-sm font-normal text-muted">пульс {v.pulse}</span>
              </div>
              <div className="text-sm text-muted">{fmtDateTime(v.datetime)}</div>
            </div>
            <button
              className="min-h-10 px-2 text-sm text-muted underline underline-offset-2"
              onClick={() => confirm('Удалить запись?') && actions.deleteVital(v.id)}
            >
              Удалить
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
