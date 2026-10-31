import { useState } from 'react'
import { Button, Chip, Empty, ErrorText, Field, H, PageHeader, go } from '../components/ui'
import { Icon } from '../components/icons'
import { actions, can } from '../lib/store'
import { fmtDt, localNow } from '../lib/care'
import { docTitle } from '../lib/format'

const STATUS = { planned: 'запланирован', done: 'прошёл', cancelled: 'отменён' }

export function VisitsList({ state, profile }) {
  if (!profile) return <Empty>Сначала создайте профиль.</Empty>
  const { write } = can(state)
  const now = localNow(state.family?.timezone).dt
  const all = state.appointments.filter((a) => a.profileId === profile.id)
  const upcoming = all.filter((a) => a.status === 'planned' && a.at >= now)
  const past = all.filter((a) => !(a.status === 'planned' && a.at >= now)).reverse()
  const Row = ({ a }) => (
    <li>
      <a href={`#/visits/${profile.id}/${a.id}`} className="flex min-h-16 items-center gap-4 px-5 py-4 transition-colors hover:bg-sunken">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{a.specialist}</p>
          <p className="text-sm text-muted">{fmtDt(a.at)}{a.address ? ` · ${a.address}` : ''}</p>
        </div>
        {a.status !== 'planned' && <Chip tone="quiet">{STATUS[a.status]}</Chip>}
        <Icon name="chevR" size={18} className="text-muted" />
      </a>
    </li>
  )
  return (
    <div>
      <PageHeader title="Визиты к врачу" subtitle={`Профиль «${profile.name}».`} actions={write && <Button icon="plus" onClick={() => go(`visits/${profile.id}/new`)}>Добавить визит</Button>} />
      <div className="max-w-[760px]">
        {upcoming.length === 0 ? <Empty icon="clock">Запланированных визитов нет.</Empty> : <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet">{upcoming.map((a) => <Row key={a.id} a={a} />)}</ul>}
        {past.length > 0 && (
          <>
            <H>Прошедшие</H>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet">{past.map((a) => <Row key={a.id} a={a} />)}</ul>
          </>
        )}
      </div>
    </div>
  )
}

export function VisitForm({ state, profile, id }) {
  const existing = id && id !== 'new' ? state.appointments.find((a) => a.id === id) : null
  const nowDate = localNow(state.family?.timezone).date
  const [v, setV] = useState(() => existing || { at: `${nowDate}T10:00`, specialist: '', address: '', purpose: '', companion: '', bring: '', status: 'planned', resultNote: '', documentIds: [] })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const { write, owner } = can(state)
  if (!profile || (id !== 'new' && !existing)) return <Empty>Визит не найден.</Empty>
  if (!write) return <Empty icon="lock">У вас доступ только для просмотра.</Empty>
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  const docs = state.documents.filter((d) => d.profileId === profile.id)
  const list = `visits/${profile.id}`
  const run = async (fn, to) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
      if (to) go(to)
      else setBusy(false)
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }
  const toggleDoc = (d) => setV({ ...v, documentIds: v.documentIds.includes(d) ? v.documentIds.filter((x) => x !== d) : [...v.documentIds, d] })
  return (
    <div className="mx-auto max-w-[640px]">
      <PageHeader title={existing ? existing.specialist : 'Новый визит'} subtitle={existing ? fmtDt(existing.at) : `Профиль «${profile.name}».`} back={{ href: `#/${list}`, label: 'Визиты' }} />
      <div className="space-y-5">
        <Field label="Врач или клиника">
          <input value={v.specialist} onChange={set('specialist')} maxLength={160} autoFocus={!existing} />
        </Field>
        <Field label="Дата и время">
          <input type="datetime-local" value={v.at} onChange={set('at')} />
        </Field>
        <Field label="Адрес">
          <input value={v.address} onChange={set('address')} maxLength={300} />
        </Field>
        <Field label="Цель визита">
          <textarea value={v.purpose} onChange={set('purpose')} maxLength={500} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Кто сопровождает">
            <input value={v.companion} onChange={set('companion')} maxLength={160} />
          </Field>
          <Field label="Что взять с собой">
            <input value={v.bring} onChange={set('bring')} maxLength={500} />
          </Field>
        </div>
        {existing && (
          <>
            <Field label="Статус">
              <select value={v.status} onChange={set('status')}>
                {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l[0].toUpperCase() + l.slice(1)}</option>)}
              </select>
            </Field>
            {v.status === 'done' && (
              <>
                <Field label="Заметка после визита">
                  <textarea value={v.resultNote} onChange={set('resultNote')} maxLength={1000} />
                </Field>
                {docs.length > 0 && (
                  <fieldset>
                    <legend className="mb-1.5 text-sm font-medium">Документы профиля</legend>
                    <div className="flex flex-wrap gap-2">
                      {docs.map((d) => (
                        <button key={d.id} type="button" aria-pressed={v.documentIds.includes(d.id)} onClick={() => toggleDoc(d.id)} className={`min-h-12 rounded-full px-4 font-medium ${v.documentIds.includes(d.id) ? 'bg-accent text-white' : 'border border-line-strong bg-card'}`}>
                          {docTitle(d.title)}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
              </>
            )}
          </>
        )}
        <ErrorText>{err}</ErrorText>
        <div className="flex flex-wrap gap-3">
          <Button icon="check" disabled={busy || !v.specialist.trim() || !v.at} onClick={() => run(() => actions.saveVisit(profile.id, v), list)}>Сохранить</Button>
          <Button variant="ghost" onClick={() => go(list)}>Отмена</Button>
        </div>
        {existing && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-5">
            <a className="inline-flex min-h-12 items-center gap-2 font-medium text-accent-dark hover:underline" href="#/summary"><Icon name="sheet" size={18} /> Сводка к визиту</a>
            {owner && !existing.requestId && !sent && (
              <button className="inline-flex min-h-12 items-center gap-2 font-medium text-accent-dark hover:underline" onClick={() => run(async () => { await actions.requestVisit(existing.id); setSent(true) })}>
                <Icon name="chat" size={18} /> Поручить помощнику
              </button>
            )}
            {(existing.requestId || sent) && <p className="text-sm text-muted">Поручение помощнику создано.</p>}
            {owner && (
              <button className="min-h-12 font-medium text-alert hover:underline" onClick={() => confirm('Удалить визит?') && run(() => actions.deleteVisit(existing.id), list)}>Удалить</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
