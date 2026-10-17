import { useMemo, useState } from 'react'
import { Avatar, Button, Card, Chip, Empty, H, PageHeader, go } from '../components/ui'
import { Icon } from '../components/icons'
import { actions, can } from '../lib/store'
import { latestPoints, isOut } from '../lib/data'
import { docTitle, fmtDate, fmtDateTime, fmtNum, humanize, refText, ageText, SEX } from '../lib/format'
import { CONSENT_LABEL } from './ProfileForm'
import { DOC_TYPES } from './Dossier'

const STEPS = [
  ['user', 'Создайте профиль', 'Свой, мамы или ребёнка. Для другого человека понадобится его согласие или подтверждение, что вы законный представитель.'],
  ['camera', 'Отправьте первый бланк', 'Сфотографируйте анализ или загрузите PDF: помощник внесёт показатели в досье.'],
  ['users', 'Откройте доступ близким', 'Пригласите брата, сестру или сиделку и выберите, что им видно.'],
]

function Welcome({ owner }) {
  return (
    <div className="mx-auto max-w-[640px] py-4 lg:py-10">
      <PageHeader title="Давайте соберём досье" subtitle={owner ? 'Три шага, и все анализы семьи будут в одном месте.' : 'Для вас пока не открыт ни один профиль.'} />
      {owner && (
        <>
          <ol className="relative mb-8 space-y-6">
            <span className="stitch-v absolute bottom-6 left-[19px] top-6" aria-hidden />
            {STEPS.map(([icon, title, text], i) => (
              <li key={title} className="thread-in relative flex gap-4" style={{ '--i': i }}>
                <span className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line-strong bg-card text-accent">
                  <Icon name={icon} size={19} />
                </span>
                <div className="pt-1">
                  <p className="font-semibold">{title}</p>
                  <p className="mt-0.5 text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <Button big icon="plus" onClick={() => go('profile/new')}>
            Создать первый профиль
          </Button>
        </>
      )}
    </div>
  )
}

const KIND_ICON = { lab: 'flask', doc: 'file', vitals: 'pulse' }

function Timeline({ events, write }) {
  const [all, setAll] = useState(false)
  const shown = all ? events : events.slice(0, 7)
  if (!events.length)
    return (
      <Empty icon="flask" action={write && <Button variant="soft" icon="plus" onClick={() => go('add')}>Добавить анализ</Button>}>
        История появится здесь: анализы, документы и замеры по этому человеку.
      </Empty>
    )
  return (
    <div>
      <ol className="relative space-y-3">
        <span className="stitch-v draw-v absolute bottom-6 left-[19px] top-6" aria-hidden />
        {shown.map((e, i) => (
          <li key={e.id} className="thread-in relative flex gap-4" style={{ '--i': Math.min(i, 8) }}>
            <span className={`z-10 mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-card ${e.alert ? 'border-[#e2b9b5] text-alert' : 'border-line-strong text-accent'}`}>
              <Icon name={KIND_ICON[e.kind]} size={19} />
            </span>
            <div className="min-w-0 flex-1 rounded-2xl border border-line bg-card px-4 py-3 shadow-card">{e.body}</div>
          </li>
        ))}
      </ol>
      {events.length > 7 && (
        <div className="mt-4 pl-14">
          <Button variant="quiet" onClick={() => setAll(!all)}>
            {all ? 'Свернуть' : `Показать ещё ${events.length - 7}`}
          </Button>
        </div>
      )}
    </div>
  )
}

export default function Dashboard({ state, profile }) {
  const { owner, write } = can(state)

  const model = useMemo(() => {
    if (!profile) return null
    const latest = latestPoints(state, profile.id)
    const events = []
    for (const r of state.labResults.filter((x) => x.profileId === profile.id)) {
      const ms = state.measurements.filter((m) => m.labResultId === r.id)
      const outCount = ms.filter((m) => m.value != null && ((m.refLow != null && m.value < m.refLow) || (m.refHigh != null && m.value > m.refHigh))).length
      events.push({
        id: 'l' + r.id,
        kind: 'lab',
        date: r.date,
        alert: outCount > 0,
        body: (
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="font-semibold sm:truncate">Анализы, {r.labName}</p>
                <p className="text-sm text-muted">
                  {ms.length} показателей{outCount > 0 && <span className="text-alert"> · вне диапазона лаборатории: {outCount}</span>}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
                {fmtDate(r.date)}
                <Icon name="chevD" size={16} className="transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <table className="mt-2 w-full text-left text-[0.95rem]">
              <tbody>
                {ms.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="py-2 pr-3">
                      <a className="font-medium text-accent-dark hover:underline" href={'#/indicator/' + encodeURIComponent(m.indicatorKey)}>
                        {m.name}
                      </a>
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {fmtNum(m.value)} <span className="text-muted">{m.unit}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {write && (
              <div className="mt-2 flex gap-2 border-t border-line pt-3">
                <Button variant="ghost" icon="edit" className="!min-h-10 text-sm" onClick={() => go('edit/' + r.id)}>
                  Исправить
                </Button>
                <Button variant="danger" icon="trash" className="!min-h-10 text-sm" onClick={() => confirm('Удалить этот анализ?') && actions.deleteLabResult(r.id)}>
                  Удалить
                </Button>
              </div>
            )}
          </details>
        ),
      })
    }
    for (const d of state.documents.filter((x) => x.profileId === profile.id && !(x.type === 'analysis' && x.labResultId))) {
      events.push({
        id: 'd' + d.id,
        kind: 'doc',
        date: d.date,
        body: (
          <a href="#/dossier" className="flex min-h-11 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <p className="font-semibold sm:truncate">{docTitle(d.title)}</p>
              <p className="text-sm text-muted">
                {DOC_TYPES[d.type]}
                {d.status === 'requested' && ' · запрошено помощником'}
                {d.status === 'processing' && ' · помощник вносит в досье'}
              </p>
            </div>
            <span className="shrink-0 text-sm text-muted">{fmtDate(d.date)}</span>
          </a>
        ),
      })
    }
    const vit = state.vitals.filter((v) => v.profileId === profile.id)
    if (vit.length) {
      const v = vit[vit.length - 1]
      events.push({
        id: 'v',
        kind: 'vitals',
        date: v.datetime.slice(0, 10),
        body: (
          <a href="#/vitals" className="flex min-h-11 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div>
              <p className="font-semibold">
                Давление {v.systolic}/{v.diastolic}, пульс {v.pulse}
              </p>
              <p className="text-sm text-muted">Последний замер · всего записей: {vit.length}</p>
            </div>
            <span className="shrink-0 text-sm text-muted">{fmtDateTime(v.datetime)}</span>
          </a>
        ),
      })
    }
    events.sort((a, b) => b.date.localeCompare(a.date))
    return { latest, out: latest.filter((l) => isOut(l.last)), events }
  }, [state, profile, write])

  if (!profile) return <Welcome owner={owner} />

  const { latest, out, events } = model
  const openReq = state.requests.filter((r) => r.status !== 'done').length
  const lastMsg = state.messages.filter((m) => !m.internal).slice(-1)[0]
  const assistant = state.assistant?.name || 'Помощник'
  const me = state.families.find((f) => f.id === state.familyId)
  const meta = [ageText(profile.birthYear), SEX[profile.sex] !== 'не указан' ? SEX[profile.sex] : ''].filter(Boolean).join(' · ')

  return (
    <div>
      <PageHeader
        title={profile.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {meta}
            {profile.consentStatus && profile.consentStatus !== 'self' && <Chip tone={profile.consentStatus === 'confirmed' ? 'accent' : 'quiet'}>{CONSENT_LABEL[profile.consentStatus]}</Chip>}
          </span>
        }
        actions={
          <>
            {write && (
              <Button icon="plus" onClick={() => go('add')}>
                Добавить анализ
              </Button>
            )}
            {owner && (
              <Button variant="ghost" icon="edit" onClick={() => go('profile')} aria-label="Редактировать профиль">
                <span className="hidden sm:inline">Профиль</span>
              </Button>
            )}
          </>
        }
      />

      {!owner && me && (
        <p className="mb-6 rounded-xl bg-accent-soft px-4 py-3 text-[0.95rem]">
          Вы в круге заботы: {me.roleLabel}. {write ? 'Можно просматривать данные и добавлять документы.' : 'Доступ только для просмотра.'}
          {me.expiresAt ? ` Доступ до ${fmtDate(me.expiresAt)}.` : ''}
        </p>
      )}

      <div className="thread-h draw-h -mt-2 mb-7" aria-hidden />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="order-2 min-w-0 lg:order-1">
          <H plain>История</H>
          <Timeline events={events} write={write} />
          <nav className="mt-8 grid gap-2 lg:hidden" aria-label="Быстрые действия">
            {[
              ['vitals', 'pulse', write ? 'Записать давление и пульс' : 'Замеры давления'],
              ['summary', 'sheet', 'Сводка для врача'],
              ...(owner ? [['circle', 'users', 'Круг заботы']] : []),
            ].map(([to, icon, label]) => (
              <a key={to} href={'#/' + to} className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-card px-4 text-[0.95rem] font-medium shadow-card">
                <Icon name={icon} size={19} className="text-accent" />
                {label}
                <Icon name="chevR" size={16} className="ml-auto text-muted" />
              </a>
            ))}
          </nav>
        </div>

        <aside className="order-1 space-y-6 lg:order-2 lg:sticky lg:top-8 lg:self-start">
          <section aria-labelledby="attn">
            <h2 id="attn" className="mb-3 text-lg">
              Вне диапазона лаборатории
            </h2>
            {out.length === 0 ? (
              <p className="rounded-2xl border border-line bg-card px-4 py-4 text-muted shadow-card">
                {latest.length ? 'В последних результатах все показатели внутри диапазона лаборатории.' : 'Пока нет загруженных анализов.'}
              </p>
            ) : (
              <ul className="stitch-edge divide-y divide-line overflow-hidden rounded-2xl bg-card">
                {out.map(({ key, label, last }) => (
                  <li key={key}>
                    <a href={'#/indicator/' + encodeURIComponent(key)} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-alert-soft/60">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-alert-soft text-alert">
                        <Icon name={last.status === 'low' ? 'arrowDown' : 'arrowUp'} size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{label}</span>
                        <span className="block text-sm text-muted">
                          Диапазон {refText(last.refLow, last.refHigh)} · {fmtDate(last.date)}
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-right font-semibold text-alert">
                        {fmtNum(last.value)} <span className="text-sm font-normal">{last.unit}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {owner && (
            <a href="#/assistant" className="linen-rail block rounded-2xl p-5 text-white shadow-pop transition-transform hover:-translate-y-0.5">
              <div className="flex items-center gap-3">
                <Avatar name={assistant} size={44} tone="rail" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{assistant}</p>
                  <p className="text-sm text-white/70">Помощник по здоровью</p>
                </div>
                {state.unread > 0 && <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-semibold text-accent-dark">{state.unread}</span>}
              </div>
              {lastMsg && (
                <p className="mt-4 line-clamp-2 text-[0.95rem] text-white/85">
                  {lastMsg.from === 'assistant' ? '' : 'Вы: '}
                  {humanize(lastMsg.text)}
                </p>
              )}
              <p className="mt-4 flex items-center justify-between text-sm font-medium text-white">
                <span>{openReq > 0 ? `Поручений в работе: ${openReq}` : 'Написать помощнику'}</span>
                <Icon name="chevR" size={18} />
              </p>
            </a>
          )}
        </aside>
      </div>
    </div>
  )
}
