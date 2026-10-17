import { useEffect, useRef, useState } from 'react'
import { api, uploadFile } from '../lib/api'
import { Button, Card, Empty, Field, go, useRoute } from '../components/ui'
import { usePoll } from './hooks'
import { ageText, fmtDate, fmtDateTime, localISO, parseNum, SEX } from '../lib/format'
import { normalizeRow } from '../lib/indicators'
import { recognize } from '../lib/recognize'
import { RowEditor, toDraft } from '../screens/AddResult'

const DOC_TYPES = { analysis: 'Анализы', extract: 'Выписки', imaging: 'Исследования и снимки', prescription: 'Рецепты', vaccine: 'Прививки', insurance: 'Полисы и страховка' }
const REQ_STATUS = [
  ['accepted', 'Принято'],
  ['working', 'В работе'],
  ['done', 'Готово'],
]
const TEMPLATES = [
  'Принято, беру в работу. Вернусь с результатом в течение рабочего дня.',
  'Внесла анализ в досье, показатели сверены с бланком.',
  'Запросила документы в клинике — обычно это 3–5 рабочих дней. Сообщу, как получу.',
  'Подскажите, пожалуйста, для какого профиля этот документ?',
  'Подготовила сводку к визиту, она в разделе «Сводка» у нужного профиля.',
]

