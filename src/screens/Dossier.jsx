import { useState } from 'react'
import { Button, Card, Chip, Empty, ErrorText, Field, PageHeader, Tabs, go } from '../components/ui'
import { Icon } from '../components/icons'
import { actions, can } from '../lib/store'
import { docTitle, fmtDate, localISO } from '../lib/format'

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
  requested: 'Запрошено помощником',
  processing: 'Помощник вносит в досье',
}

export default function Dossier({ state, profile }) {
  const [filter, setFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ type: 'extract', title: '', date: localISO(), file: null })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const { write, owner } = can(state, profile)

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
  const present = Object.keys(DOC_TYPES).filter((t) => items.some((i) => i.type === t))

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
    <div>
      <PageHeader
        title="Досье"
        subtitle={`Все документы профиля «${profile.name}» в одном месте. Всего: ${items.length}.`}
        actions={
          write && (
            <>
              <Button icon="plus" onClick={() => go('add')}>
                Добавить анализ
              </Button>
              <Button variant="soft" icon="upload" onClick={() => setAdding(!adding)}>
                {adding ? 'Свернуть' : 'Другой документ'}
              </Button>
            </>
          )
        }
      />

      {write && adding && (
        <Card className="mb-6 grid gap-4 lg:grid-cols-2">
          <Field label="Тип документа">
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {ADDABLE.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Дата документа">
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <div className="lg:col-span-2">
            <Field label="Название">
              <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Например, выписка из больницы" />
            </Field>
          </div>
          <div className="lg:col-span-2">
            <Field label="Файл или фото" hint="JPG, PNG, HEIC или PDF, до 25 МБ.">
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setF({ ...f, file: e.target.files[0] || null })} />
            </Field>
          </div>
          <div className="space-y-3 lg:col-span-2">
            <ErrorText>{err}</ErrorText>
            <Button disabled={!f.title.trim() || busy} onClick={submit}>
              {busy ? 'Загружаем…' : owner ? 'Передать помощнику' : 'Добавить в досье'}
            </Button>
          </div>
        </Card>
      )}

      {items.length > 0 && <Tabs value={filter} onChange={setFilter} items={[['all', 'Все', items.length], ...present.map((t) => [t, DOC_TYPES[t]])]} className="mb-4" />}

      {shown.length === 0 ? (
        <Empty icon="folder" action={write && <Button variant="soft" icon="plus" onClick={() => go('add')}>Добавить анализ</Button>}>
          {items.length === 0 ? 'В досье пока пусто. Добавьте бланк анализа или отправьте документ помощнику.' : 'Документов этого типа нет.'}
        </Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet">
          {shown.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 lg:px-5">
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate font-semibold">{docTitle(d.title)}</p>
                <p className="text-sm text-muted">
                  {DOC_TYPES[d.type]}
                  {d.kind === 'lab' && ` · показателей: ${d.count}`}
                  {d.kind === 'doc' && d.addedBy === 'assistant' && ' · добавлено помощником'}
                  {d.kind === 'doc' && d.addedBy === 'client' && ' · добавлено вами или близким'}
                </p>
                {STATUS[d.status] && (
                  <Chip className="mt-1">
                    <Icon name="clock" size={14} />
                    {STATUS[d.status]}
                  </Chip>
                )}
              </div>
              <span className="text-sm text-muted">{fmtDate(d.date)}</span>
              <div className="flex items-center gap-1">
                {d.kind === 'lab' && (
                  <a className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-accent-dark hover:bg-accent-soft" href="#/indicators">
                    Показатели
                  </a>
                )}
                {d.fileUrl && (
                  <a className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-accent-dark hover:bg-accent-soft" href={d.fileUrl} target="_blank" rel="noreferrer">
                    <Icon name="eye" size={16} />
                    Файл
                  </a>
                )}
                {write && d.kind === 'doc' && d.addedBy === 'client' && (
                  <button
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-alert-soft hover:text-alert"
                    aria-label={`Удалить: ${d.title}`}
                    onClick={() => confirm('Удалить документ?') && actions.deleteDocument(d.id)}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {owner && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-accent-soft px-5 py-4">
          <div className="max-w-[56ch]">
            <p className="font-semibold">Паспорт здоровья</p>
            <p className="text-[0.95rem] text-muted">Краткое досье на русском и английском: профиль, лекарства, показатели, документы. Пригодится для лечения за границей или второго мнения.</p>
          </div>
          <Button
            variant="ghost"
            onClick={async () => {
              await actions.createRequest(profile.id, 'Подготовить паспорт здоровья на русском и английском')
              go('assistant')
            }}
          >
            Поручить помощнику
          </Button>
        </div>
      )}
    </div>
  )
}
