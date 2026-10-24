import { Button, Empty, PageHeader } from '../components/ui'
import { Icon } from '../components/icons'
import { actions } from '../lib/store'

const ICON = { intake_due: 'clock', unmarked_intake: 'clock', fall: 'alert', wellbeing_bad: 'heart', appointment_soon: 'clock', assistant_message: 'chat' }

export default function Notifications({ state }) {
  const list = state.notifications
  return (
    <div>
      <PageHeader title="События" subtitle="Что произошло по профилям, к которым у вас есть доступ." actions={state.unreadNotifications > 0 && <Button variant="ghost" onClick={() => actions.readNotifications()}>Прочитать все</Button>} />
      <div className="max-w-[760px]">
        {list.length === 0 ? (
          <Empty icon="inbox">Пока событий нет.</Empty>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet">
            {list.map((n) => (
              <li key={n.id}>
                <a href={n.link || '#/today'} onClick={() => !n.read && actions.readNotifications([n.id])} className="flex min-h-16 items-center gap-4 px-5 py-4 transition-colors hover:bg-sunken">
                  <Icon name={ICON[n.kind] || 'inbox'} size={20} className="text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className={n.read ? 'text-muted' : 'font-semibold'}>{n.title}</p>
                    <p className="text-sm text-muted">{new Date(n.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  {!n.read && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-label="не прочитано" />}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
