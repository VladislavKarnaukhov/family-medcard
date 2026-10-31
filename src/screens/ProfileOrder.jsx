import { useRef, useState } from 'react'
import { Button, Card, ErrorText, PageHeader } from '../components/ui'
import { Icon } from '../components/icons'
import { actions } from '../lib/store'
import { dropIndex, moveId, moveTo } from '../lib/nav'

// Порядок профилей вручную: зажмите строку и перетащите (на телефоне нужно подержать палец),
// либо кнопками «выше» и «ниже», которые работают и с клавиатуры.
const HOLD_MS = 320

export default function ProfileOrder({ state }) {
  const own = state.profiles.filter((p) => !p.peer)
  const [ids, setIds] = useState(own.map((p) => p.id))
  const [dragId, setDragId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const byId = Object.fromEntries(own.map((p) => [p.id, p]))
  const latest = useRef(ids)
  latest.current = ids
  const saved = useRef(ids)
  const rows = useRef({})
  const drag = useRef(null)

  const persist = async (next) => {
    if (next.every((x, i) => x === saved.current[i])) return
    setBusy(true)
    setErr('')
    try {
      await actions.reorderProfiles(next)
      saved.current = next
    } catch (e) {
      setErr(e.message)
      setIds(saved.current)
    } finally {
      setBusy(false)
    }
  }

  const move = (id, dir) => {
    const next = moveId(ids, id, dir)
    if (next === ids) return
    setIds(next)
    persist(next)
  }

  const onDown = (e, id) => {
    if (e.target.closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return
    const list = e.currentTarget.parentElement
    const d = { id, pid: e.pointerId, startY: e.clientY, ready: false, list }
    d.timer = setTimeout(() => {
      d.ready = true
      try {
        list.setPointerCapture(d.pid)
      } catch {
        /* указатель уже отпущен */
      }
      setDragId(id)
      navigator.vibrate?.(12)
    }, e.pointerType === 'mouse' ? 120 : HOLD_MS)
    drag.current = d
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    if (!d.ready) {
      // Палец сдвинулся до удержания: это прокрутка или жест, а не перетаскивание.
      if (Math.abs(e.clientY - d.startY) > 10) {
        clearTimeout(d.timer)
        drag.current = null
      }
      return
    }
    const mids = latest.current.filter((i) => i !== d.id).map((i) => {
      const r = rows.current[i].getBoundingClientRect()
      return r.top + r.height / 2
    })
    const next = moveTo(latest.current, d.id, dropIndex(mids, e.clientY))
    if (next !== latest.current) setIds(next)
  }
  const onUp = () => {
    const d = drag.current
    if (!d) return
    clearTimeout(d.timer)
    drag.current = null
    setDragId(null)
    try {
      d.list.releasePointerCapture(d.pid)
    } catch {
      /* уже отпущен */
    }
    if (d.ready) persist(latest.current)
  }

  return (
    <div className="mx-auto max-w-[560px]">
      <PageHeader title="Порядок профилей" subtitle="Зажмите строку и перетащите. Можно и кнопками со стрелками. Порядок сохраняется сразу." back={{ href: '#/', label: 'Главная' }} />
      <Card className="!p-2">
        <ol onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="select-none">
          {ids.map((id, i) => (
            <li
              key={id}
              ref={(el) => (rows.current[id] = el)}
              onPointerDown={(e) => onDown(e, id)}
              style={{ touchAction: 'none' }}
              className={`flex cursor-grab items-center gap-2 rounded-xl border-b border-line px-3 py-1 transition-shadow last:border-0 ${dragId === id ? 'relative z-10 cursor-grabbing bg-card shadow-pop ring-1 ring-accent-mid' : ''}`}
            >
              <span aria-hidden="true" className="flex h-12 w-6 items-center justify-center text-muted">
                <Icon name="list" size={18} className="rotate-90" />
              </span>
              <span className="w-5 text-center text-muted">{i + 1}</span>
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
