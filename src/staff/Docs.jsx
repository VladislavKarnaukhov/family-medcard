import { useState } from 'react'
import { api } from '../lib/api'
import { Button, Card, Chip, Empty, ErrorText, PageHeader, Tabs, Toggle, go } from '../components/ui'
import { Icon } from '../components/icons'
import { Preview, ResultForm } from '../components/ResultForm'
import { usePoll } from './hooks'
import { draftBad, draftRows, emptyDraft } from '../lib/draft'
import { normalizeRow } from '../lib/indicators'
import { docTitle, fmtDateTime, localISO } from '../lib/format'
import { DOC_TYPES } from '../screens/Dossier'
import { ago } from './Inbox'

export function DocQueue() {
  const [view, setView] = useState('queue')
  const [rows] = usePoll(() => api('GET', `/api/staff/documents${view === 'all' ? '?all=1' : ''}`), 6000, [view])
  return (
    <div>
      <PageHeader title="Документы" subtitle="Очередь на внесение и все файлы, которые прислали клиенты, в том числе при самостоятельном внесении." />
      <Tabs className="mb-6" value={view} onChange={setView} items={[['queue', 'Ждут внесения'], ['all', 'Все файлы']]} />
      {!rows ? (
        <p className="text-muted">Загрузка…</p>
      ) : rows.length === 0 ? (
        <Empty icon="sheet">{view === 'all' ? 'Файлов пока нет.' : 'Очередь пуста.'}</Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet ">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon name={d.status === 'requested' ? 'clock' : 'flask'} size={21} />
              </span>
              <div className="min-w-0 flex-1 basis-60">
                <p className="truncate font-semibold">{docTitle(d.title)}</p>
                <p className="text-sm text-muted">
                  <a className="font-medium text-accent-dark hover:underline" href={`#/f/${d.familyId}`}>
                    {d.owner}
                  </a>{' '}
                  · {d.profile} · {DOC_TYPES[d.type]}
                </p>
              </div>
              <Chip tone={d.status === 'processing' ? 'solid' : 'quiet'}>{d.status === 'requested' ? 'запрошено в клинике' : d.status === 'processing' ? `ждёт внесения · ${ago(d.createdAt)}` : `в досье · ${ago(d.createdAt)}`}</Chip>
              <div className="flex items-center gap-1">
                {d.fileUrl && (
                  <a className="inline-flex min-h-12 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-accent-dark hover:bg-accent-soft" href={d.fileUrl} target="_blank" rel="noreferrer">
                    <Icon name="eye" size={16} /> Файл
                  </a>
                )}
                {d.status === 'processing' && d.fileUrl && d.type === 'analysis' && (
                  <Button className="!min-h-12 text-sm" onClick={() => go(`process/${d.id}`)}>
                    Внести показатели
                  </Button>
                )}
                {d.status === 'processing' && d.type !== 'analysis' && (
                  <Button
                    className="!min-h-12 text-sm"
                    onClick={async () => {
                      await api('PATCH', `/api/staff/documents/${d.id}`, { status: 'ready' })
                      location.reload()
                    }}
                  >
                    Принять в досье
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Внесение показателей из присланного бланка: бланк рядом с таблицей.
export function Process({ id }) {
  const [rows] = usePoll(() => api('GET', '/api/staff/documents'), 60000, [id])
  const [draft, setDraft] = useState(() => emptyDraft(localISO()))
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const doc = rows?.find((d) => d.id === id)

  if (!rows) return <p className="text-muted">Загрузка…</p>
  if (!doc)
    return (
      <Empty icon="check" action={<Button variant="soft" onClick={() => go('docs')}>К очереди</Button>}>
        Документ уже обработан или не найден.
      </Empty>
    )

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      const out = draftRows(draft).map((r) => ({ ...r, ...normalizeRow(r) }))
      await api('POST', `/api/staff/documents/${id}/process`, { date: draft.date, labName: draft.labName, rows: out, notify })
      go(`f/${doc.familyId}`)
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }
  const closeAsIs = async () => {
    await api('PATCH', `/api/staff/documents/${id}`, { status: 'ready' })
    go('docs')
  }

  return (
    <div>
      <PageHeader
        title="Внесение показателей"
        subtitle={`${doc.owner} · ${doc.profile} · ${doc.title}. Загружено ${fmtDateTime(doc.createdAt)}.`}
        back={{ href: '#/docs', label: 'К очереди' }}
        actions={
          confirmClose ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-line">
              <span className="text-[0.95rem]">Документ останется в досье без показателей.</span>
              <Button className="!min-h-12 text-sm" onClick={closeAsIs}>
                Закрыть
              </Button>
              <Button variant="ghost" className="!min-h-12 text-sm" onClick={() => setConfirmClose(false)}>
                Отмена
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmClose(true)}>
              Закрыть без внесения
            </Button>
          )
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="lg:sticky lg:top-0 lg:self-start">
          <Preview url={doc.fileUrl} name={doc.fileName} />
        </div>
        <div className="min-w-0">
          <ResultForm draft={draft} onChange={setDraft} />
          <Card className="mt-6 space-y-4">
            <Toggle checked={notify} onChange={setNotify}>
              Сообщить клиенту в переписке, что анализ внесён
            </Toggle>
            {draftBad(draft) && <p className="text-sm text-muted">Чтобы сохранить, заполните дату, лабораторию и числовое значение в каждой строке.</p>}
            <ErrorText>{err}</ErrorText>
            <div className="flex flex-wrap items-center gap-3">
              <Button icon="check" disabled={draftBad(draft) || busy} onClick={save}>
                {busy ? 'Сохраняем…' : 'Сохранить в досье'}
              </Button>
              <p className="text-sm text-muted">Перед сохранением сверьте каждое значение, единицу и референс с бланком.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
