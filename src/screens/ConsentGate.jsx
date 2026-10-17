import { useState } from 'react'
import { Button, Card, Field } from '../components/ui'
import { api } from '../lib/api'
import { actions, refresh } from '../lib/store'
import { DocLink } from './Legal'

// Подпись согласия одноразовым кодом: общая часть для владельца и для человека, чьи данные внесены.
export function OtpSign({ docId, startUrl, signUrl, extra = {}, onDone, startBody = {}, agreeText }) {
  const [agree, setAgree] = useState(false)
  const [sent, setSent] = useState(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const start = async () => {
    setBusy(true)
    setErr('')
    try {
      setSent(await api('POST', startUrl, startBody))
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  const sign = async () => {
    setBusy(true)
    setErr('')
    try {
      await api('POST', signUrl, { code, agree: true, ...extra })
      await onDone()
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="!mt-1 !h-6 !min-h-0 !w-6 shrink-0" />
        <span>
          {agreeText} <DocLink id={docId}>Прочитать документ</DocLink>
        </span>
      </label>
      {!sent ? (
        <Button className="w-full" disabled={!agree || busy} onClick={start}>
          Получить код для подписи
        </Button>
      ) : (
        <>
          <p className="text-sm text-muted">Код отправлен на {sent.to}. Он действует 10 минут.</p>
          {sent.devCode && (
            <p className="rounded-xl bg-accent-soft p-3 text-sm">
              Демо: письма пока не отправляются. Ваш код <strong>{sent.devCode}</strong> (в рабочей версии он придёт только на почту).
            </p>
          )}
          <Field label="Код из письма">
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
          </Field>
          <Button className="w-full" disabled={busy || code.length !== 6} onClick={sign}>
            Подписать согласие
          </Button>
          <button className="min-h-11 text-accent-dark underline underline-offset-2" onClick={start} disabled={busy}>
            Отправить код ещё раз
          </button>
        </>
      )}
      {err && (
        <p role="alert" className="rounded-xl bg-alert-soft p-3 text-alert">
          {err}
        </p>
      )}
    </div>
  )
}

export default function ConsentGate() {
  return (
    <div className="space-y-4 py-6">
      <h1 className="text-2xl font-semibold leading-tight">Согласие на обработку данных о здоровье</h1>
      <p className="text-muted">
        Сведения о здоровье — особая категория персональных данных. Чтобы хранить документы и результаты анализов, нам нужно ваше отдельное письменное согласие. Мы оформляем его электронной подписью: вы подтверждаете его кодом, отправленным на вашу почту.
      </p>
      <Card>
        <OtpSign
          docId="consent_health"
          startUrl="/api/consents/health/start"
          signUrl="/api/consents/health/sign"
          onDone={refresh}
          agreeText="Я прочитал(а) документ и даю отдельное согласие на обработку данных о состоянии моего здоровья."
        />
      </Card>
      <p className="text-sm text-muted">Без этого согласия пользоваться сервисом нельзя. Вы можете удалить аккаунт в разделе «Мои данные и согласия».</p>
      <div className="flex gap-4">
        <a className="text-accent-dark underline underline-offset-2" href="#/privacy">
          Мои данные и согласия
        </a>
        <button className="text-accent-dark underline underline-offset-2" onClick={actions.logout}>
          Выйти
        </button>
      </div>
    </div>
  )
}
