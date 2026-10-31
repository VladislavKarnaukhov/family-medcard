// Метрики MVP по таблице events. Запуск: npm run metrics [-- --json]. База: DATA_DIR или server/data.
// Успех MVP: не меньше 10 семей отмечают приёмы или пишут в дневник не реже 4 дней в неделю не менее 3 недель.
import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = process.env.DATA_DIR || join(here, '..', 'server', 'data')
const db = new DatabaseSync(join(dir, 'blizkie.db'), { readOnly: true })
const DAYS_PER_WEEK = 4
const WEEKS = 3
const TARGET_FAMILIES = 10

const dayOf = (iso, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const weekStart = (date) => {
  const d = new Date(`${date}T00:00:00Z`)
  const wd = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - wd + 1)
  return d.toISOString().slice(0, 10)
}

const families = db.prepare('SELECT id, timezone, created_at FROM families').all()
const tz = Object.fromEntries(families.map((f) => [f.id, f.timezone]))
const count = (names) => db.prepare(`SELECT COUNT(DISTINCT family_id) c FROM events WHERE name IN (${names.map(() => '?').join(',')})`).get(...names).c

const funnel = [
  ['Регистрация владельца', count(['signup'])],
  ['Подписано согласие на данные о здоровье', count(['consent_health'])],
  ['Создан профиль', count(['profile_created'])],
  ['Добавлено лекарство', count(['medication_created'])],
  ['Отправлено приглашение', count(['invite_created'])],
  ['Приглашение принято', count(['invite_accepted'])],
  ['Отмечен приём или запись в дневнике', count(['intake_marked', 'care_note_created'])],
  ['Открыта сводка для врача', count(['summary_viewed', 'share_opened'])],
]

const activity = db.prepare("SELECT family_id, at FROM events WHERE name IN ('intake_marked', 'care_note_created') AND family_id IS NOT NULL").all()
const daysByFamilyWeek = new Map()
for (const e of activity) {
  const day = dayOf(e.at, tz[e.family_id])
  const k = `${e.family_id}|${weekStart(day)}`
  if (!daysByFamilyWeek.has(k)) daysByFamilyWeek.set(k, new Set())
  daysByFamilyWeek.get(k).add(day)
}
const goodWeeks = new Map()
for (const [k, days] of daysByFamilyWeek) {
  if (days.size >= DAYS_PER_WEEK) goodWeeks.set(k.split('|')[0], (goodWeeks.get(k.split('|')[0]) || 0) + 1)
}
const qualified = [...goodWeeks.values()].filter((w) => w >= WEEKS).length
const activeThisWeek = new Set(activity.filter((e) => weekStart(dayOf(e.at, tz[e.family_id])) === weekStart(dayOf(new Date().toISOString(), 'Europe/Moscow'))).map((e) => e.family_id)).size

const out = {
  families: families.length,
  funnel: Object.fromEntries(funnel),
  activeFamiliesThisWeek: activeThisWeek,
  familiesMeetingTarget: qualified,
  target: { families: TARGET_FAMILIES, daysPerWeek: DAYS_PER_WEEK, weeks: WEEKS },
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2))
} else {
  console.log(`Семей в базе: ${out.families}\n\nВоронка (число семей):`)
  for (const [name, n] of funnel) console.log(`  ${String(n).padStart(4)}  ${name}`)
  console.log(`\nАктивны на этой неделе (отметка или запись): ${activeThisWeek}`)
  console.log(`Цель MVP: ${qualified} из ${TARGET_FAMILIES} семей с ≥${DAYS_PER_WEEK} активными днями в неделю не менее ${WEEKS} недель`)
}
