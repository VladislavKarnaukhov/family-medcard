import { useState } from 'react'
import { Button, Empty, Notice, PageHeader, Tabs } from '../components/ui'
import { actions, can } from '../lib/store'
import { latestPoints, isOut } from '../lib/data'
import { vitalsSince } from './Vitals'
import { ageText, fmtDate, fmtDateTime, fmtNum, localISO, refText, SEX } from '../lib/format'

const PERIODS = [
  ['7', '7 дней', 7],
  ['30', '30 дней', 30],
  ['90', '3 месяца', 90],
  ['180', '6 месяцев', 180],
  ['365', 'Год', 365],
  ['730', '2 года', 730],
]
const MAX_MISSED = 8
const MAX_CHANGES = 10
const MAX_OUT = 6
const DAY = 86400000

const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length

function changeText(first, last) {
  const d = last.value - first.value
  if (d === 0) return 'без изменений'
  const pct = first.value ? (d / Math.abs(first.value)) * 100 : null
  return `${d > 0 ? '+' : '−'}${fmtNum(Math.abs(Number(d.toPrecision(3))))}${pct != null ? ` (${d > 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%)` : ''}`
}

const Th = ({ children, right }) => <th className={`border-b border-line-strong py-1.5 pr-2 text-xs font-medium text-muted ${right ? 'text-right' : 'text-left'}`}>{children}</th>

function Block({ title, children }) {
  return (
    <section className="keep mt-5 first:mt-0">
      <h3 className="mb-1.5 text-base font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function fmtAt(at) {
  return `${fmtDate(at.slice(0, 10))}, ${at.slice(11)}`
}

// Отметки приёмов: только факты, без оценок. Считаются приёмы, у которых уже прошёл час на отметку.
function Adherence({ data, days }) {
  const r = data && (days <= 7 ? data.d7 : data.d30)
  if (!r || !r.planned) return <p className="text-sm text-muted">За выбранный период плановых приёмов ещё не было.</p>
  return (
    <>
      <p className="text-sm">
        Отмечено <strong>{r.taken + r.skipped}</strong> из <strong>{r.planned}</strong> плановых приёмов ({r.percent}%): принято {r.taken}, пропущено {r.skipped}, не отмечено {r.unmarked}.
      </p>
      {r.missed.length > 0 && (
        <p className="mt-1 text-sm text-muted">
          Не отмечено: {r.missed.slice(0, MAX_MISSED).map((x) => `${fmtAt(x.at)} ${x.medication}`).join('; ')}
          {r.missed.length > MAX_MISSED || r.unmarked > r.missed.length ? ' и другие' : ''}.
        </p>
      )}
    </>
  )
}

export default function Summary({ state, profile, readOnly = false }) {
  const meds = (state.medications || []).filter((m) => m.profileId === profile?.id && m.status === 'active')
  const [period, setPeriod] = useState(() => (PERIODS.some((p) => p[0] === new URLSearchParams(location.search).get('days')) ? new URLSearchParams(location.search).get('days') : '180'))
  const [hint, setHint] = useState(false)
  if (!profile) return <Empty icon="sheet">Сначала создайте профиль.</Empty>

  const days = Number(period)
  const since = Date.now() - days * DAY
  const all = latestPoints(state, profile.id, since)
  const out = all.filter((l) => isOut(l.last))
  const changes = all.filter((l) => l.series.length >= 2)
  const vit = vitalsSince(state, profile.id, days)
  const questions = state.questions[profile.id] || ''
  const sexText = SEX[profile.sex || '']
  const editable = !readOnly && can(state, profile).write
  const periodLabel = PERIODS.find((p) => p[0] === period)[1].toLowerCase()

  const pdf = () => {
    setHint(true)
    setTimeout(window.print, 50)
  }

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Сводка для врача"
          subtitle="Одна страница A4 по выбранному профилю и периоду: что менялось, что вне диапазона лаборатории, замеры давления и ваши вопросы."
          actions={
            <>
              <Button icon="printer" className="flex-1 whitespace-nowrap !px-4 sm:flex-none" onClick={() => window.print()}>
                Распечатать
              </Button>
              <Button variant="soft" icon="download" className="flex-1 whitespace-nowrap !px-4 sm:flex-none" onClick={pdf}>
                Скачать PDF
              </Button>
            </>
          }
        />
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm font-medium text-muted">Период</span>
          <Tabs value={period} onChange={setPeriod} items={PERIODS.map(([k, l]) => [k, l])} />
        </div>
        {hint && <Notice className="mb-5">В окне печати выберите «Сохранить как PDF».</Notice>}
      </div>

      <article id="sheet" className="sheet tabular-nums mx-auto max-w-[860px] rounded-2xl border border-line bg-white p-5 text-[0.95rem] leading-snug shadow-pop sm:p-8 print:max-w-none">
        <header className="border-b border-line-strong pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl">Сводка для врача: {profile.name}</h2>
            <span className="shrink-0 text-sm text-muted">{fmtDate(localISO())}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {[profile.birthYear && `${profile.birthYear} г. р. (${ageText(profile.birthYear)})`, sexText !== 'не указан' && `пол: ${sexText}`].filter(Boolean).join(' · ') || 'Данные профиля не заполнены'}
            {' · период: '}
            {periodLabel}
          </p>
          {profile.notes && (
            <p className="mt-2 text-sm">
              <strong>Хронические заболевания (со слов):</strong> {profile.notes}
            </p>
          )}
          {profile.allergies && (
            <p className="mt-1 text-sm">
              <strong>Аллергии:</strong> {profile.allergies}
            </p>
          )}
          {meds.length > 0 && (
            <p className="mt-1 text-sm">
              <strong>Принимает сейчас:</strong>{' '}
              {meds.map((m) => [m.name, m.dose, m.times.length ? m.times.join(', ') : 'по необходимости'].filter(Boolean).join(', ')).join('; ')}
            </p>
          )}
        </header>

        {meds.length > 0 && (
          <Block title={`Приём лекарств за ${days <= 7 ? '7' : '30'} дней`}>
            <Adherence data={state.adherence?.[profile.id]} days={days} />
          </Block>
        )}

        <Block title="Вне диапазона лаборатории (последнее значение)">
          {out.length === 0 ? (
            <p className="text-sm text-muted">Нет таких показателей за выбранный период.</p>
          ) : (
            <>
              <table className="hidden w-full text-sm sm:table print:table">
                <thead>
                  <tr>
                    <Th>Показатель</Th>
                    <Th right>Значение</Th>
                    <Th right>Диапазон лаборатории</Th>
                    <Th right>Дата, лаборатория</Th>
                  </tr>
                </thead>
                <tbody>
                  {out.slice(0, MAX_OUT).map(({ key, label, last }) => (
                    <tr key={key} className="border-b border-line">
                      <td className="py-1.5 pr-2">{label}</td>
                      <td className="py-1.5 pr-2 text-right font-semibold">
                        {fmtNum(last.value)} {last.unit} <span className="font-normal text-muted">({last.status === 'low' ? 'ниже' : 'выше'})</span>
                      </td>
                      <td className="py-1.5 pr-2 text-right">{refText(last.refLow, last.refHigh)}</td>
                      <td className="py-1.5 text-right">
                        {fmtDate(last.date)}, {last.lab}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-line sm:hidden print:hidden">
                {out.slice(0, MAX_OUT).map(({ key, label, last }) => (
                  <li key={key} className="py-2">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">{label}</span>
                      <span className="font-semibold">
                        {fmtNum(last.value)} {last.unit}
                      </span>
                    </div>
                    <p className="text-sm text-muted">
                      {last.status === 'low' ? 'Ниже' : 'Выше'} диапазона лаборатории {refText(last.refLow, last.refHigh)} · {fmtDate(last.date)}, {last.lab}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
          {out.length > MAX_OUT && <p className="mt-1 text-xs text-muted">и ещё {out.length - MAX_OUT}</p>}
        </Block>

        <Block title="Что менялось">
          {changes.length === 0 ? (
            <p className="text-sm text-muted">Для сравнения нужно минимум два анализа одного показателя за период.</p>
          ) : (
            <>
              <table className="hidden w-full text-sm sm:table print:table">
                <thead>
                  <tr>
                    <Th>Показатель</Th>
                    <Th right>Было → стало</Th>
                    <Th right>Изменение</Th>
                    <Th right>Даты</Th>
                  </tr>
                </thead>
                <tbody>
                  {changes.slice(0, MAX_CHANGES).map(({ key, label, series }) => {
                    const f = series[0]
                    const l = series[series.length - 1]
                    return (
                      <tr key={key} className="border-b border-line">
                        <td className="py-1.5 pr-2">{label}</td>
                        <td className="py-1.5 pr-2 text-right">
                          {fmtNum(f.value)} → {fmtNum(l.value)} {l.unit}
                        </td>
                        <td className="py-1.5 pr-2 text-right">{changeText(f, l)}</td>
                        <td className="whitespace-nowrap py-1.5 text-right">
                          {fmtDate(f.date)} – {fmtDate(l.date)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <ul className="divide-y divide-line sm:hidden print:hidden">
                {changes.slice(0, MAX_CHANGES).map(({ key, label, series }) => {
                  const f = series[0]
                  const l = series[series.length - 1]
                  return (
                    <li key={key} className="py-2">
                      <p className="font-medium">{label}</p>
                      <p className="text-sm text-muted">
                        {fmtNum(f.value)} → {fmtNum(l.value)} {l.unit} · {changeText(f, l)}
                      </p>
                      <p className="text-sm text-muted">
                        {fmtDate(f.date)} – {fmtDate(l.date)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          {changes.length > MAX_CHANGES && <p className="mt-1 text-xs text-muted">и ещё {changes.length - MAX_CHANGES} показателей: в приложении</p>}
        </Block>

        <Block title="Давление и пульс">
          {vit.length === 0 ? (
            <p className="text-sm text-muted">Замеров за выбранный период нет.</p>
          ) : (
            <>
              <p className="text-sm">
                Замеров: {vit.length}. Среднее: {Math.round(avg(vit.map((v) => v.systolic)))}/{Math.round(avg(vit.map((v) => v.diastolic)))}, пульс {Math.round(avg(vit.map((v) => v.pulse)))}. Верхнее:{' '}
                {Math.min(...vit.map((v) => v.systolic))}–{Math.max(...vit.map((v) => v.systolic))}, нижнее: {Math.min(...vit.map((v) => v.diastolic))}–{Math.max(...vit.map((v) => v.diastolic))}.
              </p>
              <p className="mt-1 text-sm text-muted">
                Последние:{' '}
                {vit
                  .slice(-5)
                  .reverse()
                  .map((v) => `${v.systolic}/${v.diastolic} (${fmtDateTime(v.datetime)})`)
                  .join('; ')}
              </p>
            </>
          )}
        </Block>

        <Block title="Мои вопросы врачу">
          {editable && <textarea className="no-print" value={questions} onChange={(e) => actions.setQuestions(profile.id, e.target.value)} placeholder="Запишите вопросы, чтобы не забыть на приёме" />}
          <div className={`${editable ? 'print-only' : ''} whitespace-pre-wrap text-sm`}>
            {questions.trim() ? (
              questions
            ) : (
              <>
                <div className="h-6 border-b border-line-strong" />
                <div className="h-6 border-b border-line-strong" />
                <div className="h-6 border-b border-line-strong" />
              </>
            )}
          </div>
        </Block>

        <p className="mt-5 border-t border-line-strong pt-2 text-xs text-muted">
          Источник: данные, введённые из бланков лабораторий. Сравнение только с диапазоном, указанным лабораторией. Сервис не заменяет консультацию врача.
        </p>
      </article>
    </div>
  )
}
