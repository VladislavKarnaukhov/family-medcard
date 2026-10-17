import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Empty, Field, go } from '../components/ui'
import { actions, can } from '../lib/store'
import { recognize, getFeatures } from '../lib/recognize'
import { DocLink } from './Legal'
import { findIndicator } from '../lib/indicators'
import { parseNum, localISO } from '../lib/format'

const toText = (n) => (n == null ? '' : String(n).replace('.', ','))

function Preview({ file }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => url && URL.revokeObjectURL(url), [url])
  if (!file) return null
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper">
      {isPdf ? (
        <object data={url} type="application/pdf" className="h-96 w-full">
          <p className="p-4 text-muted">Просмотр PDF недоступен в этом браузере: {file.name}</p>
        </object>
      ) : (
        <img src={url} alt={`Бланк: ${file.name}`} className="max-h-[28rem] w-full object-contain" />
      )}
    </div>
  )
}

export function RowEditor({ row, onChange, onDelete }) {
  const set = (k) => (e) => onChange({ ...row, [k]: e.target.value })
  const known = findIndicator(row.name)
  const bad = row.value.trim() === '' || parseNum(row.value) == null
  return (
    <li className="rounded-2xl border border-line bg-card p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <Field label="Показатель" hint={known ? undefined : 'Не найден в справочнике — график строится по названию'}>
            <input value={row.name} onChange={set('name')} />
          </Field>
        </div>
        <Field label="Значение">
          <input inputMode="decimal" value={row.value} onChange={set('value')} aria-invalid={bad} className={bad ? '!border-alert' : ''} />
        </Field>
        <Field label="Единица">
          <input value={row.unit} onChange={set('unit')} />
        </Field>
        <Field label="Референс: от">
          <input inputMode="decimal" value={row.refLow} onChange={set('refLow')} />
        </Field>
        <Field label="Референс: до">
          <input inputMode="decimal" value={row.refHigh} onChange={set('refHigh')} />
        </Field>
      </div>
      <button onClick={onDelete} className="mt-2 min-h-10 text-sm text-alert underline underline-offset-2">
        Убрать строку
      </button>
    </li>
  )
}

