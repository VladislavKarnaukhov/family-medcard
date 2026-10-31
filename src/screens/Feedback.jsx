import { useState } from 'react'
import { Button, Card, ErrorText, Field, Notice, PageHeader } from '../components/ui'
import { actions } from '../lib/store'

function Message() {
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    setErr('')
    try {
      await actions.sendFeedback(text)
      setSent(true)
      setText('')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="space-y-4">
      {sent && <Notice>Спасибо, сообщение отправлено. Мы прочитаем его и ответим на вашу почту, если нужно.</Notice>}
      <Field label="Что не так или чего не хватает" hint="Не пишите медицинские подробности: нам важны сам экран и ваши трудности.">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={5} />
      </Field>
      <ErrorText>{err}</ErrorText>
      <Button icon="mail" disabled={busy || !text.trim()} onClick={send}>
        Отправить
      </Button>
    </Card>
  )
}

function Survey() {
  const [ease, setEase] = useState(0)
  const [recommend, setRecommend] = useState(null)
  const [blocker, setBlocker] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const submit = async () => {
    setErr('')
    try {
      await actions.answerSurvey({ ease, recommend, blocker })
      setDone(true)
    } catch (e) {
      setErr(e.message)
    }
  }
  if (done) return <Notice>Спасибо за ответы, они помогают сделать сервис лучше.</Notice>
  const chip = (on) => `press min-h-12 rounded-full border px-5 ${on ? 'border-accent bg-accent-soft text-accent-dark' : 'border-line-strong bg-card'}`
  return (
    <Card className="space-y-5">
      <p className="font-semibold">Три вопроса о сервисе</p>
      <div role="group" aria-label="Удобство">
        <p className="mb-2 text-sm font-medium">Насколько удобно пользоваться? (1 — трудно, 5 — легко)</p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={chip(ease === n)} onClick={() => setEase(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div role="group" aria-label="Рекомендация">
        <p className="mb-2 text-sm font-medium">Посоветовали бы вы сервис близким?</p>
        <div className="flex gap-2">
          <button type="button" className={chip(recommend === true)} onClick={() => setRecommend(true)}>Да</button>
          <button type="button" className={chip(recommend === false)} onClick={() => setRecommend(false)}>Нет</button>
        </div>
      </div>
      <Field label="Что мешает пользоваться каждый день?">
        <textarea value={blocker} onChange={(e) => setBlocker(e.target.value)} maxLength={1000} rows={3} />
      </Field>
      <ErrorText>{err}</ErrorText>
      <div className="flex flex-wrap gap-3">
        <Button disabled={!ease} onClick={submit}>Отправить ответы</Button>
        <Button variant="ghost" onClick={actions.dismissSurvey}>Не сейчас</Button>
      </div>
    </Card>
  )
}

export default function Feedback({ state }) {
  return (
    <div>
      <PageHeader title="Написать нам" subtitle="Расскажите, что неудобно или чего не хватает. Мы читаем каждое сообщение." />
      <div className="max-w-[640px] space-y-8">
        {state.user.surveyDue && <Survey />}
        <Message />
      </div>
    </div>
  )
}
