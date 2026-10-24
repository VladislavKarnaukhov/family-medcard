import { useEffect, useState } from 'react'
import { Button, Chip, Empty, ErrorText, H, PageHeader, go } from '../components/ui'
import { Icon } from '../components/icons'
import { actions, can } from '../lib/store'
import { KIND_LABEL, MOOD_LABEL, NEEDS, daySchedule, fmtDt, isMarker, localNow, marked, nextAppointment } from '../lib/care'

export function useNow(ms = 30000) {
  const [n, setN] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return n
}

const STATE_TEXT = { taken: 'принято', skipped: 'пропущено', unmarked: 'не отмечен', due: 'время приёма', later: '' }

// Одна строка приёма: время, лекарство, крупные кнопки отметки.
export function IntakeRow({ row, write, simple, onDone }) {
  const [skip, setSkip] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const done = row.state === 'taken' || row.state === 'skipped'
  const send = async (status) => {
    setBusy(true)
    setErr('')
    try {
      await actions.markIntake(row.med.id, row.at, status, status === 'skipped' ? reason : '')
      setSkip(false)
      setReason('')
      onDone?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  const btn = simple ? '!min-h-14 !text-xl' : '!min-h-12'
  return (
    <li className={`py-4 ${simple ? 'py-5' : ''}`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className={`num-display font-semibold ${simple ? 'text-4xl' : 'text-2xl'}`}>{row.time}</p>
        <div className="min-w-0 flex-1 basis-48">
          <p className={`font-semibold ${simple ? 'text-2xl' : 'text-lg'}`}>{row.med.name}</p>
          <p className={`text-muted ${simple ? 'text-lg' : ''}`}>{[row.med.dose, row.med.note].filter(Boolean).join(' · ')}</p>
        </div>
        {done ? (
          <p className={`${simple ? 'text-lg' : 'text-[0.95rem]'} ${row.state === 'taken' ? 'font-semibold text-accent-dark' : 'text-muted'}`}>
            {row.state === 'taken' ? 'Принято' : 'Пропущено'}
            <span className="font-normal text-muted"> · {row.intake.bySelf ? (simple ? 'вы' : 'сама(сам)') : row.intake.by}, {row.intake.markedAt ? new Date(row.intake.markedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
          </p>
        ) : (
          <Chip tone={row.state === 'due' ? 'accent' : 'quiet'}>{STATE_TEXT[row.state] || 'позже'}</Chip>
        )}
      </div>
      {write && !skip && (
        <div className="mt-3 flex flex-wrap gap-3">
          <Button className={`${btn} flex-1 sm:flex-none sm:min-w-40`} variant={done && row.state === 'taken' ? 'soft' : 'primary'} icon="check" disabled={busy} onClick={() => send('taken')}>
            {simple ? 'Принял(а)' : 'Принял'}
          </Button>
          <Button className={`${btn} flex-1 sm:flex-none sm:min-w-40`} variant="ghost" disabled={busy} onClick={() => setSkip(true)}>
            {simple ? 'Пропустил(а)' : 'Пропустил'}
          </Button>
        </div>
      )}
      {skip && (
        <div className="mt-3 space-y-3">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина (необязательно)" maxLength={200} aria-label="Причина" />
          <div className="flex gap-3">
            <Button className={btn} disabled={busy} onClick={() => send('skipped')}>
              Подтвердить
            </Button>
            <Button className={btn} variant="ghost" onClick={() => setSkip(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}
      <ErrorText>{err}</ErrorText>
    </li>
  )
}

function PrnRow({ item, write, simple, tz }) {
  const [busy, setBusy] = useState(false)
  const now = localNow(tz)
  return (
    <li className="flex flex-wrap items-center gap-3 py-4">
      <div className="min-w-0 flex-1 basis-48">
        <p className={`font-semibold ${simple ? 'text-2xl' : 'text-lg'}`}>{item.med.name}</p>
        <p className="text-muted">
          {[item.med.dose, 'по необходимости'].filter(Boolean).join(' · ')}
          {item.taken.length > 0 && ` · сегодня принято: ${item.taken.length}`}
        </p>
      </div>
      {write && (
        <Button variant="soft" className={simple ? '!min-h-14 !text-xl' : ''} disabled={busy} onClick={async () => (setBusy(true), await actions.markIntake(item.med.id, now.dt, 'taken').finally(() => setBusy(false)))}>
          Принял(а) сейчас
        </Button>
      )}
    </li>
  )
}
// Быстрая отметка самочувствия: слова человека без оценок и цвета.
export function MoodRow({ profile, simple }) {
  const [sent, setSent] = useState('')
  const [err, setErr] = useState('')
  const send = async (mood) => {
    setErr('')
    try {
      await actions.addNote(profile.id, { kind: 'wellbeing', mood })
      setSent(mood)
    } catch (e) {
      setErr(e.message)
    }
  }
  return (
    <div>
      <p className={`mb-3 font-medium ${simple ? 'text-2xl' : 'text-lg'}`}>{simple ? 'Как вы себя чувствуете?' : 'Самочувствие сегодня'}</p>
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(MOOD_LABEL).map(([k, v]) => (
          <Button key={k} variant={sent === k ? 'primary' : 'ghost'} className={simple ? '!min-h-16 !text-xl' : ''} onClick={() => send(k)}>
            {v}
          </Button>
        ))}
      </div>
      <ErrorText>{err}</ErrorText>
    </div>
  )
}

export function DayFeed({ state, profile, date, simple }) {
  const notes = state.careNotes.filter((n) => n.profileId === profile.id && n.at.slice(0, 10) === date)
  const vit = state.vitals.filter((v) => v.profileId === profile.id && v.datetime.slice(0, 10) === date)
  const items = [
    ...notes.map((n) => ({ at: n.at, key: n.id, node: <NoteLine n={n} state={state} simple={simple} /> })),
    ...vit.map((v) => ({
      at: v.datetime,
      key: v.id,
      node: (
        <p>
          <span className="font-medium">Давление {v.systolic}/{v.diastolic}, пульс {v.pulse}</span>
        </p>
      ),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  if (!items.length) return <p className="text-muted">За сегодня записей нет.</p>
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((i) => (
        <li key={i.key} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 py-3">
          <p className="text-muted">{i.at.slice(11)}</p>
          <div className="min-w-0">{i.node}</div>
        </li>
      ))}
    </ul>
  )
}

function NoteLine({ n, state, simple }) {
  const mine = state.user && n.authorId === state.user.id
  const editable = mine && Date.now() - Date.parse(n.createdAt) < 86400000
  return (
    <div>
      <p>
        <span className="font-medium">{KIND_LABEL[n.kind]}</span>
        {n.mood && <span>: {MOOD_LABEL[n.mood]}</span>}
        {n.text && <span className="whitespace-pre-wrap break-words">{n.mood ? '. ' : ': '}{n.text}</span>}
      </p>
      {n.kind === 'fall' && n.needsDoctor && <p className="text-sm text-muted">Нужна помощь врача: {NEEDS[n.needsDoctor]} (со слов автора)</p>}
      <p className="text-sm text-muted">
        {n.bySelf ? n.roleLabel : `${n.author}, ${n.roleLabel}`}
        {editable && !simple && (
          <button className="ml-3 font-medium text-accent-dark hover:underline" onClick={() => confirm('Удалить запись?') && actions.deleteNote(n.id)}>
            Удалить
          </button>
        )}
      </p>
    </div>
  )
}

export function TodayContent({ state, profile, simple = false }) {
  useNow()
  const tz = state.family?.timezone || 'Europe/Moscow'
  const { write } = can(state)
  const now = localNow(tz)
  const { rows, prn } = daySchedule(state, profile.id, now.date)
  const next = nextAppointment(state, profile.id)
  const self = state.me?.selfProfileId === profile.id
  const first = rows.find((r) => r.state === 'due' || r.state === 'unmarked') || rows.find((r) => r.state === 'later')
  const sizeH = simple ? 'text-2xl' : 'text-[1.375rem]'

  return (
    <div className={simple ? 'space-y-10' : 'space-y-2'}>
      <section aria-labelledby="meds-h">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 id="meds-h" className={sizeH}>Лекарства</h2>
          {rows.length > 0 && <p className={`text-muted ${simple ? 'text-xl' : ''}`}>Отмечено {marked(rows)} из {rows.length}</p>}
        </div>
        {rows.length === 0 && prn.length === 0 ? (
          <Empty icon="file" action={can(state).owner && <Button variant="soft" icon="plus" onClick={() => go(`meds/${profile.id}/new`)}>Добавить лекарство</Button>}>
            Добавьте лекарства, чтобы видеть приёмы на сегодня.
          </Empty>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {simple && first ? <IntakeRow key={first.at + first.med.id} row={first} write={write} simple /> : null}
            {rows.filter((r) => !(simple && r === first)).map((r) => (
              <IntakeRow key={r.at + r.med.id} row={r} write={write} simple={simple} />
            ))}
            {prn.map((p) => (
              <PrnRow key={p.med.id} item={p} write={write} simple={simple} tz={tz} />
            ))}
          </ul>
        )}
      </section>

      {write && (
        <section className={simple ? '' : 'pt-8'}>
          <MoodRow profile={profile} simple={simple} />
        </section>
      )}

      <section className={simple ? '' : 'pt-8'}>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className={sizeH}>{simple ? 'Что было сегодня' : 'Дневник дня'}</h2>
          {write && !simple && (
            <div className="flex gap-4 text-sm font-medium text-accent-dark">
              <a className="hover:underline" href={`#/care/${profile.id}/new`}>Записать</a>
              <a className="hover:underline" href="#/vitals">Давление</a>
            </div>
          )}
        </div>
        <DayFeed state={state} profile={profile} date={now.date} simple={simple} />
        {write && simple && (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="ghost" className="!min-h-14 !text-xl" onClick={() => go(`care/${profile.id}/new`)}>Записать</Button>
            <Button variant="ghost" className="!min-h-14 !text-xl" onClick={() => go(`care/${profile.id}/new/fall`)}>Я упал(а)</Button>
          </div>
        )}
      </section>

      {next && (
        <section className={simple ? '' : 'pt-8'}>
          <h2 className={`mb-2 ${sizeH}`}>Ближайший визит</h2>
          <a href={`#/visits/${profile.id}/${next.id}`} className="lift block rounded-2xl bg-card p-5 shadow-sheet">
            <p className={`font-semibold ${simple ? 'text-2xl' : 'text-lg'}`}>{next.specialist}</p>
            <p className="text-muted">{fmtDt(next.at)}{next.address ? ` · ${next.address}` : ''}</p>
          </a>
        </section>
      )}
      {!simple && !write && <p className="text-sm text-muted">У вас доступ только для просмотра.</p>}
    </div>
  )
}

export default function Today({ state, profile }) {
  if (!profile) return <Empty icon="user" action={<Button onClick={() => go('profile/new')}>Создать профиль</Button>}>Сначала создайте профиль.</Empty>
  return (
    <div>
      <PageHeader title="Сегодня" subtitle={`Профиль «${profile.name}»: приёмы лекарств, самочувствие и ближайший визит.`} />
      <div className="max-w-[760px]">
        <TodayContent state={state} profile={profile} />
        <p className="mt-10 text-sm text-muted">Напоминания приходят, когда сайт открыт, или письмом.</p>
      </div>
    </div>
  )
}

// Плашка «Время принять лекарство»: пока сайт открыт, показывается тому, кто отмечает приёмы профиля.
export function DueBanner({ state }) {
  useNow(20000)
  const [sound] = useState(() => {
    try {
      return localStorage.getItem('blizkie-sound') === '1'
    } catch {
      return false
    }
  })
  const tzx = state.family?.timezone || 'Europe/Moscow'
  const now = localNow(tzx)
  const due = []
  for (const p of state.profiles) {
    if (!isMarker(state, p) || !can(state).write) continue
    const { rows } = daySchedule(state, p.id, now.date)
    for (const r of rows) if (r.state === 'due') due.push({ p, r })
  }
  const key = due.map((d) => d.r.at + d.r.med.id).join('|')
  useEffect(() => {
    if (!key || !sound) return
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const o = ctx.createOscillator()
      o.frequency.value = 660
      o.connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + 0.25)
    } catch {
      /* звук недоступен */
    }
  }, [key, sound])
  if (!due.length) return null
  const d = due[0]
  return (
    <div role="alert" className="no-print fixed inset-x-3 top-3 z-40 mx-auto max-w-[560px] rounded-2xl bg-card p-5 shadow-pop ring-1 ring-line">
      <p className="text-lg font-semibold">Время принять лекарство</p>
      <p className="mt-0.5 text-muted">
        {d.r.time}: {d.r.med.name}
        {state.profiles.length > 1 ? `, ${d.p.name}` : ''}
        {due.length > 1 ? ` и ещё ${due.length - 1}` : ''}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button className="!min-h-14 flex-1" icon="check" onClick={() => actions.markIntake(d.r.med.id, d.r.at, 'taken')}>
          Принял(а)
        </Button>
        <Button className="!min-h-14 flex-1" variant="ghost" onClick={() => go('today')}>
          Открыть
        </Button>
      </div>
    </div>
  )
}
