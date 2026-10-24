// Время семьи: все расписания хранятся локальными строками 'YYYY-MM-DDTHH:MM' в часовом поясе семьи.
export const DEFAULT_TZ = 'Europe/Moscow'

export const validTz = (tz) => {
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: tz })
    return typeof tz === 'string' && tz.length < 60
  } catch {
    return false
  }
}

// Локальные дата и время в поясе tz для момента date.
export function tzNow(tz = DEFAULT_TZ, date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: validTz(tz) ? tz : DEFAULT_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  )
  const day = `${p.year}-${p.month}-${p.day}`
  const time = `${p.hour}:${p.minute}`
  return { date: day, time, dt: `${day}T${time}`, hour: Number(p.hour) }
}

const toUtc = (dt) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(dt)
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
}
const pad = (n) => String(n).padStart(2, '0')

// Прибавить минуты к локальной строке, не заходя в часовой пояс сервера.
export function addMinutes(dt, mins) {
  const d = new Date(toUtc(dt) + mins * 60000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export function addDays(date, n) {
  return addMinutes(`${date}T00:00`, n * 1440).slice(0, 10)
}

// День недели: пн = 1 … вс = 7.
export function isoWeekday(date) {
  const d = new Date(toUtc(`${date}T00:00`)).getUTCDay()
  return d === 0 ? 7 : d
}

export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
export const isDt = (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
export const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

// Принимает ли человек лекарство в этот день по расписанию.
export function medActiveOn(m, date) {
  if (m.start_date > date) return false
  if (m.end_date && date > m.end_date) return false
  if (m.status === 'stopped' && m.stopped_at && date >= m.stopped_at.slice(0, 10)) return false
  const days = m.days ? JSON.parse(m.days) : null
  return !days || days.includes(isoWeekday(date))
}
