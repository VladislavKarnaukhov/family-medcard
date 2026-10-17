import { Empty, H, PageHeader, StatusBadge, go } from '../components/ui'
import { Icon } from '../components/icons'
import { latestPoints } from '../lib/data'
import { GROUPS, getIndicator } from '../lib/indicators'
import { fmtDate, fmtNum, refText } from '../lib/format'

export default function Indicators({ state, profile }) {
  if (!profile) return <Empty>Сначала создайте профиль.</Empty>
  const all = latestPoints(state, profile.id)

  const vitalsRow = (
    <a href="#/vitals" className="mb-2 flex min-h-14 items-center gap-4 rounded-2xl border border-line bg-card px-4 shadow-card transition-colors hover:bg-accent-soft/50">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon name="pulse" size={19} />
      </span>
      <span className="flex-1 font-semibold">Давление и пульс</span>
      <span className="flex items-center gap-1 text-sm font-medium text-accent-dark">
        Замеры <Icon name="chevR" size={16} />
      </span>
    </a>
  )

  if (!all.length)
    return (
      <div>
        <PageHeader title="Показатели" subtitle="Последнее значение каждого показателя и его динамика." />
        {vitalsRow}
        <div className="mt-6">
          <Empty icon="chart">Пока нет показателей. Они появятся, когда в досье будет первый анализ.</Empty>
        </div>
      </div>
    )

  const groupOf = (l) => getIndicator(l.key)?.group || 'Другие показатели'
  const groups = [...GROUPS, 'Другие показатели']

  return (
    <div>
      <PageHeader title="Показатели" subtitle={`Профиль «${profile.name}»: последнее значение каждого показателя. Нажмите на строку, чтобы увидеть динамику.`} />
      {vitalsRow}
      {groups.map((g) => {
        const items = all.filter((l) => groupOf(l) === g)
        if (!items.length) return null
        return (
          <section key={g}>
            <H>{g}</H>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card shadow-card">
              {items.map(({ key, label, last, series }) => {
                const out = last.status === 'low' || last.status === 'high'
                return (
                  <li key={key}>
                    <button onClick={() => go('indicator/' + encodeURIComponent(key))} className="flex min-h-16 w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-accent-soft/40 lg:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{label}</p>
                        <p className="text-sm text-muted">
                          Диапазон {refText(last.refLow, last.refHigh)} · {fmtDate(last.date)} · значений: {series.length}
                        </p>
                        {out && (
                          <div className="mt-1">
                            <StatusBadge status={last.status} />
                          </div>
                        )}
                      </div>
                      <p className={`whitespace-nowrap text-right text-lg font-semibold ${out ? 'text-alert' : ''}`}>
                        {fmtNum(last.value)} <span className="text-sm font-normal text-muted">{last.unit}</span>
                      </p>
                      <Icon name="chevR" size={18} className="text-muted" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
