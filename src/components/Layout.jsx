import { actions, can } from '../lib/store'
import { go } from './ui'

const TABS = [
  ['', 'Главная', '⌂'],
  ['dossier', 'Досье', '▦'],
  ['indicators', 'Показатели', '◔'],
  ['assistant', 'Помощник', '✉', 'owner'],
  ['summary', 'Сводка', '▤'],
]

export function ProfileSwitcher({ state }) {
  const owner = can(state).owner
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
            className={`min-h-12 shrink-0 rounded-full px-5 font-medium ${on ? 'bg-accent text-white' : 'border border-line bg-card text-ink'}`}
          >
            {p.name}
          </button>
        )
      })}
      {owner && (
        <button onClick={() => go('profile/new')} className="min-h-12 shrink-0 rounded-full border border-dashed border-accent px-5 font-medium text-accent-dark">
          + Добавить
        </button>
      )}
    </div>
  )
}

function UserMenu({ state }) {
  return (
    <details className="relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-full border border-line bg-card px-4 text-sm">{state.user.name}</summary>
      <div className="absolute right-0 z-20 mt-2 w-64 space-y-3 rounded-2xl border border-line bg-card p-3 shadow-lg">
        {state.families.length > 1 && (
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Семья</span>
            <select value={state.familyId} onChange={(e) => actions.setFamily(e.target.value)}>
              {state.families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — {f.roleLabel}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="text-sm text-muted">{state.user.email}</p>
        <a href="#/privacy" className="flex min-h-11 items-center text-accent-dark underline underline-offset-2">
          Мои данные и согласия
        </a>
        <button onClick={actions.logout} className="min-h-11 w-full rounded-xl border border-line text-alert">
          Выйти
        </button>
      </div>
    </details>
  )
}

export default function Layout({ route = [], state, bare, children }) {
  const ALIAS = { add: 'dossier', indicator: 'indicators', vitals: 'indicators' }
  const key = route[0] ?? ''
  const active = ALIAS[key] ?? key
  const tabs = TABS.filter((t) => !t[3] || can(state || {}).owner)

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-24 print:pb-0">
      <div className="no-print -mx-4 bg-alert-soft px-4 py-2 text-center text-sm text-ink">
        <strong>Прототип.</strong> Не загружайте реальные медицинские документы: данные хранятся на сервере разработки.
      </div>

      <header className="no-print flex items-center justify-between gap-3 py-4">
        <a href="#/" className="flex items-baseline gap-2">
          <span className="font-serif text-2xl font-semibold text-accent-dark">Близкие</span>
          <span className="text-sm tracking-widest text-muted">KIN</span>
        </a>
        {!bare && state?.user && <UserMenu state={state} />}
      </header>

      {!bare && state?.profiles.length > 0 && route[0] !== 'profile' && <ProfileSwitcher state={state} />}

      <main className="flex-1 pt-2">{children}</main>

      <footer className="mt-10 border-t border-line py-4 text-center text-sm text-muted">
        <p>Сервис не заменяет консультацию врача</p>
        <p className="no-print mt-1 flex flex-wrap justify-center gap-x-4">
          <a className="underline underline-offset-2" href="#/legal/privacy" target="_blank" rel="noreferrer">Политика</a>
          <a className="underline underline-offset-2" href="#/legal/terms" target="_blank" rel="noreferrer">Соглашение</a>
          <a className="underline underline-offset-2" href="#/legal">Все документы</a>
        </p>
      </footer>

      {!bare && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card/95 backdrop-blur" aria-label="Основная навигация">
          <ul className="mx-auto flex max-w-2xl">
            {tabs.map(([r, label, icon]) => (
              <li key={r} className="flex-1">
                <a
                  href={'#/' + r}
                  aria-current={active === r ? 'page' : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center text-xs ${active === r ? 'font-semibold text-accent-dark' : 'text-muted'}`}
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
      )}
    </div>
  )
}
