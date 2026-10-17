import { useEffect, useState } from 'react'
import { Button, Card, Empty, Field, H } from '../components/ui'
import { api } from '../lib/api'
import { actions, can, refresh } from '../lib/store'
import { DOCS } from '../legal/docs.js'
import { fmtDate, fmtDateTime } from '../lib/format'
import { DocLink } from './Legal'
import { OtpSign } from './ConsentGate'

const METHOD = { checkbox: 'отметка в форме', otp: 'электронная подпись (код)', attestation: 'подтверждение владельца' }
const REQ_TYPES = [
  ['access', 'Получить сведения о моих данных'],
  ['correction', 'Уточнить или исправить данные'],
  ['deletion', 'Удалить данные'],
  ['revoke', 'Отозвать согласие'],
  ['other', 'Другое'],
]

function ConsentList({ rows, empty }) {
  if (!rows.length) return <Empty>{empty}</Empty>
  return (
    <ul className="space-y-2">
      {rows.map((c) => (
        <li key={c.id} className="rounded-2xl border border-line bg-card p-3">
          <div className="font-medium">{DOCS[c.docId]?.title || c.docId}</div>
          <div className="text-sm text-muted">
            {fmtDateTime(c.givenAt)} · {METHOD[c.method]} · версия {c.version}
            {c.profile && ` · профиль «${c.profile}»`}
            {c.subject && c.method === 'otp' && ` · подписал(а): ${c.subject}`}
          </div>
          {c.revokedAt && <div className="text-sm text-alert">Отозвано {fmtDateTime(c.revokedAt)}</div>}
        </li>
      ))}
    </ul>
  )
}

export function Stopped({ state }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [resume, setResume] = useState(false)
  return (
    <div className="space-y-4 py-6">
      <h1 className="text-2xl font-semibold leading-tight">Обработка данных остановлена</h1>
      <p className="text-muted">
        Вы отозвали согласие на обработку данных о здоровье. Мы не обрабатываем данные и не открываем их сотрудникам. Данные будут уничтожены не позднее {state.consent.deleteAfter ? fmtDate(state.consent.deleteAfter.slice(0, 10)) : 'чем через 30 дней'}.
      </p>
      <a className="block min-h-12 rounded-xl border border-line bg-card px-4 py-3 text-center" href={`/api/families/${state.familyId}/export`}>
        Скачать мои данные (JSON)
      </a>
      <Card className="space-y-3">
        <p className="font-medium">Удалить всё сейчас</p>
        <Field label="Пароль для подтверждения">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </Field>
        {err && <p role="alert" className="text-alert">{err}</p>}
        <Button
          variant="danger"
          className="w-full"
          onClick={async () => {
            try {
              await actions.deleteAccount(pw)
            } catch (e) {
              setErr(e.message)
            }
          }}
        >
          Удалить аккаунт и данные
        </Button>
      </Card>
      {resume ? (
        <Card>
          <OtpSign docId="consent_health" startUrl="/api/consents/health/start" signUrl="/api/consents/health/sign" onDone={refresh} agreeText="Я передумал(а) и снова даю отдельное согласие на обработку данных о состоянии моего здоровья." />
        </Card>
      ) : (
        <button className="min-h-11 text-accent-dark underline underline-offset-2" onClick={() => setResume(true)}>
          Я передумал(а): вернуть согласие
        </button>
      )}
      <button className="min-h-11 text-accent-dark underline underline-offset-2" onClick={actions.logout}>
        Выйти
      </button>
    </div>
  )
}

export default function Privacy({ state }) {
  const { owner } = can(state)
  const [data, setData] = useState(null)
  const [req, setReq] = useState({ type: 'access', text: '' })
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    api('GET', '/api/consents').then(setData).catch(() => setData({ own: [], about: [] }))
  }, [state.consent?.ok])

  const sendRequest = async () => {
    setErr('')
    try {
      await api('POST', '/api/data-requests', req)
      setSent(true)
      setReq({ type: 'access', text: '' })
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <div className="py-4">
      <h1 className="text-2xl font-semibold">Мои данные и согласия</h1>
      <p className="text-muted">Здесь видно, на что вы согласились, и можно скачать, исправить или удалить данные.</p>

      <H>Документы</H>
      <ul className="space-y-1">
        {['terms', 'privacy', 'consent_pd', 'consent_health'].map((id) => (
          <li key={id}>
            <DocLink id={id} />
          </li>
        ))}
        <li>
          <a className="text-accent-dark underline underline-offset-2" href="#/legal">Все документы</a>
        </li>
      </ul>

      <H>Мои согласия</H>
      {!data ? <p className="text-muted">Загрузка…</p> : <ConsentList rows={data.own} empty="Записей нет." />}

      {owner && data && (
        <>
          <H>Согласия за других людей</H>
          <p className="mb-2 text-sm text-muted">Подтверждения, которые даны или заявлены по профилям вашей семьи.</p>
          <ConsentList rows={data.about.filter((c) => c.profile)} empty="Пока нет." />
        </>
      )}

      <H>Запрос по персональным данным</H>
      <Card className="space-y-3">
        <p className="text-sm text-muted">Ответим в течение 10 рабочих дней на почту аккаунта.</p>
        <Field label="Что нужно">
          <select value={req.type} onChange={(e) => setReq({ ...req, type: e.target.value })}>
            {REQ_TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Подробности">
          <textarea value={req.text} onChange={(e) => setReq({ ...req, text: e.target.value })} maxLength={2000} />
        </Field>
        {err && <p role="alert" className="text-alert">{err}</p>}
        {sent && <p className="rounded-xl bg-accent-soft p-3 text-sm">Запрос отправлен.</p>}
        <Button className="w-full" onClick={sendRequest}>
          Отправить запрос
        </Button>
      </Card>

      {owner && (
        <>
          <H>Скачать данные</H>
          <a className="block min-h-12 rounded-xl border border-line bg-card px-4 py-3 text-center" href={`/api/families/${state.familyId}/export`}>
            Скачать всё в формате JSON
          </a>

          <H>Отозвать согласие</H>
          <Card className="space-y-2">
            <p>Отзыв согласия на обработку данных о здоровье останавливает обработку. Данные будут уничтожены в течение 30 дней, а пользоваться сервисом станет нельзя.</p>
            <Button
              variant="danger"
              className="w-full"
              onClick={async () => {
                if (confirm('Остановить обработку данных и запланировать удаление?')) {
                  await api('POST', '/api/consents/health/revoke', {})
                  await refresh()
                }
              }}
            >
              Отозвать согласие
            </Button>
          </Card>
        </>
      )}

      <H>Удалить аккаунт</H>
      <Card className="space-y-3">
        <p>{owner ? 'Будут удалены аккаунт, все профили семьи, документы, файлы и переписка.' : 'Будет удалён ваш аккаунт и ваш доступ к семьям.'}</p>
        <Field label="Пароль для подтверждения">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </Field>
        {msg && <p role="alert" className="text-alert">{msg}</p>}
        <Button
          variant="danger"
          className="w-full"
          disabled={!pw}
          onClick={async () => {
            if (!confirm('Удалить аккаунт и данные без возможности восстановления?')) return
            try {
              await actions.deleteAccount(pw)
            } catch (e) {
              setMsg(e.message)
            }
          }}
        >
          Удалить аккаунт и данные
        </Button>
      </Card>
    </div>
  )
}
