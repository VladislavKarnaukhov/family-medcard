import { Empty, StatusBadge, go } from '../components/ui'
import { latestPoints } from '../lib/data'
import { GROUPS, getIndicator } from '../lib/indicators'
import { fmtDate, fmtNum } from '../lib/format'

export default function Indicators({ state, profile }) {
  if (!profile) return <Empty>Сначала создайте профиль.</Empty>
  const all = latestPoints(state, profile.id)
  if (!all.length) return <Empty>Пока нет показателей. Добавьте первый анализ.</Empty>

  const groupOf = (l) => getIndicator(l.key)?.group || 'Другие показатели'
  const groups = [...GROUPS, 'Другие показатели']

  return (
    <div className="py-4">
      <h1 className="mb-1 text-2xl font-semibold">Показатели</h1>
      <p className="mb-4 text-muted">Последнее значение каждого показателя. Нажмите, чтобы увидеть динамику.</p>
      {groups.map((g) => {
        const items = all.filter((l) => groupOf(l) === g)
        if (!items.length) return null
        return (
          <section key={g} className="mb-6">
            <h2 className="mb-2 text-lg font-semibold">{g}</h2>
            <ul className="space-y-2">
              {items.map(({ key, label, last, series }) => (
                <li key={key}>
                  <button
                    onClick={() => go('indicator/' + encodeURIComponent(key))}
                    className="w-full rounded-2xl border border-line bg-card p-4 text-left"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{label}</span>
                      <span className={`whitespace-nowrap text-lg font-semibold ${last.status === 'low' || last.status === 'high' ? 'text-alert' : ''}`}>
                        {fmtNum(last.value)} <span className="text-sm font-normal text-muted">{last.unit}</span>
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      {fmtDate(last.date)} · замеров: {series.length}
                    </div>
                    <div className="mt-1">
                      <StatusBadge status={last.status} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
