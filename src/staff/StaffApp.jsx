import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Button, ErrorText, Field, Spinner, useRoute } from '../components/ui'
import { Icon } from '../components/icons'
import { Wordmark } from '../components/Layout'
import { AuthShell, ResetScreen, STAFF_SHELL } from '../screens/Auth'
import { usePoll } from './hooks'
import Inbox from './Inbox'
import Board from './Board'
import { DocQueue, Process } from './Docs'
import { DataRequests, Team, Account } from './Admin'

function Login({ onDone }) {
  const [f, setF] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      if (forgot) {
        await api('POST', '/api/auth/forgot', { email: f.email })
        setSent(true)
      } else {
        const me = await api('POST', '/api/auth/login', f)
        if (me.user.role !== 'staff') {
          await api('POST', '/api/auth/logout', {})
          throw new Error('Эта учётная запись не относится к сотрудникам')
        }
        onDone(me.user)
      }
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthShell {...STAFF_SHELL}>
      <h1 className="mb-1 text-[1.75rem]">{forgot ? 'Восстановление пароля' : 'Вход для сотрудников'}</h1>
      <p className="mb-6 text-muted">{forgot ? 'Мы пришлём ссылку для нового пароля на рабочую почту.' : 'Используйте рабочую почту и пароль.'}</p>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-card p-6 ">
        <Field label="Email">
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="username" required />
        </Field>
        {!forgot && (
          <Field label="Пароль">
            <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" required />
          </Field>
        )}
        <ErrorText>{err}</ErrorText>
        {sent && <p className="rounded-xl bg-accent-soft px-4 py-3 text-[0.95rem]">Если адрес зарегистрирован, письмо отправлено.</p>}
        <Button type="submit" big disabled={busy}>
          {forgot ? 'Отправить ссылку' : 'Войти'}
        </Button>
        <button type="button" onClick={() => (setForgot(!forgot), setSent(false), setErr(''))} className="block min-h-11 w-full text-center text-[0.95rem] font-medium text-accent-dark hover:underline">
          {forgot ? 'Вернуться ко входу' : 'Забыли пароль?'}
        </button>
      </form>
    </AuthShell>
  )
}

const NAV = [
  ['', 'Входящие', 'inbox'],
  ['requests', 'Поручения', 'board'],
  ['docs', 'Документы', 'sheet'],
  ['data', 'Запросы по данным', 'shield'],
]

export default function StaffApp() {
  const [user, setUser] = useState(undefined)
  const route = useRoute()

  useEffect(() => {
    api('GET', '/api/me')
      .then((m) => setUser(m.user.role === 'staff' ? m.user : null))
      .catch(() => setUser(null))
    const out = () => setUser(null)
    window.addEventListener('staff-auth', out)
    return () => window.removeEventListener('staff-auth', out)
  }, [])

  const [inbox, reloadInbox] = usePoll(() => (user ? api('GET', '/api/staff/inbox') : Promise.resolve(null)), 5000, [user?.id])
  const [staff] = usePoll(() => (user ? api('GET', '/api/staff/staff-list') : Promise.resolve([])), 60000, [user?.id])

  if (route[0] === 'reset') return <ResetScreen token={route[1]} staff />
  if (user === undefined)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  if (!user) return <Login onDone={setUser} />

  const view = route[0] || ''
  const unread = (inbox || []).filter((r) => r.unread).length
  const pending = (inbox || []).reduce((s, r) => s + r.pendingDocs, 0)
  const badge = { '': unread, docs: pending }
  const items = [...NAV, ...(user.isAdmin ? [['team', 'Команда', 'users']] : [])]
  const active = view === 'f' ? '' : view === 'process' ? 'docs' : view
  const logout = async () => {
    await api('POST', '/api/auth/logout', {})
    setUser(null)
  }

  const content =
    view === 'requests' ? (
      <Board me={user} staff={staff || []} />
    ) : view === 'docs' ? (
      <DocQueue />
    ) : view === 'process' ? (
      <Process id={route[1]} />
    ) : view === 'data' ? (
      <DataRequests />
    ) : view === 'team' && user.isAdmin ? (
      <Team me={user} />
    ) : view === 'account' ? (
      <Account me={user} onChange={setUser} />
    ) : null

  return (
    <div className="min-h-screen lg:flex lg:h-screen">
      <aside className="flex shrink-0 flex-col border-b border-line bg-card lg:w-[240px] lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:px-3 lg:py-0">
          <Wordmark />
          <p className="hidden pt-1 text-xs text-muted lg:block">Рабочее место</p>
          <button onClick={logout} aria-label="Выйти" className="flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-paper lg:hidden">
            <Icon name="logout" size={19} />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:mt-7 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0" aria-label="Разделы">
          {items.map(([to, label, icon]) => (
            <a
              key={to}
              href={'#/' + to}
              aria-current={active === to ? 'page' : undefined}
              className={`flex min-h-10 shrink-0 items-center gap-3 rounded-md px-3 text-[0.95rem] transition-colors ${active === to ? 'bg-paper font-semibold text-ink' : 'text-muted hover:bg-paper hover:text-ink'}`}
            >
              <Icon name={icon} size={19} />
              <span className="lg:flex-1">{label}</span>
              {badge[to] > 0 && <span className="rounded-md bg-accent px-1.5 text-xs font-semibold text-white">{badge[to]}</span>}
            </a>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-line pt-4 lg:block">
          <a href="#/account" className="flex items-center gap-3 rounded-md px-3 py-1.5 hover:bg-paper">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.isAdmin ? 'Администратор' : 'Помощник'}</p>
            </div>
          </a>
          <button onClick={logout} className="mt-1 flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-muted hover:bg-paper hover:text-ink">
            <Icon name="logout" size={18} />
            Выйти
          </button>
        </div>
      </aside>

      <main className={`min-w-0 flex-1 ${content ? 'px-4 py-6 lg:overflow-y-auto lg:px-10 lg:py-8' : 'lg:overflow-hidden'}`}>
        {content ? <div className="mx-auto w-full max-w-[1100px]">{content}</div> : <Inbox fid={view === 'f' ? route[1] : null} me={user} staff={staff || []} inbox={inbox} reloadInbox={reloadInbox} />}
      </main>
    </div>
  )
}
