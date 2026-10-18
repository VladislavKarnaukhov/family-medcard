import { useState } from 'react'
import { api } from '../lib/api'
import { Avatar, Button, Card, Chip, Empty, ErrorText, Field, H, Notice, PageHeader, Toggle } from '../components/ui'
import { usePoll } from './hooks'
import { fmtDate, fmtDateTime } from '../lib/format'

const REQ_TYPES = { access: 'Получить сведения', correction: 'Уточнить данные', deletion: 'Удалить данные', revoke: 'Отозвать согласие', other: 'Другое' }

// Запросы субъектов персональных данных: срок ответа 10 рабочих дней (ст. 14, 20 152-ФЗ).
export function DataRequests() {
  const [rows, reload] = usePoll(() => api('GET', '/api/staff/data-requests'), 15000, [])
  if (!rows) return <p className="text-muted">Загрузка…</p>
  const now = new Date().toISOString()
  return (
    <div>
      <PageHeader title="Запросы по персональным данным" subtitle="Срок ответа: 10 рабочих дней (ст. 14, 20 152-ФЗ). Просроченные выделены." />
      {rows.length === 0 ? (
        <Empty icon="shield">Запросов нет.</Empty>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const late = r.status === 'new' && r.dueAt < now
            return (
              <li key={r.id} className={`rounded-2xl border p-5  ${late ? 'border-accent bg-accent-soft' : 'border-line bg-card'}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{REQ_TYPES[r.type]}</p>
                  <Chip tone={r.status === 'done' ? 'quiet' : late ? 'solid' : 'accent'}>{r.status === 'done' ? `выполнено ${fmtDate(r.resolvedAt.slice(0, 10))}` : `ответить до ${fmtDate(r.dueAt.slice(0, 10))}`}</Chip>
                </div>
                <p className="text-sm text-muted">
                  {r.name} · {r.email} · {fmtDateTime(r.createdAt)}
                </p>
                {r.text && <p className="mt-2 whitespace-pre-wrap">{r.text}</p>}
                {r.status === 'new' && (
                  <Button
                    variant="ghost"
                    icon="check"
                    className="mt-3 !min-h-10 text-sm"
                    onClick={async () => {
                      await api('PATCH', `/api/staff/data-requests/${r.id}`, {})
                      reload()
                    }}
                  >
                    Отметить выполненным
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Команда: только для администратора.
export function Team({ me }) {
  const [rows, reload] = usePoll(() => api('GET', '/api/staff/team'), 15000, [])
  const [f, setF] = useState({ name: '', email: '', isAdmin: false })
  const [err, setErr] = useState('')
  const [created, setCreated] = useState(null)
  const [busy, setBusy] = useState(false)

  const add = async () => {
    setBusy(true)
    setErr('')
    try {
      setCreated(await api('POST', '/api/staff/team', f))
      setF({ name: '', email: '', isAdmin: false })
      reload()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  const patch = async (id, body) => {
    setErr('')
    try {
      await api('PATCH', `/api/staff/team/${id}`, body)
      reload()
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <div>
      <PageHeader title="Команда" subtitle="Сотрудники, которые видят очередь и данные клиентов. Отключённый сотрудник теряет вход, а его клиенты и поручения передаются другому." />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          {!rows ? (
            <p className="text-muted">Загрузка…</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet ">
              {rows.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                  <Avatar name={u.name} size={44} />
                  <div className="min-w-0 flex-1 basis-52">
                    <p className="font-semibold">
                      {u.name} {u.isAdmin && <Chip className="ml-1">администратор</Chip>} {u.disabled && <Chip tone="quiet" className="ml-1">отключён</Chip>}
                    </p>
                    <p className="text-sm text-muted">
                      {u.email} · клиентов: {u.families} · поручений в работе: {u.openRequests}
                    </p>
                  </div>
                  {u.id !== me.id && (
                    <div className="flex gap-2">
                      <Button variant="ghost" className="!min-h-10 text-sm" onClick={() => patch(u.id, { isAdmin: !u.isAdmin })}>
                        {u.isAdmin ? 'Снять права' : 'Сделать администратором'}
                      </Button>
                      <Button variant={u.disabled ? 'soft' : 'ghost'} className="!min-h-10 text-sm" onClick={() => patch(u.id, { disabled: !u.disabled })}>
                        {u.disabled ? 'Включить' : 'Отключить'}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <ErrorText>{err}</ErrorText>
          </div>
        </div>

        <div>
          <Card className="space-y-4">
            <h2 className="text-lg">Добавить сотрудника</h2>
            <Field label="Имя">
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Рабочая почта" hint="Сотрудник получит письмо со ссылкой для пароля.">
              <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Toggle checked={f.isAdmin} onChange={(v) => setF({ ...f, isAdmin: v })}>
              Администратор: управляет командой
            </Toggle>
            <Button icon="plus" disabled={busy || !f.name.trim() || !f.email.trim()} onClick={add}>
              Добавить
            </Button>
            {created && (
              <Notice>
                {created.emailed ? 'Письмо со ссылкой отправлено.' : 'Почта не настроена. Передайте сотруднику ссылку для задания пароля:'}
                {created.setupUrl && <span className="mt-1 block select-all break-all text-sm">{created.setupUrl}</span>}
              </Notice>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export function Account({ me, onChange }) {
  const [name, setName] = useState(me.name)
  const [pw, setPw] = useState({ current: '', next: '' })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const act = async (fn, ok) => {
    setErr('')
    setMsg('')
    try {
      await fn()
      setMsg(ok)
    } catch (e) {
      setErr(e.message)
    }
  }
  return (
    <div className="max-w-[640px]">
      <PageHeader title="Мой аккаунт" subtitle={`${me.email} · ${me.isAdmin ? 'администратор' : 'помощник'}`} />
      <Card className="space-y-4">
        <Field label="Имя">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button variant="soft" disabled={!name.trim() || name === me.name} onClick={() => act(async () => { await api('PATCH', '/api/me', { name: name.trim() }); onChange({ ...me, name: name.trim() }) }, 'Имя сохранено')}>
          Сохранить имя
        </Button>
      </Card>
      <H>Пароль</H>
      <Card className="space-y-4">
        <Field label="Текущий пароль">
          <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
        </Field>
        <Field label="Новый пароль" hint="Не короче 8 символов. Остальные устройства будут отключены.">
          <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
        </Field>
        <Button variant="soft" disabled={!pw.current || pw.next.length < 8} onClick={() => act(async () => { await api('POST', '/api/me/password', { current: pw.current, next: pw.next }); setPw({ current: '', next: '' }) }, 'Пароль изменён')}>
          Сменить пароль
        </Button>
      </Card>
      <div className="mt-4 space-y-3">
        <ErrorText>{err}</ErrorText>
        {msg && <Notice>{msg}</Notice>}
      </div>
    </div>
  )
}
