import { useState } from 'react'
import { api } from '../lib/api'
import { Chip, Empty, PageHeader } from '../components/ui'
import { usePoll } from './hooks'
import { fmtDate } from '../lib/format'
import { REQ_STATUS } from './Inbox'

export default function Board({ me, staff }) {
  const [rows, reload] = usePoll(() => api('GET', '/api/staff/requests'), 6000, [])
  const [mine, setMine] = useState(false)
  if (!rows) return <p className="text-muted">Загрузка…</p>
  const list = rows.filter((r) => !mine || r.assigneeId === me.id)
  const patch = async (id, body) => {
    await api('PATCH', `/api/staff/requests/${id}`, body)
    reload()
  }
  return (
    <div>
      <PageHeader
        title="Поручения"
        subtitle="Что клиенты просят сделать и на каком этапе работа."
        actions={
          <button onClick={() => setMine(!mine)} aria-pressed={mine} className={`min-h-12 rounded-md px-5 font-medium transition-colors ${mine ? 'bg-accent text-white' : 'border border-line-strong bg-card hover:bg-sunken'}`}>
            Только мои
          </button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        {REQ_STATUS.map(([s, label]) => {
          const col = list.filter((r) => r.status === s)
          return (
            <section key={s} aria-label={label} className="rounded-xl bg-paper p-3 ring-1 ring-line">
              <h2 className="mb-3 flex items-baseline gap-2 px-1 text-base">
                {label} <span className="text-sm font-normal text-muted">{col.length}</span>
              </h2>
              <ul className="space-y-3">
                {col.map((r) => {
                  const late = r.status !== 'done' && r.due && r.due < new Date().toISOString().slice(0, 10)
                  return (
                    <li key={r.id} className="rounded-2xl bg-card shadow-sheet p-4 ">
                      <a href={`#/f/${r.familyId}`} className="font-semibold hover:underline">
                        {r.title}
                      </a>
                      <p className="mt-1 text-sm text-muted">
                        {r.owner} · {r.profile || 'без профиля'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {r.due && <Chip tone={late ? 'solid' : 'quiet'}>{late ? 'просрочено · ' : ''}срок {fmtDate(r.due)}</Chip>}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {REQ_STATUS.filter(([k]) => k !== s).map(([k, l]) => (
                          <button key={k} onClick={() => patch(r.id, { status: k })} className="min-h-12 rounded-md border border-line-strong px-3 text-sm font-medium hover:bg-accent-soft">
                            → {l}
                          </button>
                        ))}
                      </div>
                      <select aria-label="Ответственный" className="!mt-2 !min-h-12 !py-1 text-sm" value={r.assigneeId || ''} onChange={(e) => patch(r.id, { assigneeId: e.target.value })}>
                        <option value="">Не назначен</option>
                        {staff.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </li>
                  )
                })}
                {col.length === 0 && (
                  <li>
                    <Empty icon="board">Пусто</Empty>
                  </li>
                )}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
