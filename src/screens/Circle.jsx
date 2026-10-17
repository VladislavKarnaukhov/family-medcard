import { useState } from 'react'
import { Button, Card, Empty, Field, H } from '../components/ui'
import { actions } from '../lib/store'
import { fmtDate, fmtDateTime, plusDaysISO } from '../lib/format'

const ROLES = ['Брат или сестра', 'Супруг(а)', 'Сиделка', 'Врач', 'Другое']
const ACCESS = { view: 'Только просмотр', add: 'Просмотр и добавление документов' }

export default function Circle({ state, profile }) {
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ name: '', role: ROLES[0], access: 'view', profileIds: [], days: '' })
  const [link, setLink] = useState('')
  const [days, setDays] = useState(7)
  const [copied, setCopied] = useState(false)

  if (!profile) return <Empty>Сначала создайте профиль.</Empty>

  const pname = (id) => state.profiles.find((p) => p.id === id)?.name
  const members = state.members.filter((m) => m.profileIds.includes(profile.id))
  const log = state.accessLog.filter((l) => l.profileId === profile.id).slice(0, 8)
  const toggle = (id) => setF({ ...f, profileIds: f.profileIds.includes(id) ? f.profileIds.filter((x) => x !== id) : [...f.profileIds, id] })

  const invite = () => {
    actions.addMember({
      name: f.name.trim(),
      role: f.role,
      access: f.access,
      profileIds: f.profileIds.length ? f.profileIds : [profile.id],
      expires: f.days ? plusDaysISO(Number(f.days)) : null,
    })
    setF({ name: '', role: ROLES[0], access: 'view', profileIds: [], days: '' })
    setAdding(false)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* буфер недоступен — ссылку можно выделить вручную */
    }
  }

  return (
    <div className="py-4">
      <h1 className="text-2xl font-semibold">Круг заботы</h1>
      <p className="text-muted">Кто видит данные профиля «{profile.name}» и что с ними делает. Любой доступ можно закрыть.</p>
      <p className="mt-3 rounded-xl bg-accent-soft p-3 text-sm">В демо-версии доступ имитируется: приглашения не отправляются, ссылки не работают.</p>

      <H>Кто имеет доступ</H>
      <ul className="space-y-2">
        {members.length === 0 && <Empty>Кроме вас, доступа нет ни у кого.</Empty>}
        {members.map((m) => (
          <li key={m.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{m.name}</span>
              <span className="text-sm text-muted">{m.role}</span>
            </div>
            <div className="mt-1 text-sm text-muted">
              {ACCESS[m.access]} · {m.expires ? `до ${fmtDate(m.expires)}` : 'без срока'}
              {m.profileIds.length > 1 && ` · профили: ${m.profileIds.map(pname).join(', ')}`}
            </div>
            <button className="mt-1 min-h-10 text-sm text-alert underline underline-offset-2" onClick={() => confirm(`Закрыть доступ для ${m.name}?`) && actions.removeMember(m.id)}>
              Закрыть доступ
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <Card className="mt-3 space-y-3">
          <Field label="Имя">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Кто это">
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Что может делать">
            <select value={f.access} onChange={(e) => setF({ ...f, access: e.target.value })}>
              {Object.entries(ACCESS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Срок доступа">
            <select value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })}>
              <option value="">Без срока</option>
              <option value="7">7 дней</option>
              <option value="30">30 дней</option>
              <option value="90">90 дней</option>
            </select>
          </Field>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-muted">К каким профилям</legend>
            <div className="flex flex-wrap gap-2">
              {state.profiles.map((p) => {
                const on = (f.profileIds.length ? f.profileIds : [profile.id]).includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(p.id)}
                    className={`min-h-11 rounded-full px-4 ${on ? 'bg-accent text-white' : 'border border-line bg-card'}`}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <Button className="w-full" disabled={!f.name.trim()} onClick={invite}>
            Пригласить
          </Button>
        </Card>
      ) : (
        <Button variant="soft" className="mt-3 w-full" onClick={() => setAdding(true)}>
          ＋ Пригласить в круг
        </Button>
      )}

      <H>Ссылка для врача</H>
      <Card className="space-y-3">
        <p>Временная ссылка на сводку для врача. По истечении срока перестаёт открываться.</p>
        <Field label="Срок действия">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>1 день</option>
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
          </select>
        </Field>
        <Button className="w-full" onClick={() => setLink(actions.createShareLink(profile.id, days))}>
          Создать ссылку
        </Button>
        {link && (
          <div className="rounded-xl bg-paper p-3">
            <p className="break-all text-sm">{link}</p>
            <button className="mt-1 min-h-10 text-accent-dark underline underline-offset-2" onClick={copy}>
              {copied ? 'Скопировано' : 'Скопировать'}
            </button>
          </div>
        )}
      </Card>

      <H>Журнал просмотров</H>
      <ul className="space-y-2">
        {log.length === 0 && <Empty>Пока записей нет.</Empty>}
        {log.map((l) => (
          <li key={l.id} className="rounded-2xl border border-line bg-card p-3">
            <div>{l.who}</div>
            <div className="text-sm text-muted">
              {l.action} · {fmtDateTime(l.at)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
