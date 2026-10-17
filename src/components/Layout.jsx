import { actions } from '../lib/store'
import { go } from './ui'

const TABS = [
  ['', 'Главная', '⌂'],
  ['add', 'Анализ', '＋'],
  ['indicators', 'Показатели', '◔'],
  ['vitals', 'Замеры', '♡'],
  ['summary', 'Сводка', '▤'],
]

export function ProfileSwitcher({ state }) {
  return (
    <div className="no-print -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Профили семьи">
      {state.profiles.map((p) => {
        const on = p.id === state.activeProfileId
        return (
          <button
            key={p.id}
            role="tab"
            aria-selected={on}
            onClick={() => actions.setActive(p.id)}
            className={`min-h-12 shrink-0 rounded-full px-5 font-medium ${
              on ? 'bg-accent text-white' : 'border border-line bg-card text-ink'
            }`}
          >
            {p.name}
          </button>
        )
      })}
      <button
        onClick={() => go('profile/new')}
        className="min-h-12 shrink-0 rounded-full border border-dashed border-accent px-5 font-medium text-accent-dark"
      >
        + Добавить
      </button>
    </div>
  )
}

export default function Layout({ route, state, children }) {
  const active = TABS.find(([r]) => r === route[0]) ? route[0] : route[0] === 'indicator' ? 'indicators' : route[0] ?? ''
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-24 print:pb-0">
      <div className="no-print -mx-4 bg-alert-soft px-4 py-2 text-center text-sm text-ink">
        <strong>Демо-версия.</strong> Не загружайте реальные медицинские документы. Данные хранятся только в вашем браузере.
      </div>

      <header className="no-print flex items-center justify-between py-4">
        <a href="#/" className="text-xl font-semibold text-accent-dark">
          Семейная медкарта
        </a>
      </header>

      {state.profiles.length > 0 && route[0] !== 'profile' && <ProfileSwitcher state={state} />}

      <main className="flex-1 pt-2">{children}</main>

      <footer className="mt-10 border-t border-line py-4 text-center text-sm text-muted">
        Сервис не заменяет консультацию врача
      </footer>

      <nav
        className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card/95 backdrop-blur"
        aria-label="Основная навигация"
      >
        <ul className="mx-auto flex max-w-2xl">
          {TABS.map(([r, label, icon]) => (
            <li key={r} className="flex-1">
              <a
                href={'#/' + r}
                aria-current={active === r ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center text-xs ${
                  active === r ? 'font-semibold text-accent-dark' : 'text-muted'
                }`}
              >
                <span className="text-xl leading-none" aria-hidden>
                  {icon}
                </span>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
