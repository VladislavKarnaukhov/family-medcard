import { Empty, H, PageHeader, go } from '../components/ui'
import { Icon } from '../components/icons'
import { RangeBar } from '../components/RangeBar'
import { latestPoints } from '../lib/data'
import { GROUPS, getIndicator } from '../lib/indicators'
import { fmtDate, fmtNum, refText } from '../lib/format'

export default function Indicators({ state, profile }) {
  if (!profile) return <Empty>Сначала создайте профиль.</Empty>
  const all = latestPoints(state, profile.id)

  const vitalsRow = (
    <a href="#/vitals" className="flex min-h-14 items-center gap-4 rounded-2xl bg-card shadow-sheet px-4 transition-colors hover:bg-sunken">
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
          <Empty icon="chart">Пока нет показателей. Они появятся, когда появится первый анализ.</Empty>
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
          <section key={g} className="mt-8">
            <H>{g}</H>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet">
              {items.map(({ key, label, last, series }, i) => {
                const out = last.status === 'low' || last.status === 'high'
                return (
                  <li key={key}>
                    <button onClick={() => go('indicator/' + encodeURIComponent(key))} className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-sunken lg:grid-cols-[minmax(0,1fr)_200px_9rem] lg:px-5">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{label}</p>
                        <p className="text-sm text-muted">
                          Диапазон {refText(last.refLow, last.refHigh)} · {fmtDate(last.date)} · значений: {series.length}
                        </p>
                      </div>
                      <p className={`whitespace-nowrap text-right text-lg font-semibold lg:order-3 ${out ? 'text-alert' : ''}`}>
                        {fmtNum(last.value)} <span className="text-sm font-normal text-muted">{last.unit}</span>
                      </p>
                      <RangeBar index={i} className="col-span-2 lg:order-2 lg:col-span-1" value={last.value} low={last.refLow} high={last.refHigh} unit={last.unit} status={last.status} />
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
