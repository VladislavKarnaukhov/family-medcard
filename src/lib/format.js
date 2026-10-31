export const toDate = (iso) => new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso)

export const pad = (n) => String(n).padStart(2, '0')

export const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const fmtDate = (iso) =>
  toDate(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).replace(' г.', '')

export const fmtShort = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')

export const fmtDateTime = (iso) =>
  toDate(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const fmtNum = (n) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('ru-RU', { maximumFractionDigits: 3 })

export const parseNum = (s) => {
  if (typeof s === 'number') return s
  const n = parseFloat(String(s).replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) ? n : null
}

// Сравнение только с референсом лаборатории.
export function status(v, lo, hi) {
  if (v == null || !Number.isFinite(v)) return 'none'
  if (lo != null && v < lo) return 'low'
  if (hi != null && v > hi) return 'high'
  return lo == null && hi == null ? 'none' : 'ok'
}

export const STATUS_TEXT = {
  low: 'ниже диапазона лаборатории',
  high: 'выше диапазона лаборатории',
}

export function refText(lo, hi) {
  if (lo != null && hi != null) return `${fmtNum(lo)}–${fmtNum(hi)}`
  if (hi != null) return `до ${fmtNum(hi)}`
  if (lo != null) return `от ${fmtNum(lo)}`
  return 'не указан'
}

export function ageText(birthYear, birthDate) {
  if (!birthYear && !birthDate) return ''
  let a = new Date().getFullYear() - (birthYear || Number(birthDate.slice(0, 4)))
  if (birthDate) {
    const n = new Date()
    const had = n.getMonth() + 1 > Number(birthDate.slice(5, 7)) || (n.getMonth() + 1 === Number(birthDate.slice(5, 7)) && n.getDate() >= Number(birthDate.slice(8, 10)))
    a = n.getFullYear() - Number(birthDate.slice(0, 4)) - (had ? 0 : 1)
  }
  const m10 = a % 10
  const m100 = a % 100
  const w = m100 >= 11 && m100 <= 14 ? 'лет' : m10 === 1 ? 'год' : m10 >= 2 && m10 <= 4 ? 'года' : 'лет'
  return `${a} ${w}`
}

// Старые записи могут содержать имя файла в названии и даты в формате ГГГГ-ММ-ДД: показываем по-человечески.
export const docTitle = (t) => String(t || '').replace(/\s+[—–-]\s+[^/\\]+\.(png|jpe?g|webp|heic|pdf)$/i, '')
export const humanize = (text) => String(text || '').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => fmtDate(m))

export const SEX = { f: 'женский', m: 'мужской', '': 'не указан' }

export const nowISO = (d = new Date()) => `${localISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export const plusDaysISO = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return localISO(d)
}

export const ago = (days, hh = 12, mm = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hh, mm, 0, 0)
  return nowISO(d)
}
