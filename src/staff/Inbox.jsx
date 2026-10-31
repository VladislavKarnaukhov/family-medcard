import { useEffect, useRef, useState } from 'react'
import { api, uploadFile } from '../lib/api'
import { Avatar, Button, Chip, Empty, ErrorText, Field, Tabs, go } from '../components/ui'
import { Icon } from '../components/icons'
import { usePoll } from './hooks'
import { ageText, docTitle, fmtDate, fmtDateTime, humanize, localISO, SEX } from '../lib/format'
import { DOC_TYPES } from '../screens/Dossier'
import { KIND_LABEL, MOOD_LABEL, addDays, fmtDt, localNow } from '../lib/care'

// Блок «Уход»: неотмеченные приёмы за 7 дней, последние записи дневника, ближайший визит.
function CareSection({ data }) {
  const now = localNow(data.family?.timezone)
  const from = addDays(now.date, -7)
  return (
    <Section title="Уход">
      {data.profiles.length === 0 ? (
        <p className="text-sm text-muted">Профилей пока нет.</p>
      ) : (
        <ul className="space-y-4">
          {data.profiles.map((p) => {
            const unmarked = data.intakes.filter((i) => i.profileId === p.id && i.status === 'unmarked' && i.scheduledAt >= `${from}T00:00`)
            const notes = data.careNotes.filter((n) => n.profileId === p.id).slice(0, 5)
            const next = data.appointments.filter((a) => a.profileId === p.id && a.status === 'planned' && a.at >= now.dt).sort((a, b) => a.at.localeCompare(b.at))[0]
            const meds = data.medications.filter((m) => m.profileId === p.id && m.status === 'active').length
            return (
              <li key={p.id} className="space-y-1.5 text-sm">
                <p className="font-semibold">{p.name}</p>
                <p className="text-muted">Лекарств: {meds}. Не отмечено за 7 дней: {unmarked.length}</p>
                {next && <p>Визит: {next.specialist}, {fmtDt(next.at)}</p>}
                {notes.length > 0 && (
                  <ul className="space-y-1 border-l border-line pl-3">
                    {notes.map((n) => (
                      <li key={n.id}>
                        <span className="text-muted">{n.at.slice(5, 10).split('-').reverse().join('.')} {n.at.slice(11)}, {n.bySelf ? n.roleLabel : n.roleLabel}:</span> {KIND_LABEL[n.kind]}{n.mood ? `, ${MOOD_LABEL[n.mood]}` : ''}{n.text ? `. ${n.text}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

export const REQ_STATUS = [
  ['accepted', 'Принято'],
  ['working', 'В работе'],
  ['done', 'Готово'],
]

const TEMPLATES = [
  'Принято, беру в работу. Вернусь с результатом в течение рабочего дня.',
  'Внесла анализ в досье, показатели сверены с бланком.',
  'Запросила документы в клинике: обычно это 3–5 рабочих дней. Сообщу, как получу.',
  'Подскажите, пожалуйста, для какого профиля этот документ?',
  'Подготовила сводку к визиту, она в разделе «Сводка» у нужного профиля.',
]

export function ago(iso) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин`
  if (min < 24 * 60) return `${Math.round(min / 60)} ч`
  return fmtDate(iso.slice(0, 10))
}

// ---------------- список диалогов ----------------
function InboxList({ rows, fid, me }) {
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const list = (rows || []).filter((r) => {
    if (filter === 'unread' && !r.unread) return false
    if (filter === 'mine' && r.assigneeId !== me.id) return false
    return !q || `${r.owner} ${r.email} ${r.profiles.join(' ')}`.toLowerCase().includes(q.toLowerCase())
  })
  const waiting = (rows || []).filter((r) => r.unread).length
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-line px-4 pb-3 pt-5 lg:px-5">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl">Входящие</h1>
          <span className="text-sm text-muted">{waiting > 0 ? `ждут ответа: ${waiting}` : 'всё разобрано'}</span>
        </div>
        <div className="relative">
          <Icon name="search" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input placeholder="Имя, почта, профиль" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск" className="!pl-10" />
        </div>
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            ['all', 'Все'],
            ['unread', 'Ждут ответа'],
            ['mine', 'Мои'],
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!rows ? (
          <p className="p-5 text-muted">Загрузка…</p>
        ) : list.length === 0 ? (
          <div className="p-5">
            <Empty icon="inbox">Ничего не найдено.</Empty>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((r) => (
              <li key={r.id}>
                <a href={`#/f/${r.id}`} className={`flex gap-3 px-4 py-3.5 transition-colors lg:px-5 ${r.id === fid ? 'bg-accent-soft' : 'hover:bg-sunken'}`}>
                  <div className="relative">
                    <Avatar name={r.owner || '?'} size={42} />
                    {r.unread && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-md border-2 border-white bg-accent" aria-label="Ждёт ответа" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate ${r.unread ? 'font-semibold' : 'font-medium'}`}>{r.owner}</span>
                      {r.last && <span className="shrink-0 text-xs text-muted">{ago(r.last.at)}</span>}
                    </div>
                    <p className={`truncate text-[0.95rem] ${r.unread ? 'text-ink' : 'text-muted'}`}>{r.last ? `${r.last.internal ? 'Заметка: ' : r.last.from === 'staff' ? 'Вы: ' : ''}${humanize(r.last.text)}` : 'Сообщений нет'}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {r.pendingDocs > 0 && <Chip tone="solid">на внесение: {r.pendingDocs}</Chip>}
                      {r.openRequests > 0 && <Chip>{r.openRequests} в работе</Chip>}
                      {!r.consent && <Chip tone="outline">нет согласия</Chip>}
                      <span className="text-xs text-muted">{r.assignee ? r.assignee : 'без ответственного'}</span>
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---------------- переписка ----------------
function Thread({ data, reload, fid }) {
  const [text, setText] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [tpl, setTpl] = useState(false)
  const end = useRef(null)
  const n = data.messages.length

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [n, fid])

  const send = async (e) => {
    e?.preventDefault()
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

  let lastDay = ''
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-paper px-4 py-5 lg:px-6" aria-live="polite">
        {data.messages.length === 0 && <li className="py-12 text-center text-muted">Сообщений пока нет.</li>}
        {data.messages.map((m) => {
          const mine = m.from === 'assistant'
          const day = m.at.slice(0, 10)
          const sep = day !== lastDay
          lastDay = day
          return (
            <li key={m.id}>
              {sep && (
                <p className="my-4 flex items-center gap-3 text-xs font-medium text-muted">
                  <span className="stitch-h flex-1" aria-hidden />
                  {day === localISO() ? 'Сегодня' : fmtDate(day)}
                  <span className="stitch-h flex-1" aria-hidden />
                </p>
              )}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-4 py-2.5 lg:max-w-[72%] ${m.internal ? 'stitch-border bg-white' : mine ? 'rounded-br-sm bg-accent-soft text-ink' : 'rounded-bl-sm bg-white '}`}>
                  <p className={`mb-0.5 flex items-center gap-1 text-xs font-medium ${mine && !m.internal ? 'text-muted' : 'text-muted'}`}>
                    {m.internal && <Icon name="lock" size={12} />}
                    {m.internal ? `Внутренняя заметка · ${m.author}` : m.author}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{humanize(m.text)}</p>
                  <p className={`mt-0.5 text-right text-xs ${mine && !m.internal ? 'text-muted' : 'text-muted'}`}>{fmtDateTime(m.at).split(', ').pop()}</p>
                </div>
              </div>
            </li>
          )
        })}
        <li ref={end} />
      </ul>

      <form onSubmit={send} className="space-y-2 border-t border-line bg-card p-3 lg:px-6 lg:py-4">
        {tpl && (
          <ul className="max-h-44 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-white shadow-pop" role="listbox" aria-label="Шаблоны ответов">
            {TEMPLATES.map((t) => (
              <li key={t}>
                <button type="button" className="block min-h-12 w-full px-4 py-2 text-left text-[0.95rem] hover:bg-accent-soft" onClick={() => (setText(t), setTpl(false))}>
                  {t}
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e)
          }}
          placeholder={internal ? 'Заметка для сотрудников. Клиент её не увидит.' : 'Ответ клиенту (Ctrl+Enter, чтобы отправить)'}
          maxLength={4000}
          rows={3}
          className={internal ? '!border-dashed' : ''}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" className="!min-h-12 text-sm" onClick={() => setTpl(!tpl)} aria-expanded={tpl}>
              Шаблоны
            </Button>
            <label className="flex min-h-12 cursor-pointer items-center gap-2 text-[0.95rem]">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="!h-5 !min-h-0 !w-5" />
              Внутренняя заметка
            </label>
          </div>
          <Button type="submit" icon={internal ? 'lock' : 'send'} disabled={busy || !text.trim()}>
            {internal ? 'Сохранить заметку' : 'Отправить'}
          </Button>
        </div>
        <ErrorText>{err}</ErrorText>
      </form>
    </div>
  )
}

// ---------------- справка о клиенте ----------------
function Section({ title, children, count }) {
  return (
    <section className="border-b border-line px-5 py-5 last:border-0">
      <h2 className="mb-3 flex items-baseline justify-between text-base">
        {title}
        {count != null && <span className="text-sm font-normal text-muted">{count}</span>}
      </h2>
      {children}
    </section>
  )
}

function ContextPanel({ data, reload, staff }) {
  const pname = (id) => data.profiles.find((p) => p.id === id)?.name
  const [f, setF] = useState({ profileId: data.profiles[0]?.id || '', type: 'extract', title: '', date: localISO(), file: null })
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const patch = async (id, body) => {
    await api('PATCH', `/api/staff/requests/${id}`, body)
    reload()
  }
  const addDoc = async () => {
    setBusy(true)
    setErr('')
    try {
      const { id } = await api('POST', `/api/profiles/${f.profileId}/documents`, { type: f.type, title: f.title, date: f.date })
      if (f.file) await uploadFile(id, f.file)
      setF({ ...f, title: '', file: null })
      setAdding(false)
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
  const docs = data.documents.slice(0, 12)

  return (
    <div>
      <CareSection data={data} />
      <Section title="Профили" count={data.profiles.length}>
        {data.profiles.length === 0 ? (
          <p className="text-sm text-muted">Профилей пока нет.</p>
        ) : (
          <ul className="space-y-3">
            {data.profiles.map((p) => (
              <li key={p.id}>
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-muted">{[ageText(p.birthYear, p.birthDate), SEX[p.sex]].filter(Boolean).join(' · ')}</p>
                {p.notes && <p className="mt-1 text-sm">{p.notes}</p>}
                <p className="mt-1 text-xs text-muted">
                  Анализов: {data.labResults.filter((l) => l.profileId === p.id).length} · замеров: {data.vitals.filter((v) => v.profileId === p.id).length} · документов: {data.documents.filter((d) => d.profileId === p.id).length}
                </p>
                {p.consentStatus !== 'self' && <Chip tone={p.consentStatus === 'confirmed' ? 'accent' : 'quiet'} className="mt-1">{p.consentStatus === 'confirmed' ? 'Согласие подтверждено самим человеком' : 'Согласие заявлено владельцем'}</Chip>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Поручения" count={data.requests.filter((r) => r.status !== 'done').length || null}>
        {data.requests.length === 0 ? (
          <p className="text-sm text-muted">Поручений нет.</p>
        ) : (
          <ul className="space-y-4">
            {data.requests.map((r) => (
              <li key={r.id}>
                <p className="font-medium">{r.title}</p>
                <p className="text-sm text-muted">
                  {pname(r.profileId) || 'без профиля'} · {r.due ? `срок ${fmtDate(r.due)}` : fmtDateTime(r.createdAt)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {REQ_STATUS.map(([s, l]) => (
                    <button key={s} onClick={() => patch(r.id, { status: s })} aria-pressed={r.status === s} className={`min-h-12 rounded-md px-3 text-sm font-medium ${r.status === s ? 'bg-accent text-white' : 'border border-line-strong bg-card hover:bg-sunken'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <select aria-label="Ответственный" className="!mt-2 !min-h-12 !py-1 text-sm" value={staff.find((s) => s.name === r.assignee)?.id || ''} onChange={(e) => patch(r.id, { assigneeId: e.target.value })}>
                  <option value="">Не назначен</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Документы" count={data.documents.length}>
        <ul className="space-y-3">
          {docs.length === 0 && <li className="text-sm text-muted">Документов нет.</li>}
          {docs.map((d) => (
            <li key={d.id}>
              <p className="text-[0.95rem] font-medium">{docTitle(d.title)}</p>
              <p className="text-sm text-muted">
                {pname(d.profileId)} · {DOC_TYPES[d.type]} · {fmtDate(d.date)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {d.status === 'processing' && <Chip tone="solid">ждёт внесения</Chip>}
                {d.status === 'requested' && <Chip>запрошено в клинике</Chip>}
                {d.fileUrl && (
                  <a className="inline-flex min-h-12 items-center gap-1 rounded-lg px-2 text-sm font-medium text-accent-dark hover:bg-accent-soft" href={d.fileUrl} target="_blank" rel="noreferrer">
                    <Icon name="eye" size={15} /> Файл
                  </a>
                )}
                {d.status === 'processing' && d.fileUrl && d.type === 'analysis' && (
                  <a className="inline-flex min-h-12 items-center gap-1 rounded-lg bg-accent px-3 text-sm font-medium text-white" href={`#/process/${d.id}`}>
                    Внести показатели
                  </a>
                )}
                {d.status === 'processing' && d.type !== 'analysis' && (
                  <button
                    className="inline-flex min-h-12 items-center gap-1 rounded-lg bg-accent px-3 text-sm font-medium text-white"
                    onClick={async () => {
                      await api('PATCH', `/api/staff/documents/${d.id}`, { status: 'ready' })
                      reload()
                    }}
                  >
                    Принять в досье
                  </button>
                )}
                {d.status === 'requested' && (
                  <label className="inline-flex min-h-12 cursor-pointer items-center rounded-lg px-2 text-sm font-medium text-accent-dark hover:bg-accent-soft">
                    Загрузить файл
                    <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => e.target.files[0] && attach(d, e.target.files[0])} />
                  </label>
                )}
              </div>
            </li>
          ))}
        </ul>
        {data.documents.length > docs.length && <p className="mt-2 text-xs text-muted">Показаны последние {docs.length} из {data.documents.length}</p>}
        {data.profiles.length > 0 && (
          <div className="mt-4">
            {adding ? (
              <div className="space-y-3 rounded-xl bg-paper p-3">
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
                <ErrorText>{err}</ErrorText>
                <div className="flex gap-2">
                  <Button disabled={busy || !f.title.trim()} onClick={addDoc}>
                    Добавить
                  </Button>
                  <Button variant="ghost" onClick={() => setAdding(false)}>
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="soft" icon="plus" className="!min-h-12 text-sm" onClick={() => setAdding(true)}>
                Добавить документ клиенту
              </Button>
            )}
          </div>
        )}
      </Section>
    </div>
  )
}

// ---------------- диалог ----------------
function Conversation({ fid, staff, row }) {
  const [tab, setTab] = useState('chat')
  const [data, reload] = usePoll(
    () => api('GET', `/api/staff/families/${fid}`).catch((e) => (e.status === 423 ? { blocked: e.message } : Promise.reject(e))),
    4000,
    [fid],
  )
  const n = data?.messages?.length

  useEffect(() => {
    setTab('chat')
  }, [fid])
  useEffect(() => {
    if (data && !data.blocked) api('POST', `/api/staff/families/${fid}/read`, {}).catch(() => {})
  }, [fid, n]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data)
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        <span className="inline-block h-5 w-5 animate-spin rounded-md border-2 border-accent-soft border-t-accent" />
      </div>
    )
  if (data.blocked)
    return (
      <div className="m-6 h-fit max-w-[560px] rounded-2xl border border-[#e2b9b5] bg-alert-soft p-5">
        <p className="flex items-center gap-2 font-semibold text-alert">
          <Icon name="lock" size={19} /> Доступ к данным закрыт
        </p>
        <p className="mt-1">{data.blocked}</p>
        <p className="mt-2 text-sm text-muted">Данные и документы не открываются, пока клиент не подпишет согласие.</p>
      </div>
    )

  const assign = async (e) => {
    await api('PATCH', `/api/staff/families/${fid}`, { assigneeId: e.target.value })
    reload()
  }
  const openReq = data.requests.filter((r) => r.status !== 'done').length
  const pending = data.documents.filter((d) => d.status === 'processing').length

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className={`min-w-0 flex-1 flex-col ${tab === 'chat' ? 'flex' : 'hidden xl:flex'}`}>
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line bg-card px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <a href="#/" className="flex h-12 w-12 items-center justify-center rounded-lg text-muted hover:bg-sunken lg:hidden" aria-label="К списку">
              <Icon name="chevL" size={20} />
            </a>
            <Avatar name={data.owner?.name || '?'} size={44} />
            <div className="min-w-0">
              <h2 className="truncate text-lg">{data.owner?.name}</h2>
              <p className="truncate text-sm text-muted">
                {data.owner?.email}
                {row?.waitingSince ? <span className="font-semibold text-accent"> · ждёт ответа {ago(row.waitingSince)}</span> : ''}
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Ответственный</span>
            <select value={data.assigneeId || ''} onChange={assign} className="!min-h-12 !w-auto !py-1">
              <option value="">Не назначен</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </header>
        <div className="border-b border-line bg-card px-4 py-2 xl:hidden">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              ['chat', 'Переписка'],
              ['info', `Клиент${openReq || pending ? ` · ${openReq + pending}` : ''}`],
            ]}
          />
        </div>
        <Thread data={data} reload={reload} fid={fid} />
      </div>

      <aside className={`min-h-0 w-full shrink-0 overflow-y-auto border-l border-line bg-card xl:block xl:w-[340px] ${tab === 'info' ? 'block' : 'hidden'}`}>
        <div className="border-b border-line px-4 py-2 xl:hidden">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              ['chat', 'Переписка'],
              ['info', 'Клиент'],
            ]}
          />
        </div>
        <ContextPanel data={data} reload={reload} staff={staff} />
      </aside>
    </div>
  )
}

export default function Inbox({ fid, me, staff, inbox }) {
  const row = (inbox || []).find((r) => r.id === fid)
  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[560px] lg:h-screen">
      <section className={`${fid ? 'hidden lg:block' : 'block'} w-full shrink-0 border-r border-line bg-card lg:w-[340px]`}>
        <InboxList rows={inbox} fid={fid} me={me} />
      </section>
      <section className={`${fid ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 bg-paper`}>
        {fid ? (
          <Conversation key={fid} fid={fid} staff={staff} row={row} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <Empty icon="chat">Выберите диалог слева.</Empty>
          </div>
        )}
      </section>
    </div>
  )
}
