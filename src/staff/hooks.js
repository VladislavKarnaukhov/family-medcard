import { useCallback, useEffect, useRef, useState } from 'react'

// Периодически обновляет данные. Возвращает [данные, перезагрузить].
export function usePoll(fn, ms, deps) {
  const [data, setData] = useState(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const load = useCallback(async () => {
    try {
      setData(await fnRef.current())
    } catch (e) {
      if (e.status === 401) window.dispatchEvent(new Event('staff-auth'))
    }
  }, [])
  useEffect(() => {
    setData(null)
    load()
    const t = setInterval(() => !document.hidden && load(), ms)
    return () => clearInterval(t)
  }, [load, ms, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  return [data, load]
}
