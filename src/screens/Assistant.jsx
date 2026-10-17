import { useEffect, useRef, useState } from 'react'
import { Button, Card, H } from '../components/ui'
import { actions, can } from '../lib/store'
import { fmtDate, fmtDateTime } from '../lib/format'

const QUICK = [
  'Запросить документы из клиники',
  'Записать на приём к врачу',
  'Подготовить к визиту к врачу',
  'Собрать досье для второго мнения',
  'Перевести документы на английский',
]

const STEPS = [
  ['accepted', 'Принято'],
  ['working', 'В работе'],
  ['done', 'Готово'],
]

export function Avatar({ size = 44, name = 'П' }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-dark"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {name[0]}
    </span>
  )
}

function Steps({ status }) {
  const at = STEPS.findIndex(([s]) => s === status)
  return (
    <ol className="mt-2 flex items-center gap-2 text-sm" aria-label="Статус запроса">
      {STEPS.map(([s, label], i) => (
        <li key={s} className={`flex items-center gap-1 ${i <= at ? 'text-accent-dark' : 'text-muted'}`}>
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${i <= at ? 'bg-accent' : 'bg-line'}`} />
          {label}
          {i < STEPS.length - 1 && <span className="mx-1 text-line">—</span>}
        </li>
      ))}
    </ol>
  )
}

export default function Assistant({ state, profile }) {
  const assistant = state.assistant?.name || 'Помощник'
  const [text, setText] = useState('')
  const end = useRef(null)
  const count = state.messages.length
  const first = useRef(true)
  useEffect(() => {
    // при открытии экрана остаёмся наверху, прокручиваем только к новым сообщениям
    if (first.current) first.current = false
    else end.current?.scrollIntoView({ block: 'nearest' })
  }, [count])

  const name = (id) => state.profiles.find((p) => p.id === id)?.name
  const open = state.requests.filter((r) => r.status !== 'done')
  const done = state.requests.filter((r) => r.status === 'done')

  const send = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    actions.sendMessage(text.trim())
    setText('')
  }

  return (
    <div className="py-4">
      <div className="flex items-center gap-3">
        <Avatar size={52} name={assistant} />
        <div>
          <h1 className="text-2xl font-semibold leading-tight">{assistant}</h1>
          <p className="text-muted">Ваш помощник по здоровью · отвечает в течение рабочего дня</p>
        </div>
      </div>

      <p className="mt-3 rounded-xl bg-accent-soft p-3 text-sm">
        Помощник собирает и упорядочивает документы, записывает на приём, готовит материалы к визитам. Он не оценивает результаты
        и не даёт медицинских рекомендаций.
      </p>

      <H>Поручить</H>
      <p className="mb-2 text-sm text-muted">Для профиля «{profile?.name ?? '—'}»</p>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            disabled={!profile}
            onClick={() => actions.createRequest(profile.id, q)}
            className="min-h-12 rounded-full border border-line bg-card px-4 text-left disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {open.length > 0 && (
        <>
          <H>В работе</H>
          <ul className="space-y-2">
            {open.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-sm text-muted">
                    {name(r.profileId)} · ориентировочно до {fmtDate(r.due)}
                  </div>
                  <Steps status={r.status} />
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {done.length > 0 && (
        <>
          <H>Выполнено</H>
          <ul className="space-y-2">
            {done.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-sm text-muted">{name(r.profileId)} · {fmtDate(r.due)}</div>
                  <Steps status="done" />
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <H>Переписка</H>
      <ul className="space-y-2" aria-live="polite">
        {state.messages.length === 0 && <li className="text-muted">Сообщений пока нет. Напишите помощнику или выберите поручение выше.</li>}
        {state.messages.map((m) => (
          <li key={m.id} className={`flex ${m.from === 'client' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${m.from === 'client' ? 'bg-accent text-white' : 'border border-line bg-card'}`}>
              {m.from === 'assistant' && <p className="mb-0.5 text-sm font-medium text-accent-dark">{m.author}</p>}
              <p className="whitespace-pre-wrap">{m.text}</p>
              <p className={`mt-1 text-xs ${m.from === 'client' ? 'text-white/80' : 'text-muted'}`}>{fmtDateTime(m.at)}</p>
            </div>
          </li>
        ))}
        <li ref={end} />
      </ul>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Написать помощнику" aria-label="Сообщение помощнику" maxLength={4000} />
        <Button type="submit" className="shrink-0" disabled={!text.trim()}>
          Отправить
        </Button>
      </form>
    </div>
  )
}
