import { useState } from 'react'
import { Button, Card, Empty, Field, H, go } from '../components/ui'
import { actions, can } from '../lib/store'
import { fmtDate, localISO } from '../lib/format'

export const DOC_TYPES = {
  analysis: 'Анализы',
  extract: 'Выписки',
  imaging: 'Исследования и снимки',
  prescription: 'Рецепты',
  vaccine: 'Прививки',
  insurance: 'Полисы и страховка',
  authorization: 'Согласия и доверенности',
}
const ADDABLE = Object.entries(DOC_TYPES).filter(([k]) => k !== 'analysis')

const STATUS = {
  ready: null,
  requested: 'Запрошено помощником',
  processing: 'Передано помощнику — добавит в досье',
}

export default function Dossier({ state, profile }) {
  const [filter, setFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ type: 'extract', title: '', date: localISO(), file: null })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const { write, owner } = can(state)

  if (!profile) return <Empty>Сначала создайте профиль.</Empty>

  const items = [
    ...state.documents
      .filter((d) => d.profileId === profile.id && !(d.type === 'analysis' && d.labResultId))
      .map((d) => ({ ...d, kind: 'doc' })),
    ...state.labResults
      .filter((r) => r.profileId === profile.id)
      .map((r) => ({
        id: r.id,
        kind: 'lab',
        type: 'analysis',
        title: `Анализы, ${r.labName}`,
        date: r.date,
        status: 'ready',
        fileUrl: state.documents.find((d) => d.labResultId === r.id)?.fileUrl || null,
        count: state.measurements.filter((m) => m.labResultId === r.id).length,
      })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  const shown = filter === 'all' ? items : items.filter((i) => i.type === filter)
  const typesPresent = Object.keys(DOC_TYPES).filter((t) => items.some((i) => i.type === t))

  const submit = async () => {
    if (!f.title.trim()) return
    setBusy(true)
    setErr('')
    try {
      await actions.addDocument({ profileId: profile.id, type: f.type, title: f.title.trim(), date: f.date, file: f.file })
      setF({ type: 'extract', title: '', date: localISO(), file: null })
      setAdding(false)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="py-4">
      <h1 className="text-2xl font-semibold">Досье</h1>
      <p className="text-muted">Все документы профиля «{profile.name}» в одном месте: {items.length}.</p>

      {write && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Button big onClick={() => go('add')}>
            ＋ Добавить анализ
          </Button>
          <Button big variant="soft" onClick={() => setAdding(!adding)}>
            {adding ? 'Свернуть' : '＋ Другой документ'}
          </Button>
        </div>
      )}

      {write && adding && (
        <Card className="mt-3 space-y-3">
          <Field label="Тип документа">
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {ADDABLE.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Название">
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Например, выписка из больницы" />
          </Field>
          <Field label="Дата документа">
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Файл или фото" hint="JPG, PNG, HEIC или PDF, до 25 МБ.">
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setF({ ...f, file: e.target.files[0] || null })} />
          </Field>
          {err && <p role="alert" className="rounded-xl bg-alert-soft p-3 text-alert">{err}</p>}
          <Button className="w-full" disabled={!f.title.trim() || busy} onClick={submit}>
            {busy ? 'Загружаем…' : owner ? 'Передать помощнику' : 'Добавить в досье'}
          </Button>
        </Card>
      )}

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Тип документа">
        {[['all', 'Все'], ...typesPresent.map((t) => [t, DOC_TYPES[t]])].map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={`min-h-11 shrink-0 rounded-full px-4 ${filter === k ? 'bg-accent text-white' : 'border border-line bg-card'}`}
          >
            {l}
          </button>
        ))}
      </div>

      <ul className="mt-3 space-y-2">
        {shown.length === 0 && <Empty>Документов этого типа нет.</Empty>}
        {shown.map((d) => (
          <li key={d.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{d.title}</span>
              <span className="shrink-0 text-sm text-muted">{fmtDate(d.date)}</span>
            </div>
            <div className="mt-1 text-sm text-muted">
              {DOC_TYPES[d.type]}
              {d.kind === 'lab' && ` · показателей: ${d.count}`}
              {d.kind === 'doc' && d.addedBy === 'assistant' && ' · добавлено помощником'}
              {d.kind === 'doc' && d.addedBy === 'client' && ' · добавлено вами или близким'}
            </div>
            {STATUS[d.status] && <div className="mt-1 text-sm font-medium text-accent-dark">⏳ {STATUS[d.status]}</div>}
            <div className="mt-1 flex gap-4">
              {d.kind === 'lab' && (
                <a className="min-h-10 py-2 text-accent-dark underline underline-offset-2" href="#/indicators">
                  Показатели
                </a>
              )}
              {d.fileUrl && (
                <a className="min-h-10 py-2 text-accent-dark underline underline-offset-2" href={d.fileUrl} target="_blank" rel="noreferrer">
                  Открыть файл
                </a>
              )}
              {write && d.kind === 'doc' && d.addedBy === 'client' && (
                <button className="min-h-10 text-sm text-muted underline underline-offset-2" onClick={() => confirm('Удалить документ?') && actions.deleteDocument(d.id)}>
                  Удалить
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {owner && <H>Паспорт здоровья</H>}
      {owner && <Card>
        <p>Краткое досье «{profile.name}» на русском и английском: профиль, лекарства, показатели, документы. Пригодится для лечения за границей или второго мнения.</p>
        <Button
          className="mt-3 w-full"
          variant="soft"
          onClick={() => {
            actions.createRequest(profile.id, 'Подготовить паспорт здоровья на русском и английском')
            go('assistant')
          }}
        >
          Поручить помощнику
        </Button>
      </Card>}
    </div>
  )
}
