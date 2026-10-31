import { useMemo, useState } from 'react'
import { Empty, Field, PageHeader } from '../components/ui'
import { KIND_LABEL, addDays, localNow } from '../lib/care'
import { fmtDate } from '../lib/format'
import { NoteLine } from './Today'

const PERIODS = [[7, '7 дней'], [30, '30 дней'], [90, '90 дней']]
const MAX_DAYS = 90

// Лента дневника: записи, давление и отметки приёмов за выбранные даты.
export default function Diary({ state, profile }) {
  const tz = state.family?.timezone
  const today = localNow(tz).date
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const [kind, setKind] = useState('all')

  const items = useMemo(() => {
    if (!profile) return []
    const medName = Object.fromEntries(state.medications.map((m) => [m.id, m.name]))
    const rows = []
    if (kind === 'all' || KIND_LABEL[kind]) {
      for (const n of state.careNotes) if (n.profileId === profile.id && (kind === 'all' || n.kind === kind)) rows.push({ at: n.at, key: 'n' + n.id, node: <NoteLine n={n} state={state} /> })
    }
    if (kind === 'all' || kind === 'vitals') {
      for (const v of state.vitals) if (v.profileId === profile.id) rows.push({ at: v.datetime, key: 'v' + v.id, node: <p className="font-medium">Давление {v.systolic}/{v.diastolic}, пульс {v.pulse}</p> })
    }
    if (kind === 'all' || kind === 'intakes') {
      for (const i of state.intakes) {
        if (i.profileId !== profile.id || (i.status !== 'taken' && i.status !== 'skipped')) continue
        rows.push({
          at: i.scheduledAt,
          key: 'i' + i.id,
          node: (
            <p>
              <span className="font-medium">{medName[i.medicationId] || 'Лекарство'}</span>: {i.status === 'taken' ? 'принято' : 'пропущено'}
              {i.reason ? `, ${i.reason}` : ''}
              {i.by ? <span className="text-sm text-muted"> · {i.bySelf ? 'отметил(а) сам(а)' : i.by}</span> : null}
            </p>
          ),
        })
      }
    }
    return rows.filter((r) => r.at.slice(0, 10) >= from && r.at.slice(0, 10) <= to).sort((a, b) => b.at.localeCompare(a.at))
  }, [state, profile, from, to, kind])

  if (!profile) return <Empty icon="user">Сначала создайте профиль.</Empty>

  const byDay = []
  for (const r of items) {
    const d = r.at.slice(0, 10)
    if (!byDay.length || byDay[byDay.length - 1].d !== d) byDay.push({ d, rows: [] })
    byDay[byDay.length - 1].rows.push(r)
  }
  const pick = (days) => {
    setFrom(addDays(today, -(days - 1)))
    setTo(today)
  }
  const chips = [['all', 'Всё'], ['intakes', 'Приёмы'], ['vitals', 'Давление'], ...Object.entries(KIND_LABEL)]

  return (
    <div>
      <PageHeader title="Дневник" subtitle={`Профиль «${profile.name}»: записи, давление и отметки приёмов по датам.`} />
      <div className="max-w-[760px]">
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Период">
          {PERIODS.map(([d, label]) => (
            <button key={d} type="button" onClick={() => pick(d)} className={`press min-h-12 rounded-full border px-5 ${from === addDays(today, -(d - 1)) && to === today ? 'border-accent bg-accent-soft text-accent-dark' : 'border-line-strong bg-card'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Field label="С даты">
            <input type="date" value={from} min={addDays(today, -MAX_DAYS)} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </Field>
          <Field label="По дату">
            <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </Field>
        </div>
        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Тип записей">
          {chips.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`press min-h-12 rounded-full border px-4 text-[0.95rem] ${kind === k ? 'border-accent bg-accent-soft text-accent-dark' : 'border-line-strong bg-card'}`}>
              {label}
            </button>
          ))}
        </div>
        {byDay.length === 0 ? (
          <Empty icon="file">За выбранные даты записей нет.</Empty>
        ) : (
          byDay.map(({ d, rows }) => (
            <section key={d} className="mb-6">
              <h2 className="mb-1 text-base font-semibold">{fmtDate(d)}</h2>
              <ul className="divide-y divide-line border-y border-line">
                {rows.map((i) => (
                  <li key={i.key} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 py-3">
                    <p className="text-muted">{i.at.slice(11)}</p>
                    <div className="min-w-0">{i.node}</div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        <p className="text-sm text-muted">Хранится и показывается история за последние {MAX_DAYS} дней.</p>
      </div>
    </div>
  )
}
