import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button, Card, Empty, ErrorText, Field, H, PageHeader } from '../components/ui'
import { Icon } from '../components/icons'
import { actions, can } from '../lib/store'
import { fmtDateTime, fmtShort, localISO, pad } from '../lib/format'

const DAY = 86400000
const INK = '#26332f'
const SLATE = '#a89f8a'

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

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null
  const v = payload[0].payload
  return (
    <div className="rounded-xl border border-line bg-white p-3 text-sm shadow-pop">
      <p className="text-base font-semibold">
        {v.systolic}/{v.diastolic}
      </p>
      <p className="text-muted">Пульс {v.pulse}</p>
      <p className="text-muted">{fmtDateTime(v.datetime)}</p>
    </div>
  )
}

export default function Vitals({ state, profile }) {
  const [bp, setBp] = useState('')
  const [pulse, setPulse] = useState('')
  const [touched, setTouched] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const { write } = can(state, profile)

  if (!profile) return <Empty>Сначала создайте профиль.</Empty>

  const p = parsePressure(bp)
  const pl = pulse.trim() === '' ? null : Number(pulse)
  const pulseBad = pl != null && !(Number.isInteger(pl) && pl >= 30 && pl <= 220)
  const items = vitalsSince(state, profile.id, 30)

  const add = async () => {
    setTouched(true)
    if (!p || pulseBad || pl == null) return
    const now = new Date()
    setBusy(true)
    try {
      await actions.addVital({ profileId: profile.id, datetime: `${localISO(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`, systolic: p.sys, diastolic: p.dia, pulse: pl })
      setBp('')
      setPulse('')
      setTouched(false)
      setErr('')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const avg = items.length
    ? {
        s: Math.round(items.reduce((a, v) => a + v.systolic, 0) / items.length),
        d: Math.round(items.reduce((a, v) => a + v.diastolic, 0) / items.length),
        p: Math.round(items.reduce((a, v) => a + v.pulse, 0) / items.length),
      }
    : null

  return (
    <div>
      <PageHeader title="Замеры" subtitle={`Давление и пульс, профиль «${profile.name}». Дата и время подставятся автоматически.`} />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[320px_minmax(0,1fr)]">
        {write && (
          <Card className="space-y-4 xl:sticky xl:top-8 xl:self-start">
            <Field label="Давление (верхнее/нижнее)" hint={touched && !p ? 'Введите, например, 120/80' : undefined}>
              <input inputMode="numeric" placeholder="120/80" value={bp} onChange={(e) => setBp(e.target.value)} className="!text-2xl !font-semibold" />
            </Field>
            <Field label="Пульс, ударов в минуту" hint={touched && (pl == null || pulseBad) ? 'Введите число, например, 72' : undefined}>
              <input inputMode="numeric" placeholder="72" value={pulse} onChange={(e) => setPulse(e.target.value)} className="!text-2xl !font-semibold" />
            </Field>
            <ErrorText>{err}</ErrorText>
            <Button big icon="check" onClick={add} disabled={busy}>
              Записать
            </Button>
          </Card>
        )}

        <div className={`min-w-0 ${write ? '' : 'xl:col-span-2'}`}>
          <H>Давление за 30 дней</H>
          {items.length === 0 ? (
            <Empty icon="pulse">За последние 30 дней замеров нет.</Empty>
          ) : (
            <Card className="!px-3 lg:!px-5">
              {avg && (
                <p className="mb-3 px-1 text-sm text-muted">
                  Записей: {items.length}. Среднее значение: <span className="font-semibold text-ink">{avg.s}/{avg.d}</span>, пульс {avg.p}.
                </p>
              )}
              <div className="h-72" role="img" aria-label={`График давления, записей: ${items.length}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={items} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#e9e3d7" vertical={false} />
                    <XAxis dataKey="t" type="number" scale="time" domain={[Date.now() - 30 * DAY, Date.now()]} tickFormatter={fmtShort} tick={{ fontSize: 12, fill: '#67685f' }} tickCount={5} axisLine={{ stroke: '#d8d0c0' }} tickLine={false} />
                    <YAxis domain={['dataMin - 10', 'dataMax + 10']} tick={{ fontSize: 12, fill: '#67685f' }} width={38} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Legend iconType="plainline" />
                    <Line name="Верхнее" dataKey="systolic" stroke={INK} strokeWidth={2.5} dot={{ r: 3, fill: INK, strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                    <Line name="Нижнее" dataKey="diastolic" stroke={SLATE} strokeWidth={2.5} dot={{ r: 3, fill: SLATE, strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <H>Последние записи</H>
          {items.length === 0 ? (
            <p className="text-muted">Записей нет.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet ">
              {[...items].reverse().slice(0, 10).map((v) => (
                <li key={v.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1">
                    <p className="text-lg font-semibold">
                      {v.systolic}/{v.diastolic} <span className="text-sm font-normal text-muted">пульс {v.pulse}</span>
                    </p>
                    <p className="text-sm text-muted">{fmtDateTime(v.datetime)}</p>
                  </div>
                  {write && (
                    <button className="flex h-12 w-12 items-center justify-center rounded-lg text-muted hover:bg-alert-soft hover:text-alert" aria-label="Удалить запись" onClick={() => confirm('Удалить запись?') && actions.deleteVital(v.id)}>
                      <Icon name="trash" size={18} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
