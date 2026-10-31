import { useState } from 'react'
import { Button, Card, ErrorText, Field, Notice, Toggle } from '../components/ui'
import { api } from '../lib/api'
import { actions, refresh, useStore } from '../lib/store'
import { AuthShell } from './Auth'
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
    <div className="space-y-4">
      <div className="rounded-xl bg-paper p-4">
        <Toggle checked={agree} onChange={setAgree}>
          {agreeText} <DocLink id={docId}>Прочитать документ</DocLink>
        </Toggle>
      </div>
      {!sent ? (
        <Button className="w-full" icon="mail" disabled={!agree || busy} onClick={start}>
          {busy ? 'Отправляем…' : 'Получить код для подписи'}
        </Button>
      ) : (
        <>
          <p className="text-[0.95rem] text-muted">Код отправлен на {sent.to}. Он действует 10 минут.</p>
          {sent.devCode && (
            <Notice>
              Почта на сервере не настроена, поэтому код показан здесь: <strong>{sent.devCode}</strong>. После настройки SMTP он будет приходить только письмом.
            </Notice>
          )}
          <Field label="Код из письма">
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={6} className="!text-center !text-2xl !font-semibold !tracking-[0.4em]" />
          </Field>
          <Button className="w-full" icon="check" disabled={busy || code.length !== 6} onClick={sign}>
            Подписать согласие
          </Button>
          <button className="min-h-12 w-full font-medium text-accent-dark hover:underline" onClick={start} disabled={busy}>
            Отправить код ещё раз
          </button>
        </>
      )}
      <ErrorText>{err}</ErrorText>
    </div>
  )
}

// Экран «Сам(а)»: пока человек не подтвердил своё согласие, работать с профилем нельзя.
export function SelfConsentGate({ profileId }) {
  return (
    <AuthShell wide>
      <h1 className="mb-2 text-[1.75rem]">Ваше согласие</h1>
      <p className="mb-5 text-muted">Данные о вашем здоровье вносятся в сервис. Чтобы отмечать лекарства и писать в дневник, подтвердите согласие: код придёт на вашу почту.</p>
      <Card className="!p-6">
        <OtpSign docId="consent_subject" startUrl={`/api/profiles/${profileId}/self-consent/start`} signUrl={`/api/profiles/${profileId}/self-consent/sign`} onDone={refresh} agreeText="Я прочитал(а) документ и даю согласие на обработку данных о моём здоровье." />
      </Card>
      <div className="mt-3 flex gap-5">
        <a className="inline-flex min-h-12 items-center font-medium text-accent-dark hover:underline" href="#/privacy">
          Мои данные и согласия
        </a>
        <button className="min-h-12 font-medium text-accent-dark hover:underline" onClick={actions.logout}>
          Выйти
        </button>
      </div>
    </AuthShell>
  )
}

export default function ConsentGate({ outdated = false }) {
  return (
    <AuthShell wide>
      <h1 className="mb-2 text-[1.75rem]">{outdated ? 'Документы обновились' : 'Согласие на обработку данных о здоровье'}</h1>
      {outdated && <p className="mb-4 text-muted">Мы изменили редакцию документов. Ваши данные на месте, но чтобы продолжить вносить записи, подпишите согласие в новой редакции. Просматривать данные, выгружать и удалять их можно и сейчас.</p>}
      <p className="mb-6 text-muted">
        Сведения о здоровье — особая категория персональных данных. Чтобы хранить документы и результаты анализов, нам нужно ваше отдельное письменное согласие. Мы оформляем его электронной подписью: вы подтверждаете согласие кодом, отправленным на вашу почту.
      </p>
      <Card className="!p-6">
        <OtpSign docId="consent_health" startUrl="/api/consents/health/start" signUrl="/api/consents/health/sign" onDone={refresh} agreeText="Я прочитал(а) документ и даю отдельное согласие на обработку данных о состоянии моего здоровья." />
      </Card>
      <p className="mt-5 text-sm text-muted">Без этого согласия пользоваться сервисом нельзя. Вы можете удалить аккаунт в разделе «Мои данные и согласия».</p>
      <div className="mt-3 flex gap-5">
        <a className="font-medium text-accent-dark hover:underline" href="#/privacy">
          Мои данные и согласия
        </a>
        <button className="font-medium text-accent-dark hover:underline" onClick={actions.logout}>
          Выйти
        </button>
      </div>
    </AuthShell>
  )
}
