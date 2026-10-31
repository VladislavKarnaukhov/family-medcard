import { useState } from 'react'
import { api } from '../lib/api'
import { actions, can } from '../lib/store'
import { Avatar, Tabs, go } from './ui'
import { Icon } from './icons'
import { hasMeds } from '../lib/care'

const NAV = [
  ['', 'Главная', 'home'],
  ['dossier', 'Документы', 'folder'],
  ['indicators', 'Показатели', 'chart'],
  ['assistant', 'Помощник', 'chat', 'owner'],
  ['summary', 'Сводка', 'sheet'],
]
const NAV_MORE = [
  ['vitals', 'Замеры', 'pulse'],
  ['circle', 'Круг заботы', 'users', 'owner'],
  ['privacy', 'Мои данные', 'shield'],
]
const ALIAS = { add: 'dossier', edit: '', indicator: 'indicators', profile: '', legal: '', meds: 'today', visits: 'today', care: 'today', diary: 'today', emergency: '' }
const TODAY = ['today', 'Сегодня', 'pill']
const careLinks = (state) => {
  const id = state.activeProfileId
  return id ? [['meds/' + id, 'Лекарства', 'pill'], ['visits/' + id, 'Визиты к врачу', 'clock'], ['diary/' + id, 'Дневник', 'file'], ['emergency/' + id, 'Экстренная карточка', 'qr', 'owner']] : []
}

const mainNav = (state) => {
  const nav = NAV.filter((i) => !i[3] || can(state).owner)
  return hasMeds(state) ? [TODAY, ...nav] : nav
}

export function Wordmark() {
  return (
    <a href="#/" className="inline-flex items-baseline gap-2" aria-label="Близкие, на главную">
      <span className="text-[1.5rem] font-semibold tracking-[-0.04em] text-accent-dark">Близкие</span>
    </a>
  )
}

function SurveyBanner({ state }) {
  if (!state.user?.surveyDue || window.location.hash.startsWith('#/feedback')) return null
  return (
    <a href="#/feedback" className="lift mb-5 flex items-center justify-between gap-3 rounded-2xl bg-card px-5 py-3 text-[0.95rem] shadow-sheet">
      <span>Вы пользуетесь сервисом две недели. Ответьте на три коротких вопроса?</span>
      <Icon name="chevR" size={18} />
    </a>
  )
}

function VerifyBanner({ state }) {
  const [sent, setSent] = useState(false)
  if (!state.user || state.user.emailVerified) return null
  const send = async () => {
    try {
      await api('POST', '/api/me/resend-verification', {})
      setSent(true)
    } catch {
      /* лимит писем */
    }
  }
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent-soft px-5 py-3 text-[0.95rem]">
      <p>{sent ? 'Письмо отправлено. Откройте ссылку в нём.' : `Подтвердите адрес почты ${state.user.email}: мы отправили вам ссылку.`}</p>
      {!sent && <button className="min-h-12 font-medium text-accent-dark hover:underline" onClick={send}>Отправить ещё раз</button>}
    </div>
  )
}

export function Footer({ className = '' }) {
  return (
    <footer className={`px-4 py-6 text-center text-sm text-muted lg:px-10 ${className}`}>
      <p>Сервис не заменяет консультацию врача</p>
      <p className="no-print mt-1.5 flex flex-wrap justify-center gap-x-5 gap-y-1">
        <a className="underline-offset-2 hover:text-ink hover:underline" href="#/legal/privacy" target="_blank" rel="noreferrer">
          Политика обработки данных
        </a>
        <a className="underline-offset-2 hover:text-ink hover:underline" href="#/feedback">
          Написать нам
        </a>
        <a className="underline-offset-2 hover:text-ink hover:underline" href="#/legal/terms" target="_blank" rel="noreferrer">
          Соглашение
        </a>
        <a className="underline-offset-2 hover:text-ink hover:underline" href="#/legal">
          Все документы
        </a>
      </p>
    </footer>
  )
}

function ProfileTabs({ state }) {
  const owner = can(state).owner
  const items = state.profiles.map((p) => [p.id, p.name])
  return (
    <div className="no-print flex items-end gap-4 lg:hidden">
      <Tabs className="min-w-0 flex-1" value={state.activeProfileId} onChange={(id) => actions.setActive(id)} items={items} />
      {owner && (
        <button onClick={() => go('profile/new')} className="mb-px flex min-h-12 shrink-0 items-center gap-1 border-b border-line pb-px text-[0.95rem] font-medium text-accent-dark">
          <Icon name="plus" size={16} />
          Профиль
        </button>
      )}
    </div>
  )
}

