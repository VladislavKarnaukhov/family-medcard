import { useState } from 'react'
import { Button, Empty, ErrorText, Field, PageHeader, go } from '../components/ui'
import { actions, can } from '../lib/store'
import { KIND_LABEL, NEEDS } from '../lib/care'

export default function CareNote({ state, profile, kind0 }) {
  const self = state.me?.selfProfileId === profile?.id
  const [kind, setKind] = useState(KIND_LABEL[kind0] ? kind0 : 'wellbeing')
  const [text, setText] = useState('')
  const [needs, setNeeds] = useState('unknown')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!profile) return <Empty>Сначала создайте профиль.</Empty>
  if (!can(state).write) return <Empty icon="lock">У вас доступ только для просмотра.</Empty>
  const fall = kind === 'fall'
  const labels = { ...KIND_LABEL, fall: self ? 'Я упал(а)' : 'Было падение', wellbeing: self ? 'Как я себя чувствую' : 'Самочувствие' }
  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      await actions.addNote(profile.id, { kind, text, needsDoctor: fall ? needs : undefined })
      go('today')
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }
  return (
    <div className="mx-auto max-w-[640px]">
      <PageHeader title="Запись в дневник" subtitle={self ? 'Как прошёл ваш день.' : `Как прошёл день: «${profile.name}».`} back={{ href: '#/today', label: 'Сегодня' }} />
      <div className="space-y-5">
        <Field label="Что записать">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.keys(KIND_LABEL).map((k) => <option key={k} value={k}>{labels[k]}</option>)}
          </select>
        </Field>
        <Field label={fall ? 'Что случилось' : self ? 'Что хотите записать' : 'Что произошло'}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} autoFocus />
        </Field>
        {fall && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Нужна помощь врача</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(NEEDS).map(([k, v]) => (
                <button key={k} type="button" aria-pressed={needs === k} onClick={() => setNeeds(k)} className={`min-h-12 rounded-full px-5 font-medium ${needs === k ? 'bg-accent text-white' : 'border border-line-strong bg-card'}`}>{v}</button>
              ))}
            </div>
            <p className="mt-1.5 text-sm text-muted">Это ваш ответ, сервис его не оценивает. При необходимости вызовите скорую.</p>
          </fieldset>
        )}
        <p className="text-sm text-muted">{fall ? 'После сохранения о записи узнает владелец профиля.' : ''}</p>
        <ErrorText>{err}</ErrorText>
        <div className="flex gap-3">
          <Button icon="check" disabled={busy || !text.trim()} onClick={save}>Сохранить</Button>
          <Button variant="ghost" onClick={() => go('today')}>Отмена</Button>
        </div>
      </div>
    </div>
  )
}
