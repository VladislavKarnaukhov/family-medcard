import { useState } from 'react'
import { Button, Card, Empty, Field, H } from '../components/ui'
import { actions } from '../lib/store'
import { fmtDate, fmtDateTime } from '../lib/format'

const ROLES = ['Брат или сестра', 'Супруг(а)', 'Сиделка', 'Врач', 'Другое']
const ACCESS = { view: 'Только просмотр', add: 'Просмотр и добавление документов', owner: 'Владелец' }

function CopyLink({ link }) {
  const [copied, setCopied] = useState(false)
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
    <div className="rounded-xl bg-paper p-3">
      <p className="break-all text-sm select-all">{link}</p>
      <button className="mt-1 min-h-10 text-accent-dark underline underline-offset-2" onClick={copy}>
        {copied ? 'Скопировано' : 'Скопировать'}
      </button>
    </div>
  )
}

export default function Circle({ state, profile }) {
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ role: ROLES[0], access: 'view', profileIds: [], accessDays: '' })
  const [invite, setInvite] = useState('')
  const [link, setLink] = useState('')
  const [days, setDays] = useState(7)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (!profile) return <Empty>Сначала создайте профиль.</Empty>

  const pname = (id) => state.profiles.find((p) => p.id === id)?.name
  const members = state.members.filter((m) => m.profileIds.includes(profile.id) || m.access === 'owner')
  const invites = state.invites.filter((i) => i.profileIds.includes(profile.id))
  const log = state.accessLog.filter((l) => !l.profileId || l.profileId === profile.id).slice(0, 12)
  const selected = f.profileIds.length ? f.profileIds : [profile.id]
  const toggle = (id) => setF({ ...f, profileIds: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] })

  const run = async (fn) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const createInvite = () =>
    run(async () => {
      const url = await actions.inviteMember({
        role: f.role,
        access: f.access,
        profileIds: selected.length === state.profiles.length ? [] : selected,
        accessDays: f.accessDays ? Number(f.accessDays) : null,
      })
      setInvite(url)
      setAdding(false)
    })

  return (
    <div className="py-4">
      <h1 className="text-2xl font-semibold">Круг заботы</h1>
      <p className="text-muted">Кто видит данные профиля «{profile.name}» и что с ними делает. Любой доступ можно закрыть.</p>

      <H>Кто имеет доступ</H>
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{m.name}</span>
              <span className="text-sm text-muted">{m.role}</span>
            </div>
            <div className="mt-1 text-sm text-muted">
              {ACCESS[m.access]}
              {m.access !== 'owner' && ` · ${m.expires ? `до ${fmtDate(m.expires)}` : 'без срока'}`}
              {m.profileIds.length > 1 && m.access !== 'owner' && ` · профили: ${m.profileIds.map(pname).filter(Boolean).join(', ')}`}
            </div>
            {m.access !== 'owner' && (
              <button className="mt-1 min-h-10 text-sm text-alert underline underline-offset-2" onClick={() => confirm(`Закрыть доступ для ${m.name}?`) && run(() => actions.removeMember(m.id))}>
                Закрыть доступ
              </button>
            )}
          </li>
        ))}
        <li className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{state.assistant?.name || 'Помощник'}</span>
            <span className="text-sm text-muted">Помощник сервиса</span>
          </div>
          <div className="mt-1 text-sm text-muted">Видит данные, чтобы вносить документы и выполнять поручения. Каждое открытие попадает в журнал ниже.</div>
        </li>
      </ul>

      {invites.length > 0 && (
        <>
          <H>Ожидают ответа</H>
          <ul className="space-y-2">
            {invites.map((i) => (
              <li key={i.token} className="rounded-2xl border border-dashed border-line p-4">
                <div className="font-medium">{i.role}</div>
                <div className="text-sm text-muted">
                  {ACCESS[i.access]} · ссылка действует до {fmtDate(i.expiresAt.slice(0, 10))}
                </div>
                <CopyLink link={`${location.origin}/#/invite/${i.token}`} />
                <button className="mt-1 min-h-10 text-sm text-alert underline underline-offset-2" onClick={() => run(() => actions.revokeInvite(i.token))}>
                  Отозвать приглашение
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {invite && (
        <Card className="mt-3 space-y-2">
          <p className="font-medium">Приглашение создано</p>
          <p className="text-sm text-muted">Отправьте ссылку человеку в мессенджере. Она одноразовая и действует 14 дней.</p>
          <CopyLink link={invite} />
        </Card>
      )}

      {adding ? (
        <Card className="mt-3 space-y-3">
          <Field label="Кто это">
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Что может делать">
            <select value={f.access} onChange={(e) => setF({ ...f, access: e.target.value })}>
              <option value="view">{ACCESS.view}</option>
              <option value="add">{ACCESS.add}</option>
            </select>
          </Field>
          <Field label="Срок доступа после принятия">
            <select value={f.accessDays} onChange={(e) => setF({ ...f, accessDays: e.target.value })}>
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
                const on = selected.includes(p.id)
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => toggle(p.id)} className={`min-h-11 rounded-full px-4 ${on ? 'bg-accent text-white' : 'border border-line bg-card'}`}>
                    {p.name}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <Button className="w-full" disabled={busy || !selected.length} onClick={createInvite}>
            Создать ссылку-приглашение
          </Button>
        </Card>
      ) : (
        <Button variant="soft" className="mt-3 w-full" onClick={() => (setAdding(true), setInvite(''))}>
          ＋ Пригласить в круг
        </Button>
      )}

      {err && (
        <p role="alert" className="mt-3 rounded-xl bg-alert-soft p-3 text-alert">
          {err}
        </p>
      )}

      <H>Ссылка для врача</H>
      <Card className="space-y-3">
        <p>Временная ссылка на сводку для врача. Открывается без входа, только для чтения. По истечении срока перестаёт работать.</p>
        <Field label="Срок действия">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>1 день</option>
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
          </select>
        </Field>
        <Button className="w-full" disabled={busy} onClick={() => run(async () => setLink(await actions.createShareLink(profile.id, days)))}>
          Создать ссылку
        </Button>
        {link && <CopyLink link={link} />}
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
