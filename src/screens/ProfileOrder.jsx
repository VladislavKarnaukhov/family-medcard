import { useState } from 'react'
import { Button, Card, ErrorText, PageHeader } from '../components/ui'
import { Icon } from '../components/icons'
import { actions } from '../lib/store'
import { moveId } from '../lib/nav'

// Порядок профилей вручную: кнопки «выше» и «ниже» работают и на телефоне, и с клавиатуры.
export default function ProfileOrder({ state }) {
  const own = state.profiles.filter((p) => !p.peer)
  const [ids, setIds] = useState(own.map((p) => p.id))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const byId = Object.fromEntries(own.map((p) => [p.id, p]))
  const move = async (id, dir) => {
    const next = moveId(ids, id, dir)
    if (next === ids) return
    setIds(next)
    setBusy(true)
    setErr('')
    try {
      await actions.reorderProfiles(next)
    } catch (e) {
      setErr(e.message)
      setIds(ids)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mx-auto max-w-[560px]">
      <PageHeader title="Порядок профилей" subtitle="Так профили стоят в списке. Порядок сохраняется сразу." back={{ href: '#/', label: 'Главная' }} />
      <Card className="!p-2">
        <ol>
          {ids.map((id, i) => (
            <li key={id} className="flex items-center gap-2 border-b border-line px-3 py-1 last:border-0">
              <span className="w-6 text-center text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{byId[id]?.name}</span>
              <button type="button" aria-label={`Поднять выше: ${byId[id]?.name}`} disabled={busy || i === 0} onClick={() => move(id, -1)} className="flex h-12 w-12 items-center justify-center rounded-lg text-accent-dark hover:bg-sunken disabled:opacity-30">
                <Icon name="chevD" size={18} className="rotate-180" />
              </button>
              <button type="button" aria-label={`Опустить ниже: ${byId[id]?.name}`} disabled={busy || i === ids.length - 1} onClick={() => move(id, 1)} className="flex h-12 w-12 items-center justify-center rounded-lg text-accent-dark hover:bg-sunken disabled:opacity-30">
                <Icon name="chevD" size={18} />
              </button>
            </li>
          ))}
        </ol>
      </Card>
      <ErrorText>{err}</ErrorText>
      <Button className="mt-5" variant="ghost" onClick={() => (window.location.hash = '#/')}>
        Готово
      </Button>
    </div>
  )
}
