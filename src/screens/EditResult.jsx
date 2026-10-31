import { useState } from 'react'
import { Button, Empty, ErrorText, PageHeader, go } from '../components/ui'
import { Preview, ResultForm } from '../components/ResultForm'
import { actions, can } from '../lib/store'
import { draftBad, draftRows, toDraft } from '../lib/draft'

// Исправление сохранённого анализа: те же поля, что при вводе.
export default function EditResult({ state, id }) {
  const lab = state.labResults.find((l) => l.id === id)
  const doc = state.documents.find((d) => d.labResultId === id && d.fileUrl)
  const [draft, setDraft] = useState(() =>
    lab
      ? toDraft({
          date: lab.date,
          labName: lab.labName,
          rows: state.measurements.filter((m) => m.labResultId === id).map((m) => ({ name: m.name, value: m.value, unit: m.unit, refLow: m.refLow, refHigh: m.refHigh })),
        })
      : null,
  )
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (!lab || !draft) return <Empty icon="flask">Анализ не найден.</Empty>
  if (!can(state).write) return <Empty icon="lock">У вас доступ только для просмотра.</Empty>

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      await actions.updateLabResult(id, { date: draft.date, labName: draft.labName, rows: draftRows(draft) })
      go('')
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Исправить анализ" subtitle={`${lab.labName}. Изменения сразу попадут в графики и сводку.`} back={{ href: '#/', label: 'Главная' }} />
      <div className={`grid grid-cols-1 gap-8 ${doc ? 'xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]' : ''}`}>
        {doc && (
          <div className="xl:sticky xl:top-8 xl:self-start">
            <Preview url={doc.fileUrl} name={doc.fileName} />
          </div>
        )}
        <div className="min-w-0">
          <ResultForm draft={draft} onChange={setDraft} />
          <div className="mt-6 space-y-3">
            {draftBad(draft) && <p className="text-sm text-muted">Чтобы сохранить, заполните дату, лабораторию и числовое значение в каждой строке.</p>}
            <ErrorText>{err}</ErrorText>
            <div className="flex flex-wrap gap-3">
              <Button icon="check" disabled={draftBad(draft) || busy} onClick={save}>
                {busy ? 'Сохраняем…' : 'Сохранить'}
              </Button>
              <Button variant="ghost" onClick={() => go('')}>
                Отмена
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
