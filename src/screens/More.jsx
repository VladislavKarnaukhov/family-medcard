import { Icon } from '../components/icons'
import { PageHeader } from '../components/ui'

// «Ещё» на телефоне: все разделы, которых нет в нижних вкладках.
export default function More({ items, badges = {} }) {
  return (
    <div>
      <PageHeader title="Ещё" subtitle="Все разделы сервиса." />
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet">
        {items.map(([to, label, icon]) => (
          <li key={to}>
            <a href={'#/' + to} className="flex min-h-14 items-center gap-4 px-5 transition-colors hover:bg-sunken">
              <Icon name={icon} size={20} className="text-accent" />
              <span className="flex-1">{label}</span>
              {badges[to] > 0 && <span className="rounded-full bg-accent px-2 text-sm font-semibold text-white">{badges[to]}</span>}
              <Icon name="chevR" size={18} className="text-muted" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
