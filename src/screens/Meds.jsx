import { useState } from 'react'
import { Button, Chip, Empty, ErrorText, Field, H, PageHeader, go } from '../components/ui'
import { Icon } from '../components/icons'
import { actions, can } from '../lib/store'
import { FORMS, WEEKDAYS, localNow } from '../lib/care'
import { fmtDate } from '../lib/format'

const scheduleText = (m) => {
  const t = m.times.length ? m.times.join(', ') : 'по необходимости'
  const d = m.days ? ` · ${WEEKDAYS.filter(([n]) => m.days.includes(n)).map(([, l]) => l).join(', ')}` : ''
  return t + d
}

function MedRow({ m, owner }) {
  return (
    <li>
      <a href={`#/meds/${m.profileId}/${m.id}`} className="flex min-h-16 items-center gap-4 px-5 py-4 transition-colors hover:bg-sunken">
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${m.status === 'stopped' ? 'text-muted line-through' : ''}`}>{m.name}</p>
          <p className="text-sm text-muted">{[m.dose, scheduleText(m)].filter(Boolean).join(' · ')}</p>
        </div>
        {m.status === 'stopped' && <Chip tone="quiet">отменено</Chip>}
        <Icon name="chevR" size={18} className="text-muted" />
      </a>
    </li>
  )
}

export function MedsList({ state, profile }) {
  if (!profile) return <Empty>Сначала создайте профиль.</Empty>
  const { write, owner } = can(state)
  const meds = state.medications.filter((m) => m.profileId === profile.id)
  const active = meds.filter((m) => m.status === 'active')
  const stopped = meds.filter((m) => m.status === 'stopped')
  return (
    <div>
      <PageHeader
        title="Лекарства"
        subtitle={`Профиль «${profile.name}». Вносите так, как написано в назначении врача.`}
        actions={write && <Button icon="plus" onClick={() => go(`meds/${profile.id}/new`)}>Добавить лекарство</Button>}
      />
      <div className="max-w-[760px]">
        {active.length === 0 ? (
          <Empty icon="file">Лекарств пока нет.</Empty>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet">
            {active.map((m) => <MedRow key={m.id} m={m} owner={owner} />)}
          </ul>
        )}
        {stopped.length > 0 && (
          <>
            <H>Отменённые</H>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet">
              {stopped.map((m) => <MedRow key={m.id} m={m} owner={owner} />)}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

const blank = (tz) => ({ name: '', form: '', dose: '', times: [], days: null, startDate: localNow(tz).date, endDate: '', prescribedBy: '', note: '' })

export function MedForm({ state, profile, id }) {
  const existing = id && id !== 'new' ? state.medications.find((m) => m.id === id) : null
  const [m, setM] = useState(() => existing ? { ...existing, endDate: existing.endDate || '' } : blank(state.family?.timezone))
  const [time, setTime] = useState('09:00')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const { write, owner } = can(state)
  if (!profile || (id !== 'new' && !existing)) return <Empty>Лекарство не найдено.</Empty>
  if (!write) return <Empty icon="lock">У вас доступ только для просмотра.</Empty>
  const set = (k) => (e) => setM({ ...m, [k]: e.target.value })
  const dayOn = (n) => !m.days || m.days.includes(n)
  const toggleDay = (n) => {
    const cur = m.days || [1, 2, 3, 4, 5, 6, 7]
    const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort()
    setM({ ...m, days: next.length === 7 ? null : next })
  }
  const run = async (fn, to) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
      go(to)
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }
  const list = `meds/${profile.id}`
  return (
    <div className="mx-auto max-w-[640px]">
      <PageHeader title={existing ? existing.name : 'Новое лекарство'} subtitle="Вносите так, как написано в назначении врача." back={{ href: `#/${list}`, label: 'Лекарства' }} />
      <div className="space-y-5">
        <Field label="Название">
          <input value={m.name} onChange={set('name')} maxLength={120} autoFocus={!existing} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Форма">
            <select value={m.form} onChange={set('form')}>
              <option value="">Не указана</option>
              {FORMS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Доза как в назначении">
            <input value={m.dose} onChange={set('dose')} maxLength={120} placeholder="1 таблетка 5 мг" />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Время приёма</legend>
          <div className="flex flex-wrap items-center gap-2">
            {m.times.map((t) => (
              <button key={t} type="button" onClick={() => setM({ ...m, times: m.times.filter((x) => x !== t) })} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-soft px-4 font-medium text-accent-dark" aria-label={`Убрать ${t}`}>
                {t} <Icon name="x" size={14} />
              </button>
            ))}
            {m.times.length < 8 && (
              <span className="flex items-center gap-2">
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="!w-auto" aria-label="Новое время" />
                <Button variant="soft" icon="plus" disabled={!time || m.times.includes(time)} onClick={() => setM({ ...m, times: [...m.times, time].sort() })}>Добавить</Button>
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted">{m.times.length ? '' : 'Без времени лекарство считается «по необходимости»: приём отмечают, когда он случился.'}</p>
        </fieldset>

        {m.times.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Дни</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(([n, l]) => (
                <button key={n} type="button" aria-pressed={dayOn(n)} onClick={() => toggleDay(n)} className={`min-h-11 min-w-11 rounded-full px-3 font-medium ${dayOn(n) ? 'bg-accent text-white' : 'border border-line-strong bg-card text-muted'}`}>
                  {l}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-sm text-muted">{m.days ? 'Только выбранные дни' : 'Каждый день'}</p>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Начало приёма">
            <input type="date" value={m.startDate} onChange={set('startDate')} />
          </Field>
          <Field label="Окончание (необязательно)">
            <input type="date" value={m.endDate} onChange={set('endDate')} />
          </Field>
        </div>
        <Field label="Кто назначил">
          <input value={m.prescribedBy} onChange={set('prescribedBy')} maxLength={200} placeholder="Врач или клиника" />
        </Field>
        <Field label="Заметка">
          <textarea value={m.note} onChange={set('note')} maxLength={500} />
        </Field>
        <ErrorText>{err}</ErrorText>
        <div className="flex flex-wrap gap-3">
          <Button icon="check" disabled={busy || !m.name.trim()} onClick={() => run(() => actions.saveMed(profile.id, m), list)}>Сохранить</Button>
          <Button variant="ghost" onClick={() => go(list)}>Отмена</Button>
        </div>
        {existing && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-5">
            {existing.status === 'active' ? (
              <button className="min-h-11 font-medium text-accent-dark hover:underline" onClick={() => confirm('Отметить лекарство как отменённое? Отметки приёма сохранятся.') && run(() => actions.setMedStatus(existing.id, 'stopped'), list)}>
                Лекарство отменено
              </button>
            ) : (
              <button className="min-h-11 font-medium text-accent-dark hover:underline" onClick={() => run(() => actions.setMedStatus(existing.id, 'active'), list)}>Возобновить приём</button>
            )}
            {owner && (
              <button className="min-h-11 font-medium text-alert hover:underline" onClick={() => confirm('Удалить лекарство вместе со всеми отметками приёма?') && run(() => actions.deleteMed(existing.id), list)}>
                Удалить
              </button>
            )}
            {existing.stoppedAt && <p className="text-sm text-muted">Отменено {fmtDate(existing.stoppedAt.slice(0, 10))}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
