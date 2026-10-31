// Уход: время семьи, расписание на день, подписи.
export const KIND_LABEL = { food: 'Питание', sleep: 'Сон', wellbeing: 'Самочувствие', walk: 'Прогулка', hygiene: 'Гигиена', fall: 'Падение', other: 'Другое' }
export const MOOD_LABEL = { good: 'Хорошо', so_so: 'Так себе', bad: 'Плохо' }
export const FORMS = ['таблетка', 'капсула', 'капли', 'укол', 'мазь', 'ингаляция', 'другое']
export const WEEKDAYS = [[1, 'пн'], [2, 'вт'], [3, 'ср'], [4, 'чт'], [5, 'пт'], [6, 'сб'], [7, 'вс']]
export const NEEDS = { yes: 'да', no: 'нет', unknown: 'не знаю' }

export const TIMEZONES = [
  ['Europe/Kaliningrad', 'Калининград (МСК−1)'],
  ['Europe/Moscow', 'Москва (МСК)'],
  ['Europe/Samara', 'Самара (МСК+1)'],
  ['Asia/Yekaterinburg', 'Екатеринбург (МСК+2)'],
  ['Asia/Omsk', 'Омск (МСК+3)'],
  ['Asia/Novosibirsk', 'Новосибирск (МСК+4)'],
  ['Asia/Krasnoyarsk', 'Красноярск (МСК+4)'],
  ['Asia/Irkutsk', 'Иркутск (МСК+5)'],
  ['Asia/Yakutsk', 'Якутск (МСК+6)'],
  ['Asia/Vladivostok', 'Владивосток (МСК+7)'],
  ['Asia/Magadan', 'Магадан (МСК+8)'],
  ['Asia/Kamchatka', 'Камчатка (МСК+9)'],
]

const pad = (n) => String(n).padStart(2, '0')

export function localNow(tz = 'Europe/Moscow', date = new Date()) {
  let p
  try {
    p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(date).map((x) => [x.type, x.value]))
  } catch {
    return localNow('Europe/Moscow', date)
  }
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, dt: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` }
}

const utc = (dt) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(dt)
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
}
export function addMinutes(dt, mins) {
  const d = new Date(utc(dt) + mins * 60000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
export const addDays = (date, n) => addMinutes(`${date}T00:00`, n * 1440).slice(0, 10)
export const isoWeekday = (date) => {
  const d = new Date(utc(`${date}T00:00`)).getUTCDay()
  return d === 0 ? 7 : d
}

export function medActiveOn(m, date) {
  if (m.startDate > date) return false
  if (m.endDate && date > m.endDate) return false
  if (m.status === 'stopped' && m.stoppedAt && date >= m.stoppedAt.slice(0, 10)) return false
  return !m.days || m.days.includes(isoWeekday(date))
}

// Приёмы профиля на день: плановые (с отметкой, если есть) и «по необходимости» с отметками за день.
export function daySchedule(state, profileId, date) {
  const tz = state.family?.timezone
  const now = localNow(tz).dt
  const rows = []
  const prn = []
  for (const m of state.medications.filter((x) => x.profileId === profileId)) {
    if (!m.times.length) {
      if (m.status === 'active') prn.push({ med: m, taken: state.intakes.filter((i) => i.medicationId === m.id && i.scheduledAt?.slice(0, 10) === date) })
      continue
    }
    if (!medActiveOn(m, date)) continue
    for (const t of m.times) {
      const at = `${date}T${t}`
      const intake = state.intakes.find((i) => i.medicationId === m.id && i.scheduledAt === at)
      const state_ = intake?.status === 'taken' ? 'taken' : intake?.status === 'skipped' ? 'skipped' : intake?.status === 'unmarked' || addMinutes(at, 60) <= now ? 'unmarked' : at <= now ? 'due' : 'later'
      rows.push({ med: m, time: t, at, intake, state: state_ })
    }
  }
  rows.sort((a, b) => a.at.localeCompare(b.at) || a.med.name.localeCompare(b.med.name, 'ru'))
  return { rows, prn }
}

// Что показать в плашке: приёмы «время принять»; если таких нет, то сегодняшние неотмеченные (спокойная формулировка, без «пропущено»).
export function bannerRows(rows) {
  const due = rows.filter((r) => r.state === 'due')
  return due.length ? { kind: 'due', rows: due } : { kind: 'late', rows: rows.filter((r) => r.state === 'unmarked') }
}

// «Первые шаги» владельца: заведите профиль, лекарства, пригласите близких, отметьте приём, откройте сводку. Всё выводится из данных.
export function firstSteps(state, summarySeen = false) {
  const own = state.profiles.filter((p) => !p.peer)
  const pid = own[0]?.id
  const steps = [
    { key: 'profile', title: 'Заведите профиль', done: own.length > 0, href: 'profile/new' },
    { key: 'meds', title: 'Добавьте лекарства и время приёма', done: state.medications.length > 0, href: pid ? `meds/${pid}/new` : 'profile/new' },
    { key: 'invite', title: 'Пригласите близкого, сиделку или самого человека', done: (state.members || []).some((m) => m.access !== 'owner') || (state.invites?.length || 0) > 0, href: 'circle' },
    { key: 'mark', title: 'Отметьте первый приём', done: state.intakes.some((i) => i.status === 'taken' || i.status === 'skipped'), href: 'today' },
    { key: 'summary', title: 'Откройте сводку для врача', done: summarySeen, href: 'summary' },
  ]
  return { steps, done: steps.filter((s) => s.done).length, next: steps.find((s) => !s.done) || null }
}

// Плашка не нужна там, где приёмы и так на экране: на «Сегодня» и в простом режиме на главной.
export const bannerOnScreen = (hash, simple) => /^#\/today(\/|$)/.test(hash) || (simple && (hash === '' || hash === '#' || hash === '#/'))

export const marked = (rows) => rows.filter((r) => r.state === 'taken' || r.state === 'skipped').length

export function nextAppointment(state, profileId) {
  const now = localNow(state.family?.timezone).dt
  return state.appointments.filter((a) => a.profileId === profileId && a.status === 'planned' && a.at >= now).sort((a, b) => a.at.localeCompare(b.at))[0] || null
}

export const hasMeds = (state) => state.medications.some((m) => m.status === 'active')

export function fmtDt(dt) {
  const d = new Date(`${dt}:00`)
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}
export const fmtTimeOnly = (dt) => dt.slice(11)

// Кому показывать плашку «Время принять лекарство»: тому, кто отмечает приёмы этого профиля.
export function isMarker(state, profile) {
  if (state.me?.selfProfileId === profile.id) return true
  if (profile.hasSelfUser) return false
  if (profile.hasCaregiver) return state.me?.access === 'add' && /сиделк/i.test(state.families.find((f) => f.id === state.familyId)?.roleLabel || '')
  return state.me?.access === 'owner'
}
