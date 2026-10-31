import { useEffect, useState } from 'react'
import { Button, Card, Empty, ErrorText, Field, H, Notice, PageHeader, Toggle } from '../components/ui'
import { Icon } from '../components/icons'
import { api } from '../lib/api'
import { actions, can, refresh } from '../lib/store'
import { DOCS } from '../legal/docs.js'
import { fmtDate, fmtDateTime } from '../lib/format'
import { TIMEZONES } from '../lib/care'
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
  if (!rows.length) return <p className="text-muted">{empty}</p>
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet ">
      {rows.map((c) => (
        <li key={c.id} className="px-4 py-3">
          <p className="font-medium">{DOCS[c.docId]?.title || c.docId}</p>
          <p className="text-sm text-muted">
            {fmtDateTime(c.givenAt)} · {METHOD[c.method]} · версия {c.version}
            {c.profile && ` · профиль «${c.profile}»`}
            {c.subject && c.method === 'otp' && ` · подписал(а): ${c.subject}`}
          </p>
          {c.revokedAt && <p className="text-sm font-medium text-alert">Отозвано {fmtDateTime(c.revokedAt)}</p>}
        </li>
      ))}
    </ul>
  )
}

function Settings({ state }) {
  const { owner, self } = can(state)
  const u = state.user
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem('blizkie-sound') === '1'
    } catch {
      return false
    }
  })
  const [err, setErr] = useState('')
  const selfProfile = state.profiles.find((p) => p.id === state.me?.selfProfileId)
  const shareProfile = selfProfile || (owner ? state.profiles.find((p) => p.basis === 'self') : null)
  const [peerOk, setPeerOk] = useState(false)
  const moodProfile = selfProfile || (owner ? state.profiles.find((p) => !p.hasSelfUser) : null)
  const guard = (fn) => async (...a) => {
    setErr('')
    try {
      await fn(...a)
    } catch (e) {
      setErr(e.message)
    }
  }
  return (
    <Card className="space-y-6">
      <div className="space-y-3">
        <Field label="Письма о событиях" hint="В письмах нет сведений о здоровье: только факт события и ссылка.">
          <select value={u.emailEvents} onChange={guard((e) => actions.setEmailEvents(e.target.value, u.emailIntake))}>
            <option value="instant">Сразу, не чаще раза в 15 минут</option>
            <option value="daily">Раз в день сводкой</option>
            <option value="off">Не присылать</option>
          </select>
        </Field>
        {(self || state.profiles.some((p) => p.hasSelfUser === false)) && (
          <Toggle checked={u.emailIntake} onChange={guard((v) => actions.setEmailIntake(v))}>
            Напоминать о приёме лекарств письмом в назначенное время
          </Toggle>
        )}
        <Toggle checked={sound} onChange={(v) => { setSound(v); try { localStorage.setItem('blizkie-sound', v ? '1' : '0') } catch { /* хранилище недоступно */ } }}>
          Короткий звук при напоминании на открытом сайте
        </Toggle>
        <p className="text-sm text-muted">Напоминания приходят, когда сайт открыт, или письмом.</p>
      </div>
      <div className="border-t border-line pt-5">
        <Toggle checked={u.simpleMode} onChange={guard((v) => actions.setSimpleMode(v))}>
          Простой режим: крупный шрифт, один экран «Сегодня»
        </Toggle>
      </div>
      {moodProfile && (
        <div className="border-t border-line pt-5">
          <Toggle checked={moodProfile.notifyBadMood} onChange={guard((v) => actions.setNotifyBadMood(moodProfile.id, v))}>
            Сообщать близким, если {self ? 'я отмечаю' : `${moodProfile.name} отмечает`} самочувствие «Плохо»
          </Toggle>
        </div>
      )}
      {shareProfile && (
        <div className="space-y-3 border-t border-line pt-5">
          <p className="font-medium">Общая карта</p>
          <p className="text-sm text-muted">Участники общей карты со своим входом могут видеть анализы, показатели и замеры давления друг друга. Показ взаимный: вы видите чужие результаты, только если разрешили показ своих. Дневник, лекарства и документы не показываются.</p>
          {shareProfile.sharePeers ? (
            <Button variant="ghost" onClick={guard(() => actions.setSharePeers(shareProfile.id, false))}>Выключить показ моих результатов</Button>
          ) : (
            <>
              <Toggle checked={peerOk} onChange={setPeerOk}>
                Разрешаю показывать мои результаты другим участникам общей карты. <DocLink id="consent_peers">Документ</DocLink>
              </Toggle>
              <Button disabled={!peerOk || shareProfile.consentStatus === 'attested'} onClick={guard(() => actions.setSharePeers(shareProfile.id, true))}>Включить показ</Button>
              {shareProfile.consentStatus === 'attested' && <p className="text-sm text-muted">Сначала подтвердите согласие на обработку данных.</p>}
            </>
          )}
        </div>
      )}
      {owner && (
        <div className="border-t border-line pt-5">
          <Field label="Часовой пояс семьи" hint="По нему считаются времена приёма лекарств и визитов.">
            <select value={state.family?.timezone || 'Europe/Moscow'} onChange={guard((e) => actions.setTimezone(e.target.value))}>
              {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>
      )}
      <ErrorText>{err}</ErrorText>
    </Card>
  )
}

function ViewLog({ state }) {
  const log = state.accessLog.slice(0, 15)
  if (!log.length) return <p className="text-muted">Пока записей нет.</p>
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet">
      {log.map((l) => (
        <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3">
          <p className="text-[0.95rem]"><span className="font-medium">{l.who}</span><span className="text-muted">: {l.action}</span></p>
          <p className="text-sm text-muted">{fmtDateTime(l.at)}</p>
        </li>
      ))}
    </ul>
  )
}

