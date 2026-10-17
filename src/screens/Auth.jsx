import { useEffect, useState } from 'react'
import { Button, Card, Field } from '../components/ui'
import { api } from '../lib/api'
import { actions } from '../lib/store'
import { DocLink } from './Legal'

const ACCESS_TEXT = { view: 'только просмотр', add: 'просмотр и добавление документов' }

export function AuthForm({ invite, onDone, startMode }) {
  const [mode, setMode] = useState(startMode || 'login')
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [terms, setTerms] = useState(false)
  const [pd, setPd] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await actions.login(f.email, f.password)
        if (invite) await actions.acceptInvite(invite)
      } else {
        await actions.register({ ...f, inviteToken: invite || undefined, consents: { terms, consent_pd: pd } })
      }
      onDone?.()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2" role="tablist">
        {[
          ['login', 'Войти'],
          ['register', 'Создать аккаунт'],
        ].map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={mode === k}
            onClick={() => setMode(k)}
            className={`min-h-12 rounded-xl ${mode === k ? 'bg-accent text-white' : 'border border-line bg-card'}`}
          >
            {l}
          </button>
        ))}
      </div>
      {mode === 'register' && (
        <Field label="Как вас зовут">
          <input value={f.name} onChange={set('name')} autoComplete="name" required />
        </Field>
      )}
      <Field label="Email">
        <input type="email" value={f.email} onChange={set('email')} autoComplete="email" required />
      </Field>
      <Field label="Пароль" hint={mode === 'register' ? 'Не короче 8 символов' : undefined}>
        <input type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : undefined} />
      </Field>
      {mode === 'register' && (
        <div className="space-y-3 rounded-xl bg-paper p-3">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="!mt-1 !h-6 !min-h-0 !w-6 shrink-0" />
            <span className="text-sm">
              Принимаю <DocLink id="terms">пользовательское соглашение</DocLink> и ознакомился(лась) с <DocLink id="privacy">политикой обработки персональных данных</DocLink>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={pd} onChange={(e) => setPd(e.target.checked)} className="!mt-1 !h-6 !min-h-0 !w-6 shrink-0" />
            <span className="text-sm">
              Даю <DocLink id="consent_pd">согласие на обработку моих персональных данных</DocLink> (имя, email, технические данные) для работы аккаунта
            </span>
          </label>
          <p className="text-xs text-muted">Согласие на обработку данных о здоровье вы подпишете отдельно, после регистрации.</p>
        </div>
      )}
      {err && (
        <p role="alert" className="rounded-xl bg-alert-soft p-3 text-alert">
          {err}
        </p>
      )}
      <Button type="submit" big disabled={busy || (mode === 'register' && !(terms && pd))}>
        {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
      </Button>
    </form>
  )
}

export default function AuthScreen() {
  return (
    <div className="space-y-4 py-6">
      <h1 className="text-2xl font-semibold leading-tight">Личный помощник по здоровью вашей семьи</h1>
      <p className="text-muted">
        Помощник собирает документы из клиник и лабораторий, ведёт семейное досье и готовит материалы к визитам к врачу. Вы
        решаете, кому из близких открыть доступ.
      </p>
      <Card>
        <AuthForm />
      </Card>
    </div>
  )
}

export function InviteScreen({ token, user }) {
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('GET', `/api/invites/${token}`).then(setInfo).catch((e) => setErr(e.message))
  }, [token])

  const accept = async () => {
    setBusy(true)
    try {
      await actions.acceptInvite(token)
      window.location.hash = '#/'
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  if (err && !info)
    return (
      <div className="space-y-3 py-6">
        <h1 className="text-2xl font-semibold">Приглашение недействительно</h1>
        <p className="text-muted">{err}. Попросите человека, который вас пригласил, создать новую ссылку.</p>
        <a className="text-accent-dark underline underline-offset-2" href="#/">
          На главную
        </a>
      </div>
    )
  if (!info) return <p className="py-6 text-muted">Загружаем приглашение…</p>

  return (
    <div className="space-y-4 py-6">
      <h1 className="text-2xl font-semibold leading-tight">{info.inviter} приглашает вас в круг заботы</h1>
      <Card className="space-y-1">
        <div>
          Ваша роль: <strong>{info.role}</strong>
        </div>
        <div>
          Доступ: {ACCESS_TEXT[info.access]}
          {info.accessDays ? `, на ${info.accessDays} дн.` : ', без срока'}
        </div>
        <div>Профили: {info.profiles.join(', ') || '—'}</div>
        <p className="pt-2 text-sm text-muted">Владелец видит в журнале, когда вы открываете данные, и может в любой момент закрыть доступ.</p>
      </Card>
      {err && (
        <p role="alert" className="rounded-xl bg-alert-soft p-3 text-alert">
          {err}
        </p>
      )}
      {user ? (
        <Button big disabled={busy} onClick={accept}>
          Принять приглашение как {user.name}
        </Button>
      ) : (
        <Card>
          <p className="mb-3 text-muted">Войдите или создайте аккаунт, чтобы принять приглашение.</p>
          <AuthForm invite={token} startMode="register" onDone={() => (window.location.hash = '#/')} />
        </Card>
      )}
    </div>
  )
}
