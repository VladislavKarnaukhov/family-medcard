import { useEffect, useState } from 'react'
import { Card, Field } from '../components/ui'
import { api } from '../lib/api'
import { OtpSign } from './ConsentGate'

// Публичная страница: взрослый человек сам подтверждает согласие на обработку своих данных.
export default function SubjectConsent({ token }) {
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [f, setF] = useState({ name: '', email: '' })

  useEffect(() => {
    api('GET', `/api/subject-consent/${token}`).then(setInfo).catch((e) => setErr(e.message))
  }, [token])

  if (err) return <div className="py-8"><h1 className="mb-2 text-2xl font-semibold">Ссылка недоступна</h1><p className="text-muted">{err}</p></div>
  if (!info) return <p className="py-8 text-muted">Загрузка…</p>
  if (done)
    return (
      <div className="space-y-2 py-8">
        <h1 className="text-2xl font-semibold">Спасибо, согласие записано</h1>
        <p className="text-muted">Вы можете отозвать его в любой момент, написав Оператору (адрес указан в политике обработки данных).</p>
      </div>
    )

  const ready = f.name.trim().length >= 5 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)
  return (
    <div className="space-y-4 py-6">
      <h1 className="text-2xl font-semibold leading-tight">{info.owner} ведёт ваше досье в сервисе «Близкие»</h1>
      <p className="text-muted">
        Для этого нужно ваше согласие на обработку данных о состоянии здоровья (профиль «{info.profile}»). Вы подтверждаете его лично одноразовым кодом, отправленным на вашу почту.
      </p>
      <Card className="space-y-3">
        <Field label="Ваше полное имя (ФИО)">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
        </Field>
        <Field label="Ваша электронная почта">
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
        </Field>
        {ready ? (
          <OtpSign
            key={f.email}
            docId="consent_subject"
            startUrl={`/api/subject-consent/${token}/start`}
            signUrl={`/api/subject-consent/${token}/sign`}
            startBody={f}
            extra={f}
            onDone={() => setDone(true)}
            agreeText="Я прочитал(а) документ и даю согласие на обработку данных о состоянии моего здоровья."
          />
        ) : (
          <p className="text-sm text-muted">Заполните имя и почту, чтобы продолжить.</p>
        )}
      </Card>
    </div>
  )
}
