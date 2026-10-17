import { Button, Card, Empty, H, StatusBadge, go } from '../components/ui'
import { Avatar } from './Assistant'
import { actions, ASSISTANT } from '../lib/store'
import { latestPoints, isOut } from '../lib/data'
import { fmtDate, fmtNum, refText, ageText, SEX } from '../lib/format'

function Welcome() {
  return (
    <div className="space-y-4 py-6">
      <h1 className="text-2xl font-semibold leading-tight">Личный помощник по здоровью вашей семьи</h1>
      <p className="text-muted">
        Помощник собирает документы из клиник и лабораторий, ведёт семейное досье и готовит материалы к визитам к врачу. Вы
        видите динамику показателей и решаете, кому из близких открыть доступ.
      </p>
      <Button big onClick={() => go('profile/new')}>
        Создать профиль
      </Button>
      <Button big variant="soft" onClick={actions.loadDemo}>
        Заполнить демо-данными
      </Button>
    </div>
  )
}

export default function Dashboard({ state, profile }) {
  if (!profile) return <Welcome />

  const results = state.labResults
    .filter((r) => r.profileId === profile.id)
    .sort((a, b) => b.date.localeCompare(a.date))
  const latest = latestPoints(state, profile.id)
  const out = latest.filter((l) => isOut(l.last))
  const openReq = state.requests.filter((r) => r.status !== 'done').length
  const lastMsg = state.messages[state.messages.length - 1]
  const circleCount = state.members.filter((m) => m.profileIds.includes(profile.id)).length

  return (
    <div>
      <div className="flex items-center justify-between gap-3 py-3">
        <p className="text-muted">
          {[ageText(profile.birthYear), SEX[profile.sex] !== 'не указан' ? SEX[profile.sex] : ''].filter(Boolean).join(' · ')}
        </p>
        <a href="#/profile" className="text-accent-dark underline underline-offset-2">
          Профиль
        </a>
      </div>

      <a href="#/assistant" className="block rounded-2xl border border-line bg-card p-4">
        <div className="flex items-center gap-3">
          <Avatar />
          <div>
            <div className="font-semibold">{ASSISTANT.name}</div>
            <div className="text-sm text-muted">{ASSISTANT.title}</div>
          </div>
          {openReq > 0 && <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent-dark">{openReq} в работе</span>}
        </div>
        {lastMsg && (
          <p className="mt-3 line-clamp-2 text-muted">
            {lastMsg.from === 'assistant' ? '' : 'Вы: '}
            {lastMsg.text}
          </p>
        )}
        <span className="mt-2 block text-accent-dark underline underline-offset-2">Написать помощнику →</span>
      </a>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="soft" onClick={() => go('add')}>
          ＋ Анализ
        </Button>
        <Button variant="ghost" onClick={() => go('circle')}>
          Круг заботы{circleCount ? ` · ${circleCount}` : ''}
        </Button>
      </div>

      <H>Вне диапазона лаборатории</H>
      {out.length === 0 ? (
        <Empty>
          {latest.length ? 'В последних результатах все показатели внутри диапазона лаборатории.' : 'Пока нет загруженных анализов.'}
        </Empty>
      ) : (
        <ul className="space-y-2">
          {out.map(({ key, label, last }) => (
            <li key={key}>
              <a
                href={'#/indicator/' + encodeURIComponent(key)}
                className="block rounded-2xl border border-alert/30 bg-alert-soft p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{label}</span>
                  <span className="text-lg font-semibold text-alert">
                    {fmtNum(last.value)} <span className="text-sm font-normal">{last.unit}</span>
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted">
                  Диапазон лаборатории: {refText(last.refLow, last.refHigh)} · {fmtDate(last.date)}
                </div>
                <div className="mt-2">
                  <StatusBadge status={last.status} />
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      <H right={<a href="#/indicators" className="text-accent-dark underline underline-offset-2">Все показатели</a>}>
        Последние анализы
      </H>
      {results.length === 0 ? (
        <Empty>Добавьте первый бланк — мы разберём его по показателям.</Empty>
      ) : (
        <ul className="space-y-2">
          {results.slice(0, 4).map((r) => {
            const ms = state.measurements.filter((m) => m.labResultId === r.id)
            return (
              <li key={r.id}>
                <details className="rounded-2xl border border-line bg-card p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{r.labName}</span>
                      <span className="text-muted">{fmtDate(r.date)}</span>
                    </div>
                    <div className="mt-1 text-sm text-muted">{ms.length} показателей · нажмите, чтобы раскрыть</div>
                  </summary>
                  <table className="mt-3 w-full text-left text-sm">
                    <tbody>
                      {ms.map((m) => (
                        <tr key={m.id} className="border-t border-line">
                          <td className="py-2 pr-2">
                            <a
                              className="text-accent-dark underline underline-offset-2"
                              href={'#/indicator/' + encodeURIComponent(m.indicatorKey)}
                            >
                              {m.name}
                            </a>
                          </td>
                          <td className="py-2 text-right whitespace-nowrap">
                            {fmtNum(m.value)} {m.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Button
                    variant="danger"
                    className="mt-3 min-h-10 text-sm"
                    onClick={() => confirm('Удалить этот анализ?') && actions.deleteLabResult(r.id)}
                  >
                    Удалить анализ
                  </Button>
                </details>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6">
        <Button variant="soft" onClick={() => confirm('Текущие данные будут заменены демо-данными. Продолжить?') && actions.loadDemo()}>
          Заполнить демо-данными
        </Button>
        <Button variant="ghost" onClick={() => confirm('Удалить все данные из браузера?') && actions.clearAll()}>
          Удалить все данные
        </Button>
      </div>
    </div>
  )
}
