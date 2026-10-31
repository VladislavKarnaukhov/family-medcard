// Перестановка элементов списка зажатием и перетаскиванием (мышь и касание) и клавишами Alt+стрелки.
// Короткое нажатие остаётся обычным нажатием: перетаскивание начинается после удержания.
import { useEffect, useRef, useState } from 'react'
import { dropIndex, moveId, moveTo } from './nav.js'

const HOLD = { touch: 320, mouse: 220, pen: 320 }

export function useReorder({ ids, enabled = true, onCommit }) {
  const [order, setOrder] = useState(ids)
  const [dragId, setDragId] = useState(null)
  const latest = useRef(order)
  latest.current = order
  const orig = useRef(ids)
  orig.current = ids
  const commit = useRef(onCommit)
  commit.current = onCommit
  const rows = useRef({})
  const list = useRef(null)
  const drag = useRef(null)
  const blockClick = useRef(false)
  const key = ids.join('|')

  useEffect(() => {
    if (!drag.current?.ready) setOrder(ids)
  }, [key])

  const save = (next) => {
    if (next.every((x, i) => x === orig.current[i])) return
    Promise.resolve(commit.current(next)).catch(() => setOrder(orig.current))
  }

  const onPointerDown = (e, id) => {
    if (!enabled || ids.length < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return
    const d = { id, pid: e.pointerId, startY: e.clientY, ready: false }
    d.timer = setTimeout(() => {
      d.ready = true
      try {
        list.current?.setPointerCapture(d.pid)
      } catch {
        /* указатель уже отпущен */
      }
      setDragId(id)
      navigator.vibrate?.(12)
    }, HOLD[e.pointerType] ?? HOLD.touch)
    drag.current = d
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    if (!d.ready) {
      // Сдвиг до удержания: человек прокручивает или выбирает, а не переставляет.
      if (Math.abs(e.clientY - d.startY) > 10) {
        clearTimeout(d.timer)
        drag.current = null
      }
      return
    }
    const mids = latest.current.filter((i) => i !== d.id).map((i) => {
      const r = rows.current[i]?.getBoundingClientRect()
      return r ? r.top + r.height / 2 : 0
    })
    const next = moveTo(latest.current, d.id, dropIndex(mids, e.clientY))
    if (next !== latest.current) setOrder(next)
  }
  const onPointerEnd = () => {
    const d = drag.current
    if (!d) return
    clearTimeout(d.timer)
    drag.current = null
    setDragId(null)
    try {
      list.current?.releasePointerCapture(d.pid)
    } catch {
      /* уже отпущен */
    }
    if (d.ready) {
      blockClick.current = true
      setTimeout(() => (blockClick.current = false), 120)
      save(latest.current)
    }
  }
  const onKeyDown = (e, id) => {
    if (!enabled || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const next = moveId(latest.current, id, e.key === 'ArrowUp' ? -1 : 1)
    if (next !== latest.current) {
      setOrder(next)
      save(next)
    }
  }

  return {
    order,
    dragId,
    suppressClick: () => blockClick.current,
    listProps: { ref: list, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
    rowProps: (id) => ({
      ref: (el) => (rows.current[id] = el),
      onPointerDown: (e) => onPointerDown(e, id),
      onKeyDown: (e) => onKeyDown(e, id),
      style: enabled && ids.length > 1 ? { touchAction: 'none' } : undefined,
    }),
  }
}