export const toDraft = (r) => ({
  sourceFile: r.sourceFile,
  date: r.date,
  labName: r.labName,
  rows: r.rows.map((x) => ({
    name: x.name,
    value: toText(x.value),
    unit: x.unit,
    refLow: toText(x.refLow),
    refHigh: toText(x.refHigh),
  })),
})

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
  useEffect(() => {
    getFeatures().then(setFeatures)
  }, [])
  const cam = useRef(null)
  const pick = useRef(null)

  if (!profile) {
    return (
      <div className="py-6">
        <Empty>Сначала создайте профиль.</Empty>
        <Button big className="mt-4" onClick={() => go('profile/new')}>
          Создать профиль
        </Button>
      </div>
    )
  }

  if (!can(state).write) return <Empty>У вас доступ только для просмотра.</Empty>

  const addFiles = (list) => setFiles((f) => [...f, ...Array.from(list)])

  const sendToAssistant = async () => {
    setSaving(true)
    setError('')
    try {
      for (const file of files) {
        await actions.addDocument({ profileId: profile.id, type: 'analysis', title: `Бланк анализа — ${file.name}`, date: localISO(), file })
      }
      go('dossier')
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await recognize(files, { ai: ai && features.aiRecognition, profileId: profile.id })
      setUsedAi(res.some((r) => r.ai))
      setWarnings(res.flatMap((r) => r.warnings || []))
      setDrafts(res.map(toDraft))
      setCur(0)
    } catch {
      setError('Не удалось распознать бланк. Попробуйте другое фото или добавьте показатели вручную.')
    } finally {
      setBusy(false)
    }
  }

  const manual = () => {
    setFiles([])
    setDrafts([{ sourceFile: '', date: localISO(), labName: '', rows: [{ name: '', value: '', unit: '', refLow: '', refHigh: '' }] }])
    setCur(0)
  }

  // ---------- шаг 1: загрузка ----------
  if (!drafts) {
    return (
      <div className="space-y-4 py-4">
        <h1 className="text-2xl font-semibold">Добавить анализ</h1>
        <p className="text-muted">Для профиля «{profile.name}». Можно выбрать сразу несколько фото или PDF.</p>

        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addFiles(e.target.files)} />
        <input ref={pick} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => addFiles(e.target.files)} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Button big onClick={() => cam.current.click()}>
            📷 Сфотографировать бланк
          </Button>
          <Button big variant="soft" onClick={() => pick.current.click()}>
            Выбрать фото или PDF
          </Button>
        </div>

        {files.length > 0 && (
          <Card>
            <ul className="divide-y divide-line">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">{f.name}</span>
                  <button className="min-h-10 shrink-0 text-alert" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    Убрать
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {error && <p className="rounded-xl bg-alert-soft p-3 text-alert">{error}</p>}
        {features.aiRecognition && (
          <label className="flex items-start gap-3 rounded-xl bg-paper p-3">
            <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} className="!mt-1 !h-6 !min-h-0 !w-6 shrink-0" />
            <span className="text-sm">
              Разрешаю передать бланк ИИ-сервису за пределы РФ для автоматического распознавания. <DocLink id="consent_ai">Документ</DocLink> Без этого показатели внесёт заглушка или помощник.
            </span>
          </label>
        )}
        <Button big disabled={!files.length || busy || saving} onClick={run}>
          {busy ? 'Распознаём…' : `Распознать сами${files.length ? ` (${files.length})` : ''}`}
        </Button>
        {can(state).owner && (
          <Button big variant="soft" disabled={!files.length || busy || saving} onClick={sendToAssistant}>
            {saving ? 'Отправляем…' : 'Отправить помощнику на внесение'}
          </Button>
        )}
        <button onClick={manual} className="block min-h-12 w-full text-center text-accent-dark underline underline-offset-2">
          Ввести показатели вручную
        </button>
      </div>
    )
  }

  // ---------- шаг 2: проверка ----------
  const d = drafts[cur]
  const patch = (p) => setDrafts(drafts.map((x, i) => (i === cur ? { ...x, ...p } : x)))
  const setRow = (i, r) => patch({ rows: d.rows.map((x, j) => (j === i ? r : x)) })
  const issues = drafts.map((x) => !x.date || !x.labName.trim() || !x.rows.length || x.rows.some((r) => !r.name.trim() || parseNum(r.value) == null))
  const canSave = issues.every((b) => !b)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await actions.saveLabResults(
      profile.id,
      drafts.map((x, i) => ({
        date: x.date,
        labName: x.labName,
        sourceFile: x.sourceFile,
        file: files[i],
        rows: x.rows.map((r) => ({
          name: r.name,
          value: parseNum(r.value),
          unit: r.unit,
          refLow: r.refLow.trim() === '' ? null : parseNum(r.refLow),
          refHigh: r.refHigh.trim() === '' ? null : parseNum(r.refHigh),
        })),
      })),
      )
      go('')
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-2xl font-semibold">Проверьте данные</h1>
      {usedAi && (
        <p className="rounded-xl bg-accent-soft p-3 text-sm">
          Бланк распознан ИИ-сервисом. Он может ошибаться: сверьте каждое значение, единицу и референс с бланком. Строки с низкой уверенностью помечены «(проверьте)».
          {warnings.length > 0 && (
            <>
              <br />
              Замечания: {warnings.join('; ')}.
            </>
          )}
        </p>
      )}
      {!usedAi && (
        <p className="rounded-xl bg-accent-soft p-3 text-sm">
          Распознавание в демо-версии — заглушка: показатели ниже — пример бланка, а не данные из вашего файла. Исправьте любое
          поле перед сохранением.
        </p>
      )}

      {drafts.length > 1 && (
        <div className="flex gap-2 overflow-x-auto" role="tablist">
          {drafts.map((x, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === cur}
              onClick={() => setCur(i)}
              className={`min-h-12 shrink-0 rounded-full px-4 ${i === cur ? 'bg-accent text-white' : 'border border-line bg-card'} ${
                issues[i] ? 'ring-2 ring-alert' : ''
              }`}
            >
              Бланк {i + 1}
            </button>
          ))}
        </div>
      )}

      {files[cur] ? <Preview file={files[cur]} /> : null}

      <Card className="grid grid-cols-2 gap-3">
        <Field label="Дата анализа">
          <input type="date" value={d.date} onChange={(e) => patch({ date: e.target.value })} />
        </Field>
        <Field label="Лаборатория">
          <input value={d.labName} onChange={(e) => patch({ labName: e.target.value })} />
        </Field>
      </Card>

      <ul className="space-y-3">
        {d.rows.map((r, i) => (
          <RowEditor key={i} row={r} onChange={(x) => setRow(i, x)} onDelete={() => patch({ rows: d.rows.filter((_, j) => j !== i) })} />
        ))}
      </ul>
      <Button variant="soft" className="w-full" onClick={() => patch({ rows: [...d.rows, { name: '', value: '', unit: '', refLow: '', refHigh: '' }] })}>
        ＋ Добавить строку
      </Button>

      {!canSave && <p className="text-sm text-alert">Заполните дату, лабораторию и числовое значение в каждой строке — они подсвечены.</p>}
      {error && <p role="alert" className="rounded-xl bg-alert-soft p-3 text-alert">{error}</p>}
      <Button big disabled={!canSave || saving} onClick={save}>
        {saving ? 'Сохраняем…' : `Сохранить ${drafts.length > 1 ? `(${drafts.length})` : ''}`}
      </Button>
      <Button variant="ghost" className="w-full" onClick={() => setDrafts(null)}>
        Назад
      </Button>
    </div>
  )
}