function Account({ state }) {
  const [name, setName] = useState(state.user.name)
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
    <Card className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <Field label="Имя">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <p className="text-sm text-muted">Почта: {state.user.email}</p>
        <Button variant="soft" disabled={!name.trim() || name === state.user.name} onClick={() => act(() => actions.updateName(name.trim()), 'Имя сохранено')}>
          Сохранить имя
        </Button>
      </div>
      <div className="space-y-3">
        <Field label="Текущий пароль">
          <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
        </Field>
        <Field label="Новый пароль" hint="Не короче 8 символов. Остальные устройства будут отключены.">
          <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
        </Field>
        <Button variant="soft" disabled={!pw.current || pw.next.length < 8} onClick={() => act(async () => { await actions.changePassword(pw.current, pw.next); setPw({ current: '', next: '' }) }, 'Пароль изменён')}>
          Сменить пароль
        </Button>
      </div>
      <div className="lg:col-span-2">
        <ErrorText>{err}</ErrorText>
        {msg && <Notice>{msg}</Notice>}
      </div>
    </Card>
  )
}

export function Stopped({ state }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [resume, setResume] = useState(false)
  return (
    <div className="mx-auto max-w-[560px] space-y-5">
      <h1 className="text-[1.75rem]">Обработка данных остановлена</h1>
      <p className="text-muted">
        Вы отозвали согласие на обработку данных о здоровье. Мы не обрабатываем данные и не открываем их сотрудникам. Данные будут уничтожены не позднее {state.consent.deleteAfter ? fmtDate(state.consent.deleteAfter.slice(0, 10)) : 'чем через 30 дней'}.
      </p>
      <a className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-card px-4 font-medium hover:bg-sunken" href={`/api/families/${state.familyId}/export`}>
        <Icon name="download" size={19} /> Скачать мои данные (JSON)
      </a>
      <Card className="space-y-3">
        <p className="font-semibold">Удалить всё сейчас</p>
        <Field label="Пароль для подтверждения">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </Field>
        <ErrorText>{err}</ErrorText>
        <Button variant="danger" onClick={() => actions.deleteAccount(pw).catch((e) => setErr(e.message))}>
          Удалить аккаунт и данные
        </Button>
      </Card>
      {resume ? (
        <Card>
          <OtpSign docId="consent_health" startUrl="/api/consents/health/start" signUrl="/api/consents/health/sign" onDone={refresh} agreeText="Я передумал(а) и снова даю отдельное согласие на обработку данных о состоянии моего здоровья." />
        </Card>
      ) : (
        <button className="min-h-12 font-medium text-accent-dark hover:underline" onClick={() => setResume(true)}>
          Я передумал(а): вернуть согласие
        </button>
      )}
      <button className="block min-h-12 font-medium text-accent-dark hover:underline" onClick={actions.logout}>
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
    <div className="max-w-[860px]">
      <PageHeader title="Мои данные и согласия" subtitle="Здесь видно, на что вы согласились, и можно скачать, исправить или удалить данные." />

      <H>Аккаунт</H>
      <Account state={state} />

      <H>Уведомления и режимы</H>
      <Settings state={state} />

      {can(state).self && (
        <>
          <H>Кто открывал мои данные</H>
          <ViewLog state={state} />
        </>
      )}

      <H>Документы</H>
      <ul className="grid gap-2 sm:grid-cols-2">
        {['terms', 'privacy', 'consent_pd', 'consent_health'].map((id) => (
          <li key={id} className="flex items-center gap-3 rounded-2xl bg-card shadow-sheet px-4 py-3 ">
            <Icon name="file" className="text-accent" />
            <DocLink id={id} />
          </li>
        ))}
        <li className="flex items-center gap-3 rounded-2xl bg-card shadow-sheet px-4 py-3 ">
          <Icon name="folder" className="text-accent" />
          <a className="text-accent-dark underline underline-offset-2" href="#/legal">
            Все документы
          </a>
        </li>
      </ul>

      <H>Мои согласия</H>
      {!data ? <p className="text-muted">Загрузка…</p> : <ConsentList rows={data.own} empty="Записей нет." />}

      {owner && data && (
        <>
          <H>Согласия за других людей</H>
          <p className="mb-3 text-sm text-muted">Подтверждения, которые даны или заявлены по профилям вашей семьи.</p>
          <ConsentList rows={data.about.filter((c) => c.profile)} empty="Пока нет." />
        </>
      )}

      <H>Запрос по персональным данным</H>
      <Card className="space-y-4">
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
        <ErrorText>{err}</ErrorText>
        {sent && <Notice>Запрос отправлен.</Notice>}
        <Button onClick={sendRequest}>Отправить запрос</Button>
      </Card>

      {owner && (
        <>
          <H>Скачать данные</H>
          <a className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong bg-card px-5 font-medium hover:bg-sunken" href={`/api/families/${state.familyId}/export`}>
            <Icon name="download" size={19} /> Скачать всё в формате JSON
          </a>

          <H>Отозвать согласие</H>
          <Card className="space-y-3">
            <p>Отзыв согласия на обработку данных о здоровье останавливает обработку. Данные будут уничтожены в течение 30 дней, а пользоваться сервисом станет нельзя.</p>
            <Button
              variant="danger"
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
        <ErrorText>{msg}</ErrorText>
        <Button
          variant="danger"
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
