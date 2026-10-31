import { useMemo, useState } from 'react'
import { Button, Chip, Empty, H, PageHeader, go } from '../components/ui'
import { Icon } from '../components/icons'
import { RangeBar } from '../components/RangeBar'
import { actions, can } from '../lib/store'
import { latestPoints, isOut } from '../lib/data'
import { docTitle, fmtDate, fmtNum, refText, ageText, SEX } from '../lib/format'
import { CONSENT_LABEL } from './ProfileForm'
import { DOC_TYPES } from './Dossier'
import { daySchedule, fmtDt, localNow, marked, nextAppointment } from '../lib/care'

function CareBlock({ state, profile, owner, write }) {
  const date = localNow(state.family?.timezone).date
  const { rows } = daySchedule(state, profile.id, date)
  const active = state.medications.filter((m) => m.profileId === profile.id && m.status === 'active')
  const next = nextAppointment(state, profile.id)
  const Row = ({ to, title, hint }) => (
    <li>
      <a href={'#/' + to} className="flex min-h-14 items-center gap-3 px-5 py-3 transition-colors hover:bg-sunken">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          {hint && <span className="block truncate text-sm text-muted">{hint}</span>}
        </span>
        <Icon name="chevR" size={16} className="text-muted" />
      </a>
    </li>
  )
  return (
    <section aria-labelledby="care-h">
      <h2 id="care-h" className="mb-4 text-[1.375rem]">Уход</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet">
        {rows.length > 0 ? <Row to="today" title={`Сегодня: отмечено ${marked(rows)} из ${rows.length}`} hint="Приёмы лекарств и дневник дня" /> : null}
        <Row to={`meds/${profile.id}`} title="Лекарства" hint={active.length ? active.map((m) => m.name).slice(0, 3).join(', ') : 'Пока не добавлены'} />
        <Row to={`visits/${profile.id}`} title="Визиты к врачу" hint={next ? `${next.specialist}, ${fmtDt(next.at)}` : 'Запланированных нет'} />
        {owner && <Row to={`emergency/${profile.id}`} title="Экстренная карточка" hint={state.emergency[profile.id] ? 'Ссылка и QR-код созданы' : 'QR-код для скорой'} />}
      </ul>
    </section>
  )
}

const STEPS = [
  ['user', 'Заведите профиль', 'Свой, мамы или ребёнка. Для другого человека понадобится его согласие или подтверждение, что вы законный представитель.'],
  ['pill', 'Добавьте лекарства', 'Название, доза и время приёма. Отметки приёма появятся на экране «Сегодня».'],
  ['users', 'Пригласите близких', 'Брата, сестру, сиделку или самого человека по ссылке. Вы выбираете, что им видно. Сводка для врача формируется из записей.'],
]