const Badge = ({ children, tone = 'accent' }) => (
  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone === 'alert' ? 'bg-alert-soft text-alert' : 'bg-accent-soft text-accent-dark'}`}>{children}</span>
)

// ---------------- вход ----------------
function Login({ onDone }) {
  const [f, setF] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      const me = await api('POST', '/api/auth/login', f)
      if (me.user.role !== 'staff') {
        await api('POST', '/api/auth/logout', {})
        throw new Error('Эта учётная запись не относится к сотрудникам')
      }
      onDone(me.user)
    } catch (e2) {
      setErr(e2.message)
    }
  }
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-1 text-2xl font-semibold">Близкие · рабочее место</h1>
      <p className="mb-6 text-muted">Вход для сотрудников сервиса</p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email">
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="username" required />
        </Field>
        <Field label="Пароль">
          <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" required />
        </Field>
        {err && <p role="alert" className="rounded-xl bg-alert-soft p-3 text-alert">{err}</p>}
        <Button type="submit" big>
          Войти
        </Button>
      </form>
    </div>
  )
}

// ---------------- входящие ----------------
function InboxList({ rows, fid, me }) {
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const list = (rows || []).filter((r) => {
    if (filter === 'unread' && !r.unread) return false
    if (filter === 'mine' && r.assigneeId !== me.id) return false
    return !q || `${r.owner} ${r.email} ${r.profiles.join(' ')}`.toLowerCase().includes(q.toLowerCase())
  })
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {[
          ['all', 'Все'],
          ['unread', 'Ждут ответа'],
          ['mine', 'Мои'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`min-h-10 rounded-full px-4 text-sm ${filter === k ? 'bg-accent text-white' : 'border border-line bg-card'}`}>
            {l}
          </button>
        ))}
      </div>
      <input placeholder="Поиск по имени, email, профилю" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск" className="mb-3" />
      {!rows ? (
        <p className="text-muted">Загрузка…</p>
      ) : list.length === 0 ? (
        <Empty>Ничего не найдено.</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id}>
              <a href={`#/f/${r.id}`} className={`block rounded-2xl border p-3 ${r.id === fid ? 'border-accent bg-accent-soft' : 'border-line bg-card'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate ${r.unread ? 'font-semibold' : ''}`}>
                    {r.unread && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-alert" aria-label="Ждёт ответа" />}
                    {r.owner}
                  </span>
                  {r.last && <span className="shrink-0 text-xs text-muted">{fmtDateTime(r.last.at)}</span>}
                </div>
                <p className="truncate text-sm text-muted">
                  {r.last ? `${r.last.internal ? 'Заметка: ' : r.last.from === 'staff' ? 'Вы: ' : ''}${r.last.text}` : 'Сообщений нет'}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {r.openRequests > 0 && <Badge>{r.openRequests} поруч.</Badge>}
                  {r.pendingDocs > 0 && <Badge tone="alert">{r.pendingDocs} док. на внесение</Badge>}
                  <span className="text-xs text-muted">{r.assignee ? `отв.: ${r.assignee}` : 'без ответственного'}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Thread({ data, reload, fid }) {
  const [text, setText] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const end = useRef(null)
  const n = data.messages.length

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [n])

  const send = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    setErr('')
    try {
      await api('POST', `/api/staff/families/${fid}/messages`, { text: text.trim(), internal })
      setText('')
      await reload()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <ul className="max-h-[50vh] min-h-40 space-y-2 overflow-y-auto rounded-2xl border border-line bg-paper p-3" aria-live="polite">
        {data.messages.length === 0 && <li className="text-muted">Сообщений пока нет.</li>}
        {data.messages.map((m) => (
          <li key={m.id} className={`flex ${m.from === 'assistant' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${m.internal ? 'border border-amber-300 bg-amber-50' : m.from === 'assistant' ? 'bg-accent text-white' : 'border border-line bg-card'}`}>
              <p className={`text-xs font-medium ${m.from === 'assistant' && !m.internal ? 'text-white/85' : 'text-muted'}`}>
                {m.internal ? `Внутренняя заметка · ${m.author}` : m.author}
              </p>
              <p className="whitespace-pre-wrap">{m.text}</p>
              <p className={`mt-1 text-xs ${m.from === 'assistant' && !m.internal ? 'text-white/80' : 'text-muted'}`}>{fmtDateTime(m.at)}</p>
            </div>
          </li>
        ))}
        <li ref={end} />
      </ul>
      <form onSubmit={send} className="mt-3 space-y-2">
        <select aria-label="Шаблон ответа" value="" onChange={(e) => e.target.value && setText(e.target.value)}>
          <option value="">Шаблон ответа…</option>
          {TEMPLATES.map((t) => (
            <option key={t} value={t}>
              {t.slice(0, 70)}
            </option>
          ))}
        </select>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={internal ? 'Заметка для сотрудников (клиент её не увидит)' : 'Ответ клиенту'} maxLength={4000} className={internal ? '!bg-amber-50' : ''} />
        <div className="flex items-center justify-between gap-3">
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="!h-5 !min-h-0 !w-5" />
            Внутренняя заметка
          </label>
          <Button type="submit" disabled={busy || !text.trim()}>
            {internal ? 'Сохранить заметку' : 'Отправить'}
          </Button>
        </div>
        {err && <p role="alert" className="text-alert">{err}</p>}
      </form>
    </div>
  )
}

function Requests({ data, reload, staff }) {
  const name = (id) => data.profiles.find((p) => p.id === id)?.name
  const patch = async (id, body) => {
    await api('PATCH', `/api/staff/requests/${id}`, body)
    reload()
  }
  if (!data.requests.length) return <Empty>Поручений нет.</Empty>
  return (
    <ul className="space-y-2">
      {data.requests.map((r) => (
        <li key={r.id} className="rounded-2xl border border-line bg-card p-3">
          <div className="font-medium">{r.title}</div>
          <div className="text-sm text-muted">
            {name(r.profileId) || 'без профиля'} · создано {fmtDateTime(r.createdAt)} · срок {r.due ? fmtDate(r.due) : '—'}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {REQ_STATUS.map(([s, l]) => (
              <button key={s} onClick={() => patch(r.id, { status: s })} aria-pressed={r.status === s} className={`min-h-10 rounded-full px-4 text-sm ${r.status === s ? 'bg-accent text-white' : 'border border-line bg-card'}`}>
                {l}
              </button>
            ))}
            <select aria-label="Ответственный" className="!w-auto !min-h-10" value={staff.find((s) => s.name === r.assignee)?.id || ''} onChange={(e) => patch(r.id, { assigneeId: e.target.value })}>
              <option value="">Не назначен</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </li>
      ))}
    </ul>
  )
}

