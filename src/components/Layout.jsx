import { actions, can } from '../lib/store'
import { Avatar, go } from './ui'
import { Icon } from './icons'

const NAV = [
  ['', 'Главная', 'home'],
  ['dossier', 'Досье', 'folder'],
  ['indicators', 'Показатели', 'chart'],
  ['assistant', 'Помощник', 'chat', 'owner'],
  ['summary', 'Сводка', 'sheet'],
]
const NAV_MORE = [
  ['vitals', 'Замеры', 'pulse'],
  ['circle', 'Круг заботы', 'users', 'owner'],
  ['privacy', 'Мои данные', 'shield'],
]
const ALIAS = { add: 'dossier', indicator: 'indicators', profile: '', legal: '' }

export function Wordmark({ light = false }) {
  return (
    <a href="#/" className="inline-flex items-baseline gap-2" aria-label="Близкие, на главную">
      <span className={`text-[1.4rem] font-bold tracking-tight ${light ? 'text-white' : 'text-accent-dark'}`}>Близкие</span>
      <span className={`text-[0.7rem] font-medium tracking-[0.28em] ${light ? 'text-white/60' : 'text-muted'}`}>KIN</span>
    </a>
  )
}

export function Footer({ className = '' }) {
  return (
    <footer className={`border-t border-line px-4 py-6 text-center text-sm text-muted lg:px-10 ${className}`}>
      <p>Сервис не заменяет консультацию врача</p>
      <p className="no-print mt-1.5 flex flex-wrap justify-center gap-x-5 gap-y-1">
        <a className="underline-offset-2 hover:underline" href="#/legal/privacy" target="_blank" rel="noreferrer">
          Политика обработки данных
        </a>
        <a className="underline-offset-2 hover:underline" href="#/legal/terms" target="_blank" rel="noreferrer">
          Соглашение
        </a>
        <a className="underline-offset-2 hover:underline" href="#/legal">
          Все документы
        </a>
      </p>
    </footer>
  )
}

function ProfileChips({ state }) {
  const owner = can(state).owner
  return (
    <div className="no-print -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,black_88%,transparent)] lg:hidden" role="tablist" aria-label="Профили семьи">
      {state.profiles.map((p) => {
        const on = p.id === state.activeProfileId
        return (
          <button
            key={p.id}
            role="tab"
            aria-selected={on}
            onClick={() => actions.setActive(p.id)}
            className={`flex min-h-12 shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 font-medium transition-colors ${
              on ? 'bg-accent text-white' : 'border border-line-strong bg-card text-ink'
            }`}
          >
            <Avatar name={p.name} size={34} tone={on ? 'rail' : 'soft'} />
            {p.name}
          </button>
        )
      })}
      {owner && (
        <button onClick={() => go('profile/new')} className="stitch-border flex min-h-12 shrink-0 items-center gap-1.5 rounded-full px-4 font-medium text-accent-dark">
          <Icon name="plus" size={18} />
          Добавить
        </button>
      )}
    </div>
  )
}

