import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmtDate } from '../lib/format'
import Summary from './Summary'

// Публичная страница по ссылке для врача: только сводка выбранного профиля, без входа.
export default function ShareView({ token }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api('GET', `/api/share/${token}`).then(setData).catch((e) => setErr(e.message))
  }, [token])

  if (err)
    return (
      <div className="space-y-2 py-8">
        <h1 className="text-2xl font-semibold">Ссылка недоступна</h1>
        <p className="text-muted">{err}. Попросите пациента или его близких создать новую ссылку.</p>
      </div>
    )
  if (!data) return <p className="py-8 text-muted">Загружаем сводку…</p>

  const profile = data.profiles.find((p) => p.id === data.activeProfileId)
  return (
    <div>
      <p className="no-print mb-2 rounded-xl bg-accent-soft p-3 text-sm">Сводка доступна по временной ссылке до {fmtDate(data.expiresAt.slice(0, 10))}. Только для чтения.</p>
      <Summary state={data} profile={profile} readOnly />
    </div>
  )
}
