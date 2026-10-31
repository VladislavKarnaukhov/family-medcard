import { useEffect, useState } from 'react'
import { Button, Card, ErrorText, Field, Notice, Toggle } from '../components/ui'
import { Footer, Wordmark } from '../components/Layout'
import { RangeBar } from '../components/RangeBar'
import { api } from '../lib/api'
import { actions, useStore } from '../lib/store'
import { DocLink } from './Legal'
import { OtpSign } from './ConsentGate'

const ACCESS_TEXT = { view: 'только просмотр', add: 'просмотр и добавление документов' }

// Вход и регистрация: на компьютере слева текстовая колонка с примером строки результата, справа форма.
export function AuthShell({ children, wide = false, headline = 'Заведите маму за 5 минут', sentence = 'Лекарства, отметки приёма и сводка для врача. Вы видите, что принято сегодня, а доступ остаётся у вас.', brand = '', sample = true }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 flex-col lg:flex-row">
        <section className="bg-sunken px-6 pb-6 pt-6 lg:flex lg:w-[46%] lg:max-w-[620px] lg:flex-col lg:px-16 lg:py-14">
          <div className="flex items-center gap-3">
            <Wordmark />
            {brand && <span className="rounded border border-line px-2 py-0.5 text-xs text-muted">{brand}</span>}
          </div>
          <div className="mt-auto hidden max-w-[26rem] lg:block">
            <h2 className="text-[2.75rem] leading-[1.05] tracking-[-0.04em]">{headline}</h2>
            <p className="mt-4 text-[1.05rem] text-muted">{sentence}</p>
            {sample && (
              <div className="mt-10 border-t border-line pt-4" aria-label="Пример строки на экране «Сегодня»">
                <p className="mb-2 text-xs text-muted">Пример экрана «Сегодня»</p>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold">Утро · Метформин, 500 мг</p>
                  <p className="text-sm font-medium text-accent-dark">Принято в 08:12</p>
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-3">
                  <p className="font-semibold">Вечер · Метформин, 500 мг</p>
                  <p className="text-sm text-muted">в 20:00</p>
                </div>
              </div>
            )}
          </div>
          <p className="mt-4 text-lg font-medium lg:hidden">{headline}</p>
        </section>
        <section className="flex flex-1 items-start justify-center px-4 py-8 lg:items-center lg:px-12">
          <div className={`w-full ${wide ? 'max-w-[560px]' : 'max-w-[440px]'}`}>{children}</div>
        </section>
      </div>
      <Footer />
    </div>
  )
}

export const STAFF_SHELL = {
  headline: 'Рабочее место помощников',
  sentence: 'Очередь диалогов, внесение показателей из бланков и поручения клиентов. Каждое открытие семьи записывается в журнал владельца.',
  brand: 'Сотрудники',
  sample: false,
}