function UserMenu({ state }) {
  return (
    <details className="relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-white">
        <Avatar name={state.user.name} size={34} tone="rail" />
        <span className="max-w-[9rem] truncate text-sm">{state.user.name}</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-72 space-y-1 rounded-2xl border border-line bg-card p-3 text-ink shadow-pop">
        {state.families.length > 1 && (
          <label className="mb-2 block text-sm">
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
        <p className="px-2 pb-1 text-sm text-muted">{state.user.email}</p>
        {NAV_MORE.filter((i) => !i[3] || can(state).owner).map(([r, label, icon]) => (
          <a key={r} href={'#/' + r} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-paper">
            <Icon name={icon} size={19} className="text-accent-mid" />
            {label}
          </a>
        ))}
        <button onClick={actions.logout} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-alert hover:bg-alert-soft">
          <Icon name="logout" size={19} />
          Выйти
        </button>
      </div>
    </details>
  )
}

function RailLink({ to, label, icon, active, badge }) {
  return (
    <a
      href={'#/' + to}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.95rem] font-medium transition-colors ${
        active ? 'bg-rail-hover text-white' : 'text-white/75 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon name={icon} size={20} />
      <span className="flex-1">{label}</span>
      {badge > 0 && <span className="rounded-full bg-white px-2 text-xs font-semibold text-accent-dark">{badge}</span>}
    </a>
  )
}

function Rail({ state, active }) {
  const owner = can(state).owner
  const items = [...NAV, ...NAV_MORE].filter((i) => !i[3] || owner)
  return (
    <aside className="linen-rail no-print sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col px-4 py-6 text-white lg:flex">
      <div className="px-2">
        <Wordmark light />
      </div>
      <nav className="mt-8 space-y-1" aria-label="Основная навигация">
        {items.map(([r, label, icon]) => (
          <RailLink key={r} to={r} label={label} icon={icon} active={active === r} badge={r === 'assistant' ? state.unread : 0} />
        ))}
      </nav>

      {state.profiles.length > 0 && (
        <div className="mt-8 min-h-0 flex-1 overflow-y-auto">
          <p className="mb-2 px-3 text-xs font-medium text-white/55">Профили</p>
          <ul className="space-y-1" role="tablist" aria-label="Профили семьи">
            {state.profiles.map((p) => {
              const on = p.id === state.activeProfileId
              return (
                <li key={p.id}>
                  <button
                    role="tab"
                    aria-selected={on}
                    onClick={() => actions.setActive(p.id)}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[0.95rem] transition-colors ${on ? 'bg-white text-accent-dark' : 'text-white/80 hover:bg-white/5'}`}
                  >
                    <span className={on ? 'rounded-full outline-dashed outline-[1.5px] outline-offset-2 outline-accent-mid' : ''}>
                      <Avatar name={p.name} size={28} tone={on ? 'soft' : 'rail'} />
                    </span>
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              )
            })}
            {owner && (
              <li>
                <button onClick={() => go('profile/new')} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[0.95rem] text-white/70 hover:bg-white/5 hover:text-white">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-white/40">
                    <Icon name="plus" size={15} />
                  </span>
                  Добавить профиль
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="mt-4 border-t border-white/10 pt-4">
        <div className="flex items-center gap-3 px-2">
          <Avatar name={state.user.name} size={38} tone="rail" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{state.user.name}</p>
            <p className="truncate text-xs text-white/60">{state.user.email}</p>
          </div>
          <button onClick={actions.logout} aria-label="Выйти" title="Выйти" className="flex h-10 w-10 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
            <Icon name="logout" size={19} />
          </button>
        </div>
        {state.families.length > 1 && (
          <select value={state.familyId} onChange={(e) => actions.setFamily(e.target.value)} className="!mt-3 !min-h-10 !border-white/20 !bg-white/10 !text-sm !text-white" aria-label="Семья">
            {state.families.map((f) => (
              <option key={f.id} value={f.id} className="text-ink">
                {f.name} — {f.roleLabel}
              </option>
            ))}
          </select>
        )}
      </div>
    </aside>
  )
}

function BottomNav({ state, active }) {
  const tabs = NAV.filter((t) => !t[3] || can(state).owner)
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Основная навигация">
      <ul className="mx-auto flex max-w-xl">
        {tabs.map(([r, label, icon]) => {
          const on = active === r
          const badge = r === 'assistant' ? state.unread : 0
          return (
            <li key={r} className="flex-1">
              <a href={'#/' + r} aria-current={on ? 'page' : undefined} className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium ${on ? 'text-accent' : 'text-muted'}`}>
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${on ? 'bg-accent-soft' : ''}`}>
                  <Icon name={icon} size={22} />
                </span>
                {label}
                {badge > 0 && <span className="absolute right-[22%] top-1.5 min-w-5 rounded-full bg-alert px-1.5 text-center text-[0.65rem] font-semibold text-white">{badge}</span>}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default function Layout({ route = [], state, bare, children }) {
  const key = route[0] ?? ''
  const active = key in ALIAS ? ALIAS[key] : key === 'vitals' || key === 'circle' || key === 'privacy' ? key : key

  if (bare || !state?.user) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="linen-rail no-print px-4 py-4 lg:px-10">
          <Wordmark light />
        </header>
        <main className="mx-auto w-full max-w-[920px] flex-1 px-4 pb-10 pt-6 lg:pt-10">{children}</main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen lg:flex">
      <Rail state={state} active={active} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="linen-rail no-print flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
          <Wordmark light />
          <UserMenu state={state} />
        </header>
        <main className="flex-1 px-4 pb-28 pt-5 lg:px-10 lg:pb-12 lg:pt-9 print:p-0">
          {state.profiles.length > 0 && route[0] !== 'profile' && <div className="mb-5 lg:hidden"><ProfileChips state={state} /></div>}
          <div className="mx-auto w-full max-w-[1080px]">{children}</div>
        </main>
        <Footer className="pb-24 lg:pb-6" />
      </div>
      <BottomNav state={state} active={active} />
    </div>
  )
}