function FamilyDocs({ data, reload }) {
  const [f, setF] = useState({ profileId: data.profiles[0]?.id || '', type: 'extract', title: '', date: localISO(), file: null })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pname = (id) => data.profiles.find((p) => p.id === id)?.name

  const add = async () => {
    setBusy(true)
    setErr('')
    try {
      const { id } = await api('POST', `/api/profiles/${f.profileId}/documents`, { type: f.type, title: f.title, date: f.date })
      if (f.file) await uploadFile(id, f.file)
      setF({ ...f, title: '', file: null })
      await reload()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  const attach = async (d, file) => {
    await uploadFile(d.id, file)
    await api('PATCH', `/api/staff/documents/${d.id}`, { status: 'ready' })
    reload()
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {data.documents.length === 0 && <Empty>Документов нет.</Empty>}
        {data.documents.map((d) => (
          <li key={d.id} className="rounded-2xl border border-line bg-card p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{d.title}</span>
              <span className="shrink-0 text-sm text-muted">{fmtDate(d.date)}</span>
            </div>
            <div className="text-sm text-muted">
              {pname(d.profileId)} · {DOC_TYPES[d.type]}
              {d.status === 'processing' && ' · ждёт внесения'}
              {d.status === 'requested' && ' · запрошено в клинике'}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {d.fileUrl && (
                <a className="min-h-10 py-2 text-accent-dark underline" href={d.fileUrl} target="_blank" rel="noreferrer">
                  Открыть файл
                </a>
              )}
              {d.status === 'processing' && d.fileUrl && (
                <a className="min-h-10 py-2 font-medium text-accent-dark underline" href={`#/process/${d.id}`}>
                  Внести показатели →
                </a>
              )}
              {d.status === 'requested' && (
                <label className="min-h-10 cursor-pointer py-2 text-accent-dark underline">
                  Загрузить полученный файл
                  <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => e.target.files[0] && attach(d, e.target.files[0])} />
                </label>
              )}
            </div>
          </li>
        ))}
      </ul>
      {data.profiles.length > 0 && (
        <Card className="space-y-3">
          <p className="font-medium">Добавить документ в досье клиента</p>
          <Field label="Профиль">
            <select value={f.profileId} onChange={(e) => setF({ ...f, profileId: e.target.value })}>
              {data.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Тип">
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {Object.entries(DOC_TYPES)
                .filter(([k]) => k !== 'analysis')
                .map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Название">
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <Field label="Дата документа">
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Файл">
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setF({ ...f, file: e.target.files[0] || null })} />
          </Field>
          {err && <p role="alert" className="text-alert">{err}</p>}
          <Button className="w-full" disabled={busy || !f.title.trim()} onClick={add}>
            Добавить
          </Button>
        </Card>
      )}
    </div>
  )
}

function ProfilesInfo({ data }) {
  if (!data.profiles.length) return <Empty>Профилей нет.</Empty>
  return (
    <ul className="space-y-2">
      {data.profiles.map((p) => (
        <li key={p.id} className="rounded-2xl border border-line bg-card p-3">
          <div className="font-medium">{p.name}</div>
          <div className="text-sm text-muted">{[ageText(p.birthYear), SEX[p.sex]].filter(Boolean).join(' · ')}</div>
          <p className="mt-1 text-sm">{p.notes || 'Заметок нет'}</p>
          <p className="text-sm text-muted">
            Анализов: {data.labResults.filter((l) => l.profileId === p.id).length} · замеров: {data.vitals.filter((v) => v.profileId === p.id).length} · документов:{' '}
            {data.documents.filter((d) => d.profileId === p.id).length}
          </p>
        </li>
      ))}
    </ul>
  )
}

function Conversation({ fid, staff }) {
  const [tab, setTab] = useState('chat')
  const [data, reload] = usePoll(() => api('GET', `/api/staff/families/${fid}`), 4000, [fid])
  const n = data?.messages.length

  useEffect(() => {
    if (data) api('POST', `/api/staff/families/${fid}/read`, {}).catch(() => {})
  }, [fid, n]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <p className="text-muted">Загрузка…</p>
  const pending = data.documents.filter((d) => d.status === 'processing').length
  const open = data.requests.filter((r) => r.status !== 'done').length

  const assign = async (e) => {
    await api('PATCH', `/api/staff/families/${fid}`, { assigneeId: e.target.value })
    reload()
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{data.owner?.name}</h2>
          <p className="text-sm text-muted">{data.owner?.email} · профили: {data.profiles.map((p) => p.name).join(', ') || '—'}</p>
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Ответственный</span>
          <select value={data.assigneeId || ''} onChange={assign} className="!min-h-10">
            <option value="">Не назначен</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mb-3 flex flex-wrap gap-2" role="tablist">
        {[
          ['chat', 'Переписка'],
          ['req', `Поручения${open ? ` · ${open}` : ''}`],
          ['docs', `Документы${pending ? ` · ${pending}` : ''}`],
          ['prof', 'Профили'],
        ].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-10 rounded-full px-4 text-sm ${tab === k ? 'bg-accent text-white' : 'border border-line bg-card'}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'chat' && <Thread data={data} reload={reload} fid={fid} />}
      {tab === 'req' && <Requests data={data} reload={reload} staff={staff} />}
      {tab === 'docs' && <FamilyDocs data={data} reload={reload} />}
      {tab === 'prof' && <ProfilesInfo data={data} />}
    </div>
  )
}

function Inbox({ fid, me, staff, inbox }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className={fid ? 'hidden lg:block' : ''}>
        <InboxList rows={inbox} fid={fid} me={me} />
      </div>
      <div>
        {fid ? (
          <>
            <a href="#/" className="mb-2 inline-block min-h-10 py-2 text-accent-dark underline lg:hidden">
              ← Входящие
            </a>
            <Conversation fid={fid} staff={staff} />
          </>
        ) : (
          <Empty>Выберите диалог слева.</Empty>
        )}
      </div>
    </div>
  )
}

// ---------------- поручения (все) ----------------
function Board({ me, staff }) {
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Поручения</h1>
        <button onClick={() => setMine(!mine)} aria-pressed={mine} className={`min-h-10 rounded-full px-4 text-sm ${mine ? 'bg-accent text-white' : 'border border-line bg-card'}`}>
          Только мои
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {REQ_STATUS.map(([s, label]) => {
          const col = list.filter((r) => r.status === s)
          return (
            <section key={s} aria-label={label}>
              <h2 className="mb-2 font-semibold">
                {label} <span className="font-normal text-muted">{col.length}</span>
              </h2>
              <ul className="space-y-2">
                {col.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-line bg-card p-3">
                    <a href={`#/f/${r.familyId}`} className="font-medium underline-offset-2 hover:underline">
                      {r.title}
                    </a>
                    <div className="text-sm text-muted">
                      {r.owner} · {r.profile || 'без профиля'} · срок {r.due ? fmtDate(r.due) : '—'}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {REQ_STATUS.filter(([k]) => k !== s).map(([k, l]) => (
                        <button key={k} onClick={() => patch(r.id, { status: k })} className="min-h-9 rounded-full border border-line px-3 text-sm">
                          → {l}
                        </button>
                      ))}
                      <select aria-label="Ответственный" className="!min-h-9 !w-auto !py-1 text-sm" value={r.assigneeId || ''} onChange={(e) => patch(r.id, { assigneeId: e.target.value })}>
                        <option value="">Не назначен</option>
                        {staff.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
                {col.length === 0 && <li className="text-sm text-muted">Пусто</li>}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ---------------- очередь документов ----------------
function DocQueue() {
  const [rows] = usePoll(() => api('GET', '/api/staff/documents'), 6000, [])
  if (!rows) return <p className="text-muted">Загрузка…</p>
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Документы на обработку</h1>
      {rows.length === 0 ? (
        <Empty>Очередь пуста.</Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => (
            <li key={d.id} className="rounded-2xl border border-line bg-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{d.title}</span>
                <span className="shrink-0 text-sm text-muted">загружено {fmtDateTime(d.createdAt)}</span>
              </div>
              <div className="text-sm text-muted">
                <a className="underline" href={`#/f/${d.familyId}`}>{d.owner}</a> · {d.profile} · {DOC_TYPES[d.type]} · {d.status === 'requested' ? 'запрошено в клинике' : 'ждёт внесения'}
              </div>
              <div className="mt-1 flex gap-4">
                {d.fileUrl && (
                  <a className="min-h-10 py-2 text-accent-dark underline" href={d.fileUrl} target="_blank" rel="noreferrer">
                    Открыть файл
                  </a>
                )}
                {d.status === 'processing' && d.fileUrl && (
                  <a className="min-h-10 py-2 font-medium text-accent-dark underline" href={`#/process/${d.id}`}>
                    Внести показатели →
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------- внесение показателей ----------------
function Process({ id }) {
  const [rows] = usePoll(() => api('GET', '/api/staff/documents'), 60000, [id])
  const [form, setForm] = useState({ date: localISO(), labName: '', notify: true, rows: [{ name: '', value: '', unit: '', refLow: '', refHigh: '' }] })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const doc = rows?.find((d) => d.id === id)

  if (!rows) return <p className="text-muted">Загрузка…</p>
  if (!doc) return <Empty>Документ уже обработан или не найден. <a className="underline" href="#/docs">К очереди</a></Empty>

  const pdf = /\.pdf$/i.test(doc.fileName || '')
  const set = (p) => setForm({ ...form, ...p })
  const ok = form.labName.trim() && form.date && form.rows.length && form.rows.every((r) => r.name.trim() && parseNum(r.value) != null)

  const prefill = async () => {
    const [r] = await recognize([{ name: doc.fileName || 'file' }])
    const d = toDraft(r)
    set({ labName: d.labName, rows: d.rows })
  }

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      const out = form.rows.map((r) => {
        const base = { name: r.name, value: parseNum(r.value), unit: r.unit, refLow: r.refLow.trim() === '' ? null : parseNum(r.refLow), refHigh: r.refHigh.trim() === '' ? null : parseNum(r.refHigh) }
        return { ...base, ...normalizeRow(base) }
      })
      await api('POST', `/api/staff/documents/${id}/process`, { date: form.date, labName: form.labName, rows: out, notify: form.notify })
      go(`f/${doc.familyId}`)
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div>
      <a href="#/docs" className="mb-2 inline-block min-h-10 py-2 text-accent-dark underline">← К очереди</a>
      <h1 className="mb-1 text-2xl font-semibold">Внесение показателей</h1>
      <p className="mb-4 text-muted">
        {doc.owner} · {doc.profile} · {doc.title}
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-line bg-paper lg:sticky lg:top-4 lg:self-start">
          {pdf ? <object data={doc.fileUrl} type="application/pdf" className="h-[75vh] w-full"><a href={doc.fileUrl}>Открыть PDF</a></object> : <img src={doc.fileUrl} alt={`Бланк: ${doc.fileName}`} className="max-h-[75vh] w-full object-contain" />}
        </div>
        <div className="space-y-3">
          <Card className="grid grid-cols-2 gap-3">
            <Field label="Дата анализа">
              <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
            <Field label="Лаборатория">
              <input value={form.labName} onChange={(e) => set({ labName: e.target.value })} />
            </Field>
          </Card>
          <Button variant="soft" className="w-full" onClick={prefill}>
            Подставить демо-распознавание
          </Button>
          <ul className="space-y-3">
            {form.rows.map((r, i) => (
              <RowEditor key={i} row={r} onChange={(x) => set({ rows: form.rows.map((y, j) => (j === i ? x : y)) })} onDelete={() => set({ rows: form.rows.filter((_, j) => j !== i) })} />
            ))}
          </ul>
          <Button variant="soft" className="w-full" onClick={() => set({ rows: [...form.rows, { name: '', value: '', unit: '', refLow: '', refHigh: '' }] })}>
            ＋ Добавить строку
          </Button>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={form.notify} onChange={(e) => set({ notify: e.target.checked })} className="!h-5 !min-h-0 !w-5" />
            Сообщить клиенту в переписке
          </label>
          {err && <p role="alert" className="text-alert">{err}</p>}
          <Button big disabled={!ok || busy} onClick={save}>
            {busy ? 'Сохраняем…' : 'Сохранить в досье'}
          </Button>
          <p className="text-sm text-muted">Перед сохранением сверьте каждое значение, единицу и референс с бланком.</p>
        </div>
      </div>
    </div>
  )
}

// ---------------- каркас ----------------
export default function StaffApp() {
  const [user, setUser] = useState(undefined)
  const route = useRoute()

  useEffect(() => {
    api('GET', '/api/me').then((m) => setUser(m.user.role === 'staff' ? m.user : null)).catch(() => setUser(null))
    const out = () => setUser(null)
    window.addEventListener('staff-auth', out)
    return () => window.removeEventListener('staff-auth', out)
  }, [])

  const [inbox] = usePoll(() => (user ? api('GET', '/api/staff/inbox') : Promise.resolve(null)), 5000, [user?.id])
  const [staff] = usePoll(() => (user ? api('GET', '/api/staff/staff-list') : Promise.resolve([])), 60000, [user?.id])

  if (user === undefined) return <p className="p-8 text-muted">Загрузка…</p>
  if (!user) return <Login onDone={setUser} />

  const unread = (inbox || []).filter((r) => r.unread).length
  const pending = (inbox || []).reduce((s, r) => s + r.pendingDocs, 0)
  const view = route[0] || ''
  const logout = async () => {
    await api('POST', '/api/auth/logout', {})
    setUser(null)
  }
  const tab = (to, label, n) => (
    <a href={`#/${to}`} aria-current={(view === to || (to === '' && view === 'f')) ? 'page' : undefined} className={`flex min-h-11 items-center gap-2 rounded-full px-4 ${view === to || (to === '' && view === 'f') ? 'bg-white text-ink' : 'text-white/85 hover:bg-white/10'}`}>
      {label}
      {n > 0 && <span className="rounded-full bg-alert px-2 text-xs text-white">{n}</span>}
    </a>
  )

  return (
    <div className="min-h-screen">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-xl font-semibold">Близкие</span>
            <span className="text-sm text-white/70">рабочее место</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Разделы">
            {tab('', 'Входящие', unread)}
            {tab('requests', 'Поручения')}
            {tab('docs', 'Документы', pending)}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/80">{user.name}</span>
            <button onClick={logout} className="min-h-10 rounded-full border border-white/30 px-4">
              Выйти
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {view === 'requests' ? (
          <Board me={user} staff={staff || []} />
        ) : view === 'docs' ? (
          <DocQueue />
        ) : view === 'process' ? (
          <Process id={route[1]} />
        ) : (
          <Inbox fid={view === 'f' ? route[1] : null} me={user} staff={staff || []} inbox={inbox} />
        )}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-sm text-muted">Данные клиентов доступны только для работы по их поручениям. Каждое открытие семьи попадает в журнал клиента.</footer>
    </div>
  )
}
