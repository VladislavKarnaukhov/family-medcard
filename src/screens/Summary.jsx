import { useState } from 'react'
import { Button, Empty, Field } from '../components/ui'
import { actions } from '../lib/store'
import { latestPoints, isOut } from '../lib/data'
import { vitalsSince } from './Vitals'
import { ageText, fmtDate, fmtDateTime, fmtNum, localISO, refText, SEX } from '../lib/format'

const PERIODS = [
  [90, '3 месяца'],
  [180, '6 месяцев'],
  [365, 'Год'],
  [730, '2 года'],
]
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

function Th({ children, right }) {
  return <th className={`border-b border-line py-1 pr-2 text-xs font-medium text-muted ${right ? 'text-right' : 'text-left'}`}>{children}</th>
}

export default function Summary({ state, profile }) {
  const [days, setDays] = useState(Number(new URLSearchParams(location.search).get('days')) || 180)
  const [hint, setHint] = useState(false)
  if (!profile) return <Empty>Сначала создайте профиль.</Empty>

  const since = Date.now() - days * DAY
  const all = latestPoints(state, profile.id, since)
  const out = all.filter((l) => isOut(l.last))
  const changes = all.filter((l) => l.series.length >= 2)
  const vit = vitalsSince(state, profile.id, days)
  const questions = state.questions[profile.id] || ''
  const sexText = SEX[profile.sex || '']

  const print = () => window.print()
  const pdf = () => {
    setHint(true)
    setTimeout(window.print, 50)
  }

  return (
    <div className="py-4">
      <div className="no-print">
        <h1 className="text-2xl font-semibold">Сводка для врача</h1>
        <p className="mb-3 text-muted">Одна страница A4 по выбранному профилю и периоду.</p>
        <Field label="Период">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {PERIODS.map(([d, l]) => (
              <option key={d} value={d}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button onClick={print}>Распечатать</Button>
          <Button variant="soft" onClick={pdf}>
            Скачать PDF
          </Button>
        </div>
        {hint && <p className="mt-2 text-sm text-muted">В окне печати выберите «Сохранить как PDF».</p>}
      </div>

      <article id="sheet" className="sheet mt-4 rounded-2xl border border-line bg-card p-4 text-[0.95rem] leading-snug">
        <header className="border-b border-line pb-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Сводка для врача — {profile.name}</h2>
            <span className="text-sm text-muted">{fmtDate(localISO())}</span>
          </div>
          <p className="text-sm text-muted">
            {[profile.birthYear && `${profile.birthYear} г. р. (${ageText(profile.birthYear)})`, sexText !== 'не указан' && `пол: ${sexText}`]
              .filter(Boolean)
              .join(' · ') || 'Данные профиля не заполнены'}
            {' · период: '}
            {PERIODS.find((p) => p[0] === days)[1].toLowerCase()}
          </p>
          {profile.notes && (
            <p className="mt-1 text-sm">
              <strong>Хронические заболевания и лекарства (со слов):</strong> {profile.notes}
            </p>
          )}
        </header>

        <section className="keep mt-3">
          <h3 className="font-semibold">Вне диапазона лаборатории (последнее значение)</h3>
          {out.length === 0 ? (
            <p className="text-sm text-muted">Нет таких показателей за выбранный период.</p>
          ) : (
            <table className="w-full text-sm">
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
                  <tr key={key} className="border-b border-line/60">
                    <td className="py-1 pr-2">{label}</td>
                    <td className="py-1 pr-2 text-right font-medium">
                      {last.status === 'low' ? '↓' : '↑'} {fmtNum(last.value)} {last.unit}
                    </td>
                    <td className="py-1 pr-2 text-right">{refText(last.refLow, last.refHigh)}</td>
                    <td className="py-1 text-right">
                      {fmtDate(last.date)}, {last.lab}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {out.length > MAX_OUT && <p className="text-xs text-muted">и ещё {out.length - MAX_OUT}</p>}
        </section>

        <section className="keep mt-3">
          <h3 className="font-semibold">Что менялось</h3>
          {changes.length === 0 ? (
            <p className="text-sm text-muted">Для сравнения нужно минимум два анализа одного показателя за период.</p>
          ) : (
            <table className="w-full text-sm">
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
                    <tr key={key} className="border-b border-line/60">
                      <td className="py-1 pr-2">{label}</td>
                      <td className="py-1 pr-2 text-right">
                        {fmtNum(f.value)} → {fmtNum(l.value)} {l.unit}
                      </td>
                      <td className="py-1 pr-2 text-right">{changeText(f, l)}</td>
                      <td className="py-1 text-right whitespace-nowrap">
                        {fmtDate(f.date)} – {fmtDate(l.date)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {changes.length > MAX_CHANGES && <p className="text-xs text-muted">и ещё {changes.length - MAX_CHANGES} показателей — в приложении</p>}
        </section>

        <section className="keep mt-3">
          <h3 className="font-semibold">Давление и пульс</h3>
          {vit.length === 0 ? (
            <p className="text-sm text-muted">Замеров за выбранный период нет.</p>
          ) : (
            <>
              <p className="text-sm">
                Замеров: {vit.length}. Среднее: {Math.round(avg(vit.map((v) => v.systolic)))}/{Math.round(avg(vit.map((v) => v.diastolic)))}, пульс{' '}
                {Math.round(avg(vit.map((v) => v.pulse)))}. Верхнее: {Math.min(...vit.map((v) => v.systolic))}–{Math.max(...vit.map((v) => v.systolic))}, нижнее:{' '}
                {Math.min(...vit.map((v) => v.diastolic))}–{Math.max(...vit.map((v) => v.diastolic))}.
              </p>
              <p className="text-sm text-muted">
                Последние:{' '}
                {vit
                  .slice(-5)
                  .reverse()
                  .map((v) => `${v.systolic}/${v.diastolic} (${fmtDateTime(v.datetime)})`)
                  .join('; ')}
              </p>
            </>
          )}
        </section>

        <section className="keep mt-3">
          <h3 className="font-semibold">Мои вопросы врачу</h3>
          <textarea
            className="no-print mt-1"
            value={questions}
            onChange={(e) => actions.setQuestions(profile.id, e.target.value)}
            placeholder="Запишите вопросы, чтобы не забыть на приёме"
          />
          <div className="print-only mt-1 whitespace-pre-wrap text-sm">
            {questions.trim() ? (
              questions
            ) : (
              <>
                <div className="h-6 border-b border-line" />
                <div className="h-6 border-b border-line" />
                <div className="h-6 border-b border-line" />
              </>
            )}
          </div>
        </section>

        <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
          Источник: данные, введённые пользователем из бланков лабораторий. Сравнение — только с диапазоном, указанным лабораторией.
          Сервис не заменяет консультацию врача.
        </p>
      </article>
    </div>
  )
}
