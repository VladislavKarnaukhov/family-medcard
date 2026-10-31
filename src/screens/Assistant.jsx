import { useEffect, useRef, useState } from 'react'
import { Avatar, Button, Card, ErrorText, H, Notice } from '../components/ui'
import { Icon } from '../components/icons'
import { actions } from '../lib/store'
import { fmtDate, fmtDateTime, humanize, localISO } from '../lib/format'

const QUICK = [
  ['file', 'Запросить документы из клиники'],
  ['clock', 'Записать на приём к врачу'],
  ['sheet', 'Подготовить к визиту к врачу'],
  ['folder', 'Собрать документы для второго мнения'],
  ['link', 'Перевести документы на английский'],
]

const STEPS = [
  ['accepted', 'Принято'],
  ['working', 'В работе'],
  ['done', 'Готово'],
]

function Steps({ status }) {
  const at = STEPS.findIndex(([s]) => s === status)
  return (
    <ol className="mt-3 flex items-center" aria-label="Статус поручения">
      {STEPS.map(([s, label], i) => (
        <li key={s} className="flex flex-1 items-center last:flex-none">
          <span className={`flex items-center gap-1.5 text-sm ${i <= at ? 'font-medium text-accent-dark' : 'text-muted'}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-md text-white ${i <= at ? 'bg-accent' : 'bg-line-strong'}`}>{i <= at && <Icon name="check" size={12} strokeWidth={3} />}</span>
            {label}
          </span>
          {i < STEPS.length - 1 && <span className="stitch-h mx-2 flex-1" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}

const dayKey = (iso) => iso.slice(0, 10)
const dayLabel = (iso) => (dayKey(iso) === localISO() ? 'Сегодня' : fmtDate(dayKey(iso)))

export default function Assistant({ state, profile }) {
  const assistant = state.assistant?.name || 'Помощник'
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const end = useRef(null)
  const first = useRef(true)
  const count = state.messages.length

  useEffect(() => {
    // при открытии остаёмся наверху, к концу переписки прокручиваем только новые сообщения
    if (first.current) first.current = false
    else end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [count])

  useEffect(() => {
    actions.markRead()
  }, [state.unread])

  const name = (id) => state.profiles.find((p) => p.id === id)?.name
  const open = state.requests.filter((r) => r.status !== 'done')
  const done = state.requests.filter((r) => r.status === 'done')

  const run = async (fn) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const send = (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    run(() => actions.sendMessage(t))
  }

  let lastDay = ''

  return (
    <div>
      <header className="mb-6 flex items-center gap-4">
        <Avatar name={assistant} size={56} tone="solid" />
        <div>
          <h1 className="text-[1.75rem] lg:text-3xl">{assistant}</h1>
          <p className="text-muted">Ваш помощник по здоровью. Отвечает в течение рабочего дня.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 xl:order-1" aria-label="Переписка">
          <div className="flex min-h-[26rem] flex-col rounded-2xl bg-card shadow-sheet ">
            <ul className="flex-1 space-y-1 px-4 py-5 lg:max-h-[calc(100vh-22rem)] lg:overflow-y-auto lg:px-6" aria-live="polite">
              {state.messages.length === 0 && <li className="py-10 text-center text-muted">Сообщений пока нет. Напишите помощнику или выберите поручение.</li>}
              {state.messages.map((m) => {
                const mine = m.from === 'client'
                const dk = dayKey(m.at)
                const sep = dk !== lastDay
                lastDay = dk
                return (
                  <li key={m.id}>
                    {sep && (
                      <p className="my-4 flex items-center gap-3 text-xs font-medium text-muted">
                        <span className="stitch-h flex-1" aria-hidden />
                        {dayLabel(m.at)}
                        <span className="stitch-h flex-1" aria-hidden />
                      </p>
                    )}
                    <div className={`flex items-end gap-2 ${mine ? 'justify-end' : ''}`}>
                      {!mine && <Avatar name={m.author || assistant} size={30} />}
                      <div className={`max-w-[82%] rounded-xl px-4 py-2.5 lg:max-w-[70%] ${mine ? 'rounded-br-sm bg-accent-soft text-ink' : 'rounded-bl-sm bg-paper'}`}>
                        <p className="whitespace-pre-wrap break-words">{humanize(m.text)}</p>
                        <p className={`mt-0.5 text-right text-xs ${mine ? 'text-muted' : 'text-muted'}`}>{fmtDateTime(m.at).split(', ').pop()}</p>
                      </div>
                    </div>
                  </li>
                )
              })}
              <li ref={end} />
            </ul>
            <form onSubmit={send} className="sticky bottom-[4.6rem] flex items-end gap-2 rounded-b-2xl border-t border-line bg-card p-3 lg:static">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e)
                }}
                rows={1}
                placeholder="Написать помощнику"
                aria-label="Сообщение помощнику"
                maxLength={4000}
                className="!min-h-12 flex-1 !resize-none !py-3"
              />
              <Button type="submit" icon="send" className="!px-4" disabled={!text.trim() || busy} aria-label="Отправить">
                <span className="hidden sm:inline">Отправить</span>
              </Button>
            </form>
          </div>
          <div className="mt-3">
            <ErrorText>{err}</ErrorText>
          </div>
        </section>

        <aside className="space-y-8 xl:order-2">
          <section>
            <h2 className="mb-1 text-lg">Поручить</h2>
            <p className="mb-3 text-sm text-muted">Для профиля «{profile?.name ?? '—'}»</p>
            <ul className="space-y-2">
              {QUICK.map(([icon, q]) => (
                <li key={q}>
                  <button
                    disabled={!profile || busy}
                    onClick={() => run(() => actions.createRequest(profile.id, q))}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-line-strong bg-card px-4 text-left text-[0.95rem] font-medium transition-colors hover:bg-accent-soft/50 disabled:opacity-50"
                  >
                    <Icon name={icon} size={19} className="text-accent" />
                    {q}
                  </button>
                </li>
              ))}
            </ul>
            <Notice className="mt-3" tone="quiet">
              <strong>Запросы в клиниках.</strong> Клиника выдаёт документы пациенту или его законному представителю. Чтобы помощник запросил их за вас, нужны согласие и полномочие пациента: возьмите{' '}
              <a className="font-medium text-accent-dark underline" href="#/legal/authorization" target="_blank" rel="noreferrer">
                шаблон
              </a>
              , уточните требования клиники и загрузите подписанный документ в{' '}
              <a className="font-medium text-accent-dark underline" href="#/dossier">
                документы
              </a>{' '}
              (тип «Согласия и доверенности»).
            </Notice>
          </section>

          {state.requests.length > 0 && (
            <section>
              <H>Поручения</H>
              <ul className="space-y-3">
                {[...open, ...done].map((r) => (
                  <li key={r.id}>
                    <Card className="!p-4">
                      <p className="font-semibold">{humanize(r.title)}</p>
                      <p className="text-sm text-muted">
                        {name(r.profileId) || 'без профиля'}
                        {r.status === 'done' ? '' : r.due ? ` · ориентировочно до ${fmtDate(r.due)}` : ''}
                        {r.assignee ? ` · ${r.assignee}` : ''}
                      </p>
                      <Steps status={r.status} />
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
