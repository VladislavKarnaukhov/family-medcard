import { useEffect, useState } from 'react'
import { Card, Field, Notice } from '../components/ui'
import { api } from '../lib/api'
import { AuthShell } from './Auth'
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

  if (err)
    return (
      <AuthShell>
        <h1 className="mb-2 text-[1.75rem]">Ссылка недоступна</h1>
        <p className="text-muted">{err}</p>
      </AuthShell>
    )
  if (!info)
    return (
      <AuthShell>
        <p className="text-muted">Загрузка…</p>
      </AuthShell>
    )
  if (done)
    return (
      <AuthShell>
        <h1 className="mb-2 text-[1.75rem]">Спасибо, согласие записано</h1>
        <p className="text-muted">Вы можете отозвать его в любой момент, написав Оператору (адрес указан в политике обработки данных).</p>
        <p className="mt-4 text-muted">Если вы хотите сами отмечать приём лекарств и видеть свои данные, попросите того, кто ведёт ваше досье, отправить вам приглашение «Сам(а)». Войти можно будет с этой же почтой.</p>
      </AuthShell>
    )

  const ready = f.name.trim().length >= 5 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)
  return (
    <AuthShell wide>
      <h1 className="mb-2 text-[1.75rem]">{info.owner} ведёт ваше досье в сервисе «Близкие»</h1>
      <p className="mb-6 text-muted">
        Для этого нужно ваше согласие на обработку данных о состоянии здоровья (профиль «{info.profile}»). Вы подтверждаете его лично одноразовым кодом, отправленным на вашу почту.
      </p>
      <Card className="space-y-4 !p-6">
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
          <Notice tone="quiet">Заполните имя и почту, чтобы продолжить.</Notice>
        )}
      </Card>
    </AuthShell>
  )
}
