// Простой режим: одна колонка, крупный шрифт, без нижнего меню. Остальное по кнопке «Ещё».
import { Footer } from './Layout'
import { Icon } from './icons'
import { actions } from '../lib/store'

export default function SimpleShell({ state, route, children }) {
  const home = !route[0] || route[0] === 'today'
  return (
    <div className="flex min-h-screen flex-col text-[1.25rem] leading-snug">
      <header className="no-print flex items-center justify-between gap-3 px-4 py-4">
        {home ? (
          <p className="text-2xl font-semibold tracking-[-0.03em] text-accent-dark">Близкие</p>
        ) : (
          <a href="#/today" className="inline-flex min-h-14 items-center gap-2 font-semibold text-accent-dark">
            <Icon name="chevL" size={22} /> Назад
          </a>
        )}
        <details className="relative">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 rounded-full bg-sunken px-5 font-semibold">
            Ещё <Icon name="chevD" size={18} />
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-72 space-y-1 rounded-2xl bg-card p-3 shadow-pop">
            {[
              ['today', 'Сегодня'],
              ['meds/' + state.activeProfileId, 'Лекарства'],
              ['visits/' + state.activeProfileId, 'Визиты к врачу'],
              ['notifications', 'События'],
              ['privacy', 'Мои данные'],
            ].map(([to, label]) => (
              <a key={to} href={'#/' + to} className="flex min-h-14 items-center rounded-xl px-4 hover:bg-sunken">{label}</a>
            ))}
            <button onClick={actions.logout} className="flex min-h-14 w-full items-center rounded-xl px-4 text-left hover:bg-sunken">Выйти</button>
          </div>
        </details>
      </header>
      <main className="page-in mx-auto w-full max-w-[640px] flex-1 px-4 pb-10 pt-2">{children}</main>
      <Footer />
    </div>
  )
}