export function AuthForm({ invite, onDone, startMode }) {
  const [mode, setMode] = useState(startMode || 'login')
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [terms, setTerms] = useState(false)
  const [pd, setPd] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'forgot') {
        await api('POST', '/api/auth/forgot', { email: f.email })
        setInfo('Если такой адрес зарегистрирован, мы отправили на него письмо со ссылкой для нового пароля.')
      } else if (mode === 'login') {
        await actions.login(f.email, f.password)
        if (invite) await actions.acceptInvite(invite)
        onDone?.()
      } else {
        await actions.register({ ...f, inviteToken: invite || undefined, consents: { terms, consent_pd: pd } })
        onDone?.()
      }
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode !== 'forgot' && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-paper p-1" role="tablist">
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
              className={`min-h-12 rounded-lg text-[0.95rem] font-medium transition-colors ${mode === k ? 'bg-white text-accent-dark shadow-sm' : 'text-muted'}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      {mode === 'forgot' && (
        <div>
          <h2 className="text-xl">Восстановление пароля</h2>
          <p className="mt-1 text-muted">Укажите почту аккаунта, мы пришлём ссылку для нового пароля.</p>
        </div>
      )}
      {mode === 'register' && (
        <Field label="Как вас зовут">
          <input value={f.name} onChange={set('name')} autoComplete="name" required />
        </Field>
      )}
      <Field label="Email">
        <input type="email" value={f.email} onChange={set('email')} autoComplete="email" required />
      </Field>
      {mode !== 'forgot' && (
        <Field label="Пароль" hint={mode === 'register' ? 'Не короче 8 символов' : undefined}>
          <input type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : undefined} />
        </Field>
      )}
      {mode === 'register' && (
        <div className="space-y-3 rounded-xl bg-paper p-4">
          <Toggle checked={terms} onChange={setTerms}>
            Принимаю <DocLink id="terms">пользовательское соглашение</DocLink> и ознакомился(лась) с <DocLink id="privacy">политикой обработки персональных данных</DocLink>
          </Toggle>
          <Toggle checked={pd} onChange={setPd}>
            Даю <DocLink id="consent_pd">согласие на обработку моих персональных данных</DocLink> (имя, email, технические данные) для работы аккаунта
          </Toggle>
          <p className="text-sm text-muted">Согласие на обработку данных о здоровье вы подпишете отдельно, после регистрации.</p>
        </div>
      )}
      <ErrorText>{err}</ErrorText>
      {info && <Notice>{info}</Notice>}
      <Button type="submit" big disabled={busy || (mode === 'register' && !(terms && pd))}>
        {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : mode === 'register' ? 'Создать аккаунт' : 'Отправить ссылку'}
      </Button>
      {mode === 'login' && (
        <button type="button" onClick={() => setMode('forgot')} className="block min-h-12 w-full text-center text-[0.95rem] font-medium text-accent-dark hover:underline">
          Забыли пароль?
        </button>
      )}
      {mode === 'forgot' && (
        <button type="button" onClick={() => setMode('login')} className="block min-h-12 w-full text-center text-[0.95rem] font-medium text-accent-dark hover:underline">
          Вернуться ко входу
        </button>
      )}
    </form>
  )
}

export default function AuthScreen() {
  return (
    <AuthShell>
      <h1 className="mb-1 text-[1.75rem]">Добро пожаловать</h1>
      <p className="mb-6 text-muted">Войдите или создайте аккаунт, чтобы вести досье семьи.</p>
      <Card className="!p-6">
        <AuthForm />
      </Card>
    </AuthShell>
  )
}

export function VerifyScreen({ token }) {
  const [res, setRes] = useState(null)
  useEffect(() => {
    api('POST', '/api/auth/verify', { token }).then(() => setRes({ ok: true })).catch((e) => setRes({ err: e.message }))
  }, [token])
  return (
    <AuthShell>
      <h1 className="mb-3 text-[1.75rem]">Подтверждение почты</h1>
      {!res ? <p className="text-muted">Проверяем ссылку…</p> : res.ok ? <Notice>Адрес подтверждён. Спасибо!</Notice> : <ErrorText>{res.err}</ErrorText>}
      <a className="mt-4 inline-flex min-h-12 items-center font-medium text-accent-dark hover:underline" href="#/">
        Перейти в приложение
      </a>
    </AuthShell>
  )
}

export function ResetScreen({ token, staff = false }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await api('POST', '/api/auth/reset', { token, password: pw })
      setDone(true)
    } catch (e2) {
      setErr(e2.message)
    }
  }
  return (
    <AuthShell {...(staff ? STAFF_SHELL : {})}>
      <h1 className="mb-1 text-[1.75rem]">Новый пароль</h1>
      {done ? (
        <div className="mt-4 space-y-4">
          <Notice>Пароль сохранён. Теперь можно войти.</Notice>
          <a className="inline-flex min-h-12 items-center rounded-xl bg-accent px-5 font-medium text-white" href={staff ? '/staff/#/' : '#/'} onClick={() => staff && window.location.reload()}>
            Перейти ко входу
          </a>
        </div>
      ) : (
        <Card className="mt-4 !p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Новый пароль" hint="Не короче 8 символов">
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} required />
            </Field>
            <ErrorText>{err}</ErrorText>
            <Button type="submit" big disabled={pw.length < 8}>
              Сохранить пароль
            </Button>
          </form>
        </Card>
      )}
    </AuthShell>
  )
}

export function InviteScreen({ token, user }) {
  const store = useStore()
  const [step, setStep] = useState('')
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
      if (info.self && !info.selfConfirmed) setStep('consent')
      else window.location.hash = '#/'
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  if (err && !info)
    return (
      <AuthShell>
        <h1 className="mb-2 text-[1.75rem]">Приглашение недействительно</h1>
        <p className="text-muted">{err}. Попросите человека, который вас пригласил, создать новую ссылку.</p>
        <a className="mt-4 inline-flex min-h-12 items-center font-medium text-accent-dark hover:underline" href="#/">
          На главную
        </a>
      </AuthShell>
    )
  if (!info)
    return (
      <AuthShell>
        <p className="text-muted">Загружаем приглашение…</p>
      </AuthShell>
    )

  if (step === 'consent' && store.me?.selfProfileId)
    return (
      <AuthShell wide>
        <h1 className="mb-2 text-[1.75rem]">Ваше согласие</h1>
        <p className="mb-5 text-muted">Данные о вашем здоровье вносятся в сервис. Подтвердите, что вы согласны. Код придёт на вашу почту ({store.user?.email}). Согласие можно отозвать в любой момент в разделе «Мои данные».</p>
        <Card>
          <OtpSign docId="consent_subject" startUrl={`/api/profiles/${store.me.selfProfileId}/self-consent/start`} signUrl={`/api/profiles/${store.me.selfProfileId}/self-consent/sign`} onDone={() => (window.location.hash = '#/')} agreeText="Я прочитал(а) документ и согласен(на) на обработку данных о состоянии моего здоровья в этом сервисе." />
        </Card>
        <button className="mt-4 min-h-12 font-medium text-muted hover:underline" onClick={() => (window.location.hash = '#/')}>Подтвердить позже</button>
      </AuthShell>
    )

  if (info.self)
    return (
      <AuthShell wide>
        <h1 className="mb-4 text-[2rem] leading-tight">{info.inviter} приглашает вас в «Близкие»</h1>
        <Card className="mb-5 space-y-3 text-lg">
          <p>Это сервис, где вы сможете отмечать, что приняли лекарства, и записывать, как прошёл день. Родные увидят это и смогут вам помочь.</p>
          <p>Кто увидит ваши данные: {info.viewers.join(', ')}, а также помощник сервиса. Каждое открытие записывается в журнал, который видите и вы.</p>
          <p className="text-muted">Согласие можно отозвать в любой момент в разделе «Мои данные».</p>
        </Card>
        <ErrorText>{err}</ErrorText>
        {user ? (
          <Button big disabled={busy} onClick={accept}>
            Продолжить как {user.name}
          </Button>
        ) : (
          <Card className="!p-6">
            <p className="mb-4 text-muted">Создайте вход, чтобы продолжить. Пароль нужен один раз, дальше вы останетесь в системе.</p>
            <AuthForm invite={token} startMode="register" onDone={() => (info.selfConfirmed ? (window.location.hash = '#/') : setStep('consent'))} />
          </Card>
        )}
      </AuthShell>
    )

  return (
    <AuthShell wide>
      <h1 className="mb-4 text-[1.75rem]">{info.inviter} приглашает вас в круг заботы</h1>
      <Card className="mb-5 space-y-2">
        <p>
          Ваша роль: <strong>{info.role}</strong>
        </p>
        <p>
          Доступ: {ACCESS_TEXT[info.access]}
          {info.accessDays ? `, на ${info.accessDays} дн.` : ', без срока'}
        </p>
        <p>Профили: {info.profiles.join(', ') || '—'}</p>
        <div className="stitch-h" aria-hidden />
        <p className="text-sm text-muted">Владелец видит в журнале, когда вы открываете данные, и может в любой момент закрыть доступ.</p>
      </Card>
      <ErrorText>{err}</ErrorText>
      {user ? (
        <Button big disabled={busy} onClick={accept}>
          Принять приглашение как {user.name}
        </Button>
      ) : (
        <Card className="!p-6">
          <p className="mb-4 text-muted">Войдите или создайте аккаунт, чтобы принять приглашение.</p>
          <AuthForm invite={token} startMode="register" onDone={() => (window.location.hash = '#/')} />
        </Card>
      )}
    </AuthShell>
  )
}