function UserMenu({ state }) {
  return (
    <details className="relative">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-sm">
        <Avatar name={state.user.name} size={32} />
        <span className="max-w-[8rem] truncate">{state.user.name}</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-72 space-y-1 rounded-2xl bg-card shadow-sheet p-3 shadow-pop">
        {state.families.length > 1 && (
          <label className="mb-2 block text-sm">
            <span className="mb-1 block text-muted">Семья</span>
            <select value={state.familyId} onChange={(e) => actions.setFamily(e.target.value)}>
              {state.families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}, {f.roleLabel}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="px-2 pb-1 text-sm text-muted">{state.user.email}</p>
        {[['summary', 'Сводка', 'sheet'], ...careLinks(state), ...NAV_MORE].filter((i) => !i[3] || can(state).owner).map(([r, label, icon]) => (
          <a key={r} href={'#/' + r} className="flex min-h-12 items-center gap-3 rounded-md px-2 hover:bg-sunken">
            <Icon name={icon} size={18} className="text-muted" />
            {label}
          </a>
        ))}
        <button onClick={actions.logout} className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-sunken">
          <Icon name="logout" size={18} className="text-muted" />
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
      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-[0.95rem] transition-colors ${
        active ? 'bg-card font-semibold text-ink shadow-sheet' : 'text-muted hover:bg-card/60 hover:text-ink'
      }`}
    >
      <Icon name={icon} size={19} className={active ? 'text-ink' : ''} />
      <span className="flex-1">{label}</span>
      {badge > 0 && <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-white">{badge}</span>}
    </a>
  )
}

function Rail({ state, active }) {
  const owner = can(state).owner
  const items = [...mainNav(state), ...careLinks(state).filter((i) => !i[3] || owner), ...NAV_MORE.filter((i) => !i[3] || owner), ['notifications', 'События', 'bell']]
  return (
    <aside className="no-print sticky top-0 hidden h-screen w-[252px] shrink-0 flex-col bg-sunken px-4 py-7 lg:flex">
      <div className="px-3">
        <Wordmark />
      </div>
      <nav className="mt-8 space-y-0.5" aria-label="Основная навигация">
        {items.map(([r, label, icon]) => (
          <RailLink key={r} to={r} label={label} icon={icon} active={active === r.split('/')[0]} badge={r === 'assistant' ? state.unread : r === 'notifications' ? state.unreadNotifications : 0} />
        ))}
      </nav>

      {state.profiles.length > 0 && (
        <div className="mt-8 min-h-0 flex-1 overflow-y-auto">
          <p className="mb-1 px-3 text-sm text-muted">Профили</p>
          <ul role="tablist" aria-label="Профили семьи">
            {state.profiles.map((p) => {
              const on = p.id === state.activeProfileId
              return (
                <li key={p.id}>
                  <button
                    role="tab"
                    aria-selected={on}
                    onClick={() => actions.setActive(p.id)}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[0.95rem] transition-colors ${on ? 'bg-card font-semibold text-accent-dark shadow-sheet' : 'hover:bg-card/60'}`}
                  >
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              )
            })}
            {owner && (
              <li>
                <button onClick={() => go('profile/new')} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[0.95rem] text-accent-dark hover:bg-card/60">
                  <Icon name="plus" size={16} />
                  Добавить профиль
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="mt-4 border-t border-line-strong/60 pt-4">
        <div className="flex items-center gap-3 px-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{state.user.name}</p>
            <p className="truncate text-xs text-muted">{state.user.email}</p>
          </div>
          <button onClick={actions.logout} aria-label="Выйти" title="Выйти" className="flex h-12 w-12 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink">
            <Icon name="logout" size={18} />
          </button>
        </div>
        {state.families.length > 1 && (
          <select value={state.familyId} onChange={(e) => actions.setFamily(e.target.value)} className="!mt-3 !min-h-12 !text-sm" aria-label="Семья">
            {state.families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}, {f.roleLabel}
              </option>
            ))}
          </select>
        )}
      </div>
    </aside>
  )
}

function BottomNav({ state, active }) {
  const tabs = mainNav(state).slice(0, 5)
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/90 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Основная навигация">
      <ul className="mx-auto flex max-w-xl">
        {tabs.map(([r, label, icon]) => {
          const on = active === r
          const badge = r === 'assistant' ? state.unread : 0
          return (
            <li key={r} className="flex-1">
              <a href={'#/' + r} aria-current={on ? 'page' : undefined} className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[0.72rem] ${on ? 'font-semibold text-ink' : 'text-muted'}`}>
                <Icon name={icon} size={22} weight={on ? 'fill' : 'regular'} />
                {label}
                {badge > 0 && <span className="absolute right-[24%] top-2 min-w-4 rounded-full bg-accent px-1 text-center text-[0.65rem] font-semibold text-white">{badge}</span>}
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
  const active = key in ALIAS ? ALIAS[key] : key

  if (bare || !state?.user) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="no-print px-4 py-5 lg:px-10">
          <Wordmark />
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
        <header className="no-print flex items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <Wordmark />
          <div className="flex items-center gap-1">
            <a href="#/notifications" aria-label="События" className="relative flex h-12 w-12 items-center justify-center rounded-full hover:bg-sunken">
              <Icon name="bell" size={22} />
              {state.unreadNotifications > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[0.65rem] font-semibold text-white">{state.unreadNotifications}</span>}
            </a>
            <UserMenu state={state} />
          </div>
        </header>
        <main className="flex-1 px-4 pb-28 pt-5 lg:px-14 lg:pb-14 lg:pt-12 print:p-0">
          <VerifyBanner state={state} />
          <SurveyBanner state={state} />
          {state.profiles.length > 0 && route[0] !== 'profile' && (
            <div className="mb-5 lg:hidden">
              <ProfileTabs state={state} />
            </div>
          )}
          <div key={route.join("/") + (state.activeProfileId || "")} className="page-in mx-auto w-full max-w-[1120px]">{children}</div>
        </main>
        <Footer className="pb-24 lg:pb-6" />
      </div>
      <BottomNav state={state} active={active} />
    </div>
  )
}
