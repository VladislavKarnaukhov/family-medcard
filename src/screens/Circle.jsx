import { useState } from 'react'
import { Avatar, Button, Card, Chip, Empty, ErrorText, Field, H, Notice, PageHeader, Toggle } from '../components/ui'
import { Icon } from '../components/icons'
import { actions } from '../lib/store'
import { docTitle, fmtDate, fmtDateTime } from '../lib/format'
import { DocLink } from './Legal'

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
      /* буфер недоступен: ссылку можно выделить вручную */
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2">
      <Icon name="link" size={17} className="text-accent" />
      <p className="min-w-0 flex-1 select-all break-all text-sm">{link}</p>
      <Button variant="ghost" className="!min-h-9 !px-3 text-sm" onClick={copy}>
        {copied ? 'Скопировано' : 'Копировать'}
      </Button>
    </div>
  )
}

export default function Circle({ state, profile }) {
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ role: ROLES[0], access: 'view', profileIds: [], accessDays: '', email: '' })
  const [invite, setInvite] = useState(null)
  const [link, setLink] = useState('')
  const [days, setDays] = useState(7)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [okInvite, setOkInvite] = useState(false)
  const [okShare, setOkShare] = useState(false)

  if (!profile) return <Empty icon="users">Сначала создайте профиль.</Empty>

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
      const r = await actions.inviteMember({
        role: f.role,
        access: f.access,
        profileIds: selected.length === state.profiles.length ? [] : selected,
        accessDays: f.accessDays ? Number(f.accessDays) : null,
        email: f.email.trim() || undefined,
      })
      setInvite(r)
      setAdding(false)
      setOkInvite(false)
      setF({ ...f, email: '' })
    })

  return (
    <div>
      <PageHeader title="Круг заботы" subtitle={`Кто видит данные профиля «${profile.name}» и что с ними делает. Любой доступ можно закрыть.`} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0 space-y-2">
          <H>Кто имеет доступ</H>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card ">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <Avatar name={m.name} size={42} />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-sm text-muted">
                    {m.access === 'owner' ? 'Владелец семьи' : `${m.role} · ${ACCESS[m.access]} · ${m.expires ? `до ${fmtDate(m.expires)}` : 'без срока'}`}
                  </p>
                  {m.profileIds.length > 1 && m.access !== 'owner' && <p className="text-sm text-muted">Профили: {m.profileIds.map(pname).filter(Boolean).join(', ')}</p>}
                </div>
                {m.access !== 'owner' && (
                  <Button variant="danger" className="!min-h-10 text-sm" onClick={() => confirm(`Закрыть доступ для ${m.name}?`) && run(() => actions.removeMember(m.id))}>
                    Закрыть доступ
                  </Button>
                )}
              </li>
            ))}
            <li className="flex items-center gap-4 bg-paper/60 px-4 py-3.5">
              <Avatar name={state.assistant?.name || 'Помощник'} size={42} tone="solid" />
              <div>
                <p className="font-semibold">{state.assistant?.name || 'Помощник'}</p>
                <p className="text-sm text-muted">Помощник сервиса. Видит данные, чтобы вносить документы и выполнять поручения. Каждое открытие попадает в журнал.</p>
              </div>
            </li>
          </ul>

          {invites.length > 0 && (
            <>
              <H>Ожидают ответа</H>
              <ul className="space-y-3">
                {invites.map((i) => (
                  <li key={i.token} className="stitch-border space-y-2 rounded-2xl bg-card p-4">
                    <p className="font-semibold">
                      {i.role} <span className="font-normal text-muted">· {ACCESS[i.access]}</span>
                    </p>
                    <p className="text-sm text-muted">Ссылка действует до {fmtDate(i.expiresAt.slice(0, 10))}</p>
                    <CopyLink link={`${location.origin}/#/invite/${i.token}`} />
                    <button className="min-h-10 text-sm font-medium text-alert hover:underline" onClick={() => run(() => actions.revokeInvite(i.token))}>
                      Отозвать приглашение
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {invite && (
            <Card className="mt-4 space-y-3">
              <p className="flex items-center gap-2 font-semibold">
                <Icon name="check" className="text-accent" />
                Приглашение создано
              </p>
              <p className="text-sm text-muted">{invite.emailed ? 'Мы отправили письмо со ссылкой. ' : ''}Ссылку можно отправить и самому, например в мессенджере. Она одноразовая и действует 14 дней.</p>
              <CopyLink link={invite.url} />
            </Card>
          )}

          <div className="pt-4">
            {adding ? (
              <Card className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Кто это">
                    <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                      {ROLES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
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
                </div>
                <Field label="Что может делать">
                  <select value={f.access} onChange={(e) => setF({ ...f, access: e.target.value })}>
                    <option value="view">{ACCESS.view}</option>
                    <option value="add">{ACCESS.add}</option>
                  </select>
                </Field>
                <Field label="Email (необязательно)" hint="Если указать, мы отправим приглашение письмом.">
                  <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@example.com" />
                </Field>
                <fieldset>
                  <legend className="mb-1.5 text-sm font-medium">К каким профилям</legend>
                  <div className="flex flex-wrap gap-2">
                    {state.profiles.map((p) => {
                      const on = selected.includes(p.id)
                      return (
                        <button key={p.id} type="button" aria-pressed={on} onClick={() => toggle(p.id)} className={`flex min-h-11 items-center gap-2 rounded-md px-4 font-medium transition-colors ${on ? 'bg-accent text-white' : 'border border-line-strong bg-card'}`}>
                          {on && <Icon name="check" size={16} />}
                          {p.name}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
                <div className="rounded-xl bg-paper p-4">
                  <Toggle checked={okInvite} onChange={setOkInvite}>
                    Подтверждаю, что владелец данных (или его законный представитель) согласен на этот доступ. <DocLink id="consent_circle">Документ</DocLink>
                  </Toggle>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button disabled={busy || !selected.length || !okInvite} onClick={createInvite}>
                    Создать приглашение
                  </Button>
                  <Button variant="ghost" onClick={() => setAdding(false)}>
                    Отмена
                  </Button>
                </div>
              </Card>
            ) : (
              <Button variant="soft" icon="plus" onClick={() => (setAdding(true), setInvite(null))}>
                Пригласить в круг
              </Button>
            )}
          </div>
          <div className="pt-3">
            <ErrorText>{err}</ErrorText>
          </div>
          <H className="!mt-10">Журнал просмотров</H>
          {log.length === 0 ? (
            <p className="text-muted">Пока записей нет.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {log.map((l) => (
                <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3">
                  <p className="text-[0.95rem]">
                    <span className="font-medium">{l.who}</span>
                    <span className="text-muted">: {docTitle(l.action)}</span>
                  </p>
                  <p className="text-sm text-muted">{fmtDateTime(l.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          <H>Ссылка для врача</H>
          <Card className="space-y-4">
            <p className="text-[0.95rem]">Временная ссылка на сводку. Открывается без входа, только для чтения, и перестаёт работать по истечении срока.</p>
            <Field label="Срок действия">
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={1}>1 день</option>
                <option value={7}>7 дней</option>
                <option value={30}>30 дней</option>
              </select>
            </Field>
            <div className="rounded-xl bg-paper p-4">
              <Toggle checked={okShare} onChange={setOkShare}>
                Человек, чьи данные открываются (или его законный представитель), согласен на передачу сводки врачу по ссылке. <DocLink id="consent_doctor">Документ</DocLink>
              </Toggle>
            </div>
            <Button icon="link" disabled={busy || !okShare} onClick={() => run(async () => setLink(await actions.createShareLink(profile.id, days)))}>
              Создать ссылку
            </Button>
            {link && <CopyLink link={link} />}
          </Card>

        </div>
      </div>
    </div>
  )
}
