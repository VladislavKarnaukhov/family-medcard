import { useEffect, useRef, useState } from 'react'
import { Button, Card, Empty, ErrorText, Notice, PageHeader, Tabs, Toggle, go } from '../components/ui'
import { Icon } from '../components/icons'
import { Preview, ResultForm } from '../components/ResultForm'
import { actions, can } from '../lib/store'
import { recognize, getFeatures } from '../lib/recognize'
import { draftBad, draftRows, emptyDraft, toDraft } from '../lib/draft'
import { fmtDate, localISO } from '../lib/format'
import { DocLink } from './Legal'

export default function AddResult({ state, profile }) {
  const [files, setFiles] = useState([])
  const [drafts, setDrafts] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cur, setCur] = useState(0)
  const [saving, setSaving] = useState(false)
  const [features, setFeatures] = useState({ aiRecognition: false })
  const [ai, setAi] = useState(false)
  const [usedAi, setUsedAi] = useState(false)
  const [warnings, setWarnings] = useState([])
  const [drag, setDrag] = useState(false)
  const cam = useRef(null)
  const pick = useRef(null)

  useEffect(() => {
    getFeatures().then(setFeatures)
  }, [])

  if (!profile)
    return (
      <Empty icon="user" action={<Button onClick={() => go('profile/new')}>Создать профиль</Button>}>
        Сначала создайте профиль.
      </Empty>
    )
  if (!can(state).write) return <Empty icon="lock">У вас доступ только для просмотра.</Empty>

  const addFiles = (list) => setFiles((f) => [...f, ...Array.from(list)])

  const sendToAssistant = async () => {
    setSaving(true)
    setError('')
    try {
      for (const file of files) {
        await actions.addDocument({ profileId: profile.id, type: 'analysis', title: `Бланк анализа от ${fmtDate(localISO())}${files.length > 1 ? ` (${files.indexOf(file) + 1} из ${files.length})` : ''}`, date: localISO(), file })
      }
      go('dossier')
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const run = async () => {
    setError('')
    // Без ИИ показатели вносит человек: бланк показывается рядом с пустой таблицей.
    if (!(ai && features.aiRecognition)) {
      setUsedAi(false)
      setWarnings([])
      setDrafts(files.map((f) => ({ ...emptyDraft(localISO()), sourceFile: f.name })))
      setCur(0)
      return
    }
    setBusy(true)
    try {
      const res = await recognize(files, { ai: ai && features.aiRecognition, profileId: profile.id })
      setUsedAi(res.some((r) => r.ai))
      setWarnings(res.flatMap((r) => r.warnings || []))
      setDrafts(res.map(toDraft))
      setCur(0)
    } catch (e) {
      setError(e.status === 422 ? e.message : 'Не удалось распознать бланк. Отправьте его помощнику или внесите показатели вручную.')
    } finally {
      setBusy(false)
    }
  }

  const manual = () => {
    setFiles([])
    setUsedAi(false)
    setDrafts([emptyDraft(localISO())])
    setCur(0)
  }

  // ---------- шаг 1: загрузка ----------
  if (!drafts) {
    return (
      <div className="mx-auto max-w-[720px]">
        <PageHeader title="Добавить анализ" subtitle={`Профиль «${profile.name}». Можно выбрать сразу несколько фото или PDF.`} back={{ href: '#/dossier', label: 'Досье' }} />

        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addFiles(e.target.files)} />
        <input ref={pick} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => addFiles(e.target.files)} />

        <div
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => (e.preventDefault(), setDrag(false), addFiles(e.dataTransfer.files))}
          className={`stitch-border flex flex-col items-center gap-4 rounded-2xl px-6 py-10 text-center transition-colors ${drag ? 'bg-accent-soft' : 'bg-card'}`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Icon name="upload" size={26} />
          </span>
          <p className="max-w-[40ch] text-muted">Перетащите бланки сюда или выберите на устройстве. Подойдут фото и PDF.</p>
          <div className="flex w-full max-w-[420px] flex-col gap-3 sm:flex-row">
            <Button className="flex-1" icon="camera" onClick={() => cam.current.click()}>
              Сфотографировать
            </Button>
            <Button className="flex-1" variant="soft" icon="folder" onClick={() => pick.current.click()}>
              Выбрать файлы
            </Button>
          </div>
        </div>

        {files.length > 0 && (
          <ul className="mt-5 divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet ">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <Icon name="file" className="text-accent" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-sm text-muted">{Math.max(1, Math.round(f.size / 1024))} КБ</span>
                <button className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-alert-soft hover:text-alert" aria-label={`Убрать ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  <Icon name="x" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 space-y-4">
          <ErrorText>{error}</ErrorText>
          {features.aiRecognition && (
            <div className="rounded-xl bg-paper p-4">
              <Toggle checked={ai} onChange={setAi}>
                Разрешаю передать бланк ИИ-сервису за пределы РФ для автоматического распознавания. <DocLink id="consent_ai">Документ</DocLink>
              </Toggle>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {can(state).owner && (
              <Button big icon="chat" disabled={!files.length || busy || saving} onClick={sendToAssistant}>
                {saving ? 'Отправляем…' : 'Отправить помощнику'}
              </Button>
            )}
            <Button big variant={can(state).owner ? 'ghost' : 'primary'} disabled={!files.length || busy || saving} onClick={run}>
              {busy ? 'Распознаём…' : `Внести самому${files.length ? ` (${files.length})` : ''}`}
            </Button>
          </div>
          <p className="text-sm text-muted">
            {can(state).owner ? 'Помощник внесёт показатели за вас и сообщит в переписке. ' : ''}
            Если вносите сами, вы проверите таблицу рядом с бланком перед сохранением. Файл при этом тоже попадёт к помощнику и останется в досье.
          </p>
          <div className="rounded-2xl bg-sunken p-5">
            <p className="font-semibold">Нет бланка или измеряли сами</p>
            <p className="mt-1 text-[0.95rem] text-muted">Давление, сахар, вес или любой показатель можно внести без файла. Лабораторию указывать не нужно.</p>
            <Button className="mt-4" variant="ghost" icon="edit" onClick={manual}>
              Внести показатели без файла
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ---------- шаг 2: проверка ----------
  const issues = drafts.map(draftBad)
  const canSave = issues.every((b) => !b)
  const d = drafts[cur]

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await actions.saveLabResults(
        profile.id,
        drafts.map((x, i) => ({ date: x.date, labName: x.labName, sourceFile: x.sourceFile, file: files[i], rows: draftRows(x) })),
      )
      go('')
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Проверьте данные" subtitle="Сверьте каждое значение, единицу и референс с бланком. Исправьте любое поле и только потом сохраняйте." />
      {usedAi && (
        <Notice className="mb-5">
          Бланк распознан ИИ-сервисом, он может ошибаться. Строки с низкой уверенностью помечены «(проверьте)».
          {warnings.length > 0 && <> Замечания: {warnings.join('; ')}.</>}
        </Notice>
      )}
      {drafts.length > 1 && <Tabs className="mb-5" value={String(cur)} onChange={(k) => setCur(Number(k))} items={drafts.map((x, i) => [String(i), `Бланк ${i + 1}${issues[i] ? ' •' : ''}`])} />}

      <div className={`grid gap-8 ${files[cur] ? 'lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]' : ''}`}>
        {files[cur] && (
          <div className="lg:sticky lg:top-8 lg:self-start">
            <Preview file={files[cur]} />
          </div>
        )}
        <div className="min-w-0">
          <ResultForm draft={d} onChange={(x) => setDrafts(drafts.map((y, i) => (i === cur ? x : y)))} />
          <div className="mt-6 space-y-3">
            {!canSave && <p className="text-sm text-muted">Чтобы сохранить, заполните дату, лабораторию и числовое значение в каждой строке.</p>}
            <ErrorText>{error}</ErrorText>
            <div className="flex flex-wrap gap-3">
              <Button icon="check" disabled={!canSave || saving} onClick={save}>
                {saving ? 'Сохраняем…' : `Сохранить${drafts.length > 1 ? ` (${drafts.length})` : ''}`}
              </Button>
              <Button variant="ghost" onClick={() => setDrafts(null)}>
                Назад
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