function Welcome({ owner }) {
  return (
    <div className="mx-auto max-w-[640px] py-4 lg:py-10">
      <PageHeader title="Давайте заведём профиль" subtitle={owner ? 'Три шага, и вы будете видеть, что принято сегодня.' : 'Для вас пока не открыт ни один профиль.'} />
      {owner && (
        <>
          <ol className="mb-8 divide-y divide-line border-y border-line">
            {STEPS.map(([, title, text], i) => (
              <li key={title} className="flex gap-5 py-5">
                <span className="num-display w-6 shrink-0 text-2xl font-semibold text-muted">{i + 1}</span>
                <div>
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
      <ol className="divide-y divide-line border-y border-line">
        {shown.map((e) => (
          <li key={e.id} className="grid grid-cols-1 gap-x-4 py-3 sm:grid-cols-[5rem_minmax(0,1fr)] xl:grid-cols-[6.5rem_minmax(0,1fr)]">
            <p className="pt-3 text-sm text-muted sm:pt-3">
              {fmtDate(e.date)}
            </p>
            <div className="min-w-0">{e.body}</div>
          </li>
        ))}
      </ol>
      {events.length > 7 && (
        <div className="mt-4">
          <Button variant="quiet" onClick={() => setAll(!all)}>
            {all ? 'Свернуть' : `Показать ещё ${events.length - 7}`}
          </Button>
        </div>
      )}
    </div>
  )
}

export default function Dashboard({ state, profile }) {
  const { owner, write } = can(state, profile)

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
            <summary className="flex min-h-12 cursor-pointer list-none flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="font-semibold sm:truncate">Анализы, {r.labName}</p>
                <p className="text-sm text-muted">
                  {ms.length} показателей{outCount > 0 && <span className="text-alert"> · вне диапазона лаборатории: {outCount}</span>}
                </p>
              </div>
              <span className="flex shrink-0 items-center text-muted">
                <Icon name="chevD" size={16} className="transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <table className="mt-2 w-full table-fixed text-left text-[0.95rem]">
              <colgroup>
                <col />
                <col className="w-[8.5rem]" />
              </colgroup>
              <tbody>
                {ms.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="break-words py-2 pr-3 [overflow-wrap:anywhere]">
                      <a className="font-medium text-accent-dark hover:underline" href={'#/indicator/' + encodeURIComponent(m.indicatorKey)}>
                        {m.name}
                      </a>
                    </td>
                    <td className="py-2 text-right [overflow-wrap:anywhere]">
                      {fmtNum(m.value)} <span className="text-muted">{m.unit}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {write && (
              <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-3">
                <Button variant="ghost" icon="edit" className="!min-h-12 text-sm" onClick={() => go('edit/' + r.id)}>
                  Исправить
                </Button>
                <Button variant="danger" icon="trash" className="!min-h-12 text-sm" onClick={() => confirm('Удалить этот анализ?') && actions.deleteLabResult(r.id)}>
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
          <a href="#/dossier" className="flex min-h-12 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <p className="font-semibold sm:truncate">{docTitle(d.title)}</p>
              <p className="text-sm text-muted">
                {DOC_TYPES[d.type]}
                {d.status === 'requested' && ' · запрошено помощником'}
                {d.status === 'processing' && ' · вносится сервисом'}
              </p>
            </div>
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
          <a href="#/vitals" className="flex min-h-12 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div>
              <p className="font-semibold">
                Давление {v.systolic}/{v.diastolic}, пульс {v.pulse}
              </p>
              <p className="text-sm text-muted">Последний замер · всего записей: {vit.length}</p>
            </div>
          </a>
        ),
      })
    }
    events.sort((a, b) => b.date.localeCompare(a.date))
    return { latest, out: latest.filter((l) => isOut(l.last)), events }
  }, [state, profile, write])

  if (!profile) return <Welcome owner={owner} />

  const { latest, out, events } = model
  const me = state.families.find((f) => f.id === state.familyId)
  const meta = [ageText(profile.birthYear, profile.birthDate), SEX[profile.sex] !== 'не указан' ? SEX[profile.sex] : ''].filter(Boolean).join(' · ')

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

      {profile.peer && (
        <p className="mb-6 rounded-xl bg-accent-soft px-4 py-3 text-[0.95rem]">
          {profile.name} разрешил(а) показ результатов участникам общей карты. Вы видите анализы, показатели и замеры давления, только для просмотра.
        </p>
      )}

      {!owner && me && !profile.peer && (
        <p className="mb-6 rounded-lg bg-accent-soft px-4 py-3 text-[0.95rem]">
          Вы в круге заботы: {me.roleLabel}. {write ? 'Можно просматривать данные и добавлять документы.' : 'Доступ только для просмотра.'}
          {me.expiresAt ? ` Доступ до ${fmtDate(me.expiresAt)}.` : ''}
        </p>
      )}

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="order-2 min-w-0 xl:order-1">
          <H plain>История</H>
          <Timeline events={events} write={write} />
          <nav className="mt-8 grid gap-2 lg:hidden" aria-label="Быстрые действия">
            {[
              ['vitals', 'pulse', write ? 'Записать давление и пульс' : 'Замеры давления'],
              ['summary', 'sheet', 'Сводка для врача'],
              ...(owner ? [['circle', 'users', 'Круг заботы']] : []),
            ].map(([to, icon, label]) => (
              <a key={to} href={'#/' + to} className="flex min-h-12 items-center gap-3 rounded-2xl bg-card shadow-sheet px-4 text-[0.95rem] font-medium">
                <Icon name={icon} size={19} className="text-muted" />
                {label}
                <Icon name="chevR" size={16} className="ml-auto text-muted" />
              </a>
            ))}
          </nav>
        </div>

        <aside className="order-1 space-y-6 xl:order-2 xl:sticky xl:top-8 xl:self-start">
          <section aria-labelledby="attn">
            <h2 id="attn" className="mb-4 text-[1.375rem]">
              Вне диапазона лаборатории
            </h2>
            {out.length === 0 ? (
              <p className="rounded-2xl bg-card shadow-sheet px-4 py-4 text-muted">
                {latest.length ? 'В последних результатах все показатели внутри диапазона лаборатории.' : 'Пока нет загруженных анализов.'}
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet">
                {out.map(({ key, label, last }, i) => (
                  <li key={key}>
                    <a href={'#/indicator/' + encodeURIComponent(key)} className="block px-5 py-4 transition-colors hover:bg-sunken">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate font-medium">{label}</span>
                        <span className="whitespace-nowrap text-right text-lg font-semibold text-alert">
                          {fmtNum(last.value)} <span className="text-sm font-normal">{last.unit}</span>
                        </span>
                      </span>
                      <RangeBar className="mt-2" index={i} value={last.value} low={last.refLow} high={last.refHigh} unit={last.unit} status={last.status} />
                      <span className="mt-1.5 block text-sm text-muted">
                        Диапазон {refText(last.refLow, last.refHigh)} · {fmtDate(last.date)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!profile.peer && <CareBlock state={state} profile={profile} owner={owner} write={write} />}
        </aside>
      </div>
    </div>
  )
}
