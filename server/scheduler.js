// Планировщик внутри процесса: раз в минуту. Идемпотентен: всё держится на UNIQUE и метках времени в базе,
// поэтому перезапуск сервера ничего не дублирует и не теряет.
import { all, get, nowIso, run, uuid } from './util.js'
import { consentOk } from './state.js'
import { addDays, addMinutes, medActiveOn, tzNow } from './timeutil.js'
import { deliverMail, flushEmails, notify } from './notify.js'

const UNMARKED_AFTER = 60 // минут

export function tick(now = new Date()) {
  const families = all('SELECT id, timezone FROM families WHERE processing_stopped = 0')
  for (const f of families) {
    if (!consentOk(f.id)) continue
    const local = tzNow(f.timezone, now)
    const profiles = all('SELECT id, name FROM profiles WHERE family_id = ?', f.id)
    for (const p of profiles) {
      const meds = all("SELECT * FROM medications WHERE profile_id = ? AND (status = 'active' OR stopped_at IS NOT NULL)", p.id)
      const selfUser = get('SELECT user_id FROM grants WHERE self_profile_id = ?', p.id)
      for (const m of meds) {
        const times = JSON.parse(m.times || '[]')
        const createdLocal = tzNow(f.timezone, new Date(m.created_at)).dt
        for (const date of [addDays(local.date, -1), local.date]) {
          if (!medActiveOn(m, date)) continue
          for (const t of times) {
            const sched = `${date}T${t}`
            if (sched > local.dt || sched < createdLocal) continue
            if (get('SELECT 1 FROM intakes WHERE medication_id = ? AND scheduled_at = ?', m.id, sched)) continue
            // Время приёма: напоминание самому человеку, один раз на время приёма.
            if (selfUser && local.dt < addMinutes(sched, UNMARKED_AFTER)) {
              const made = notify({ familyId: f.id, profileId: p.id, kind: 'intake_due', title: 'Время принять лекарство', link: '#/today', refId: `${p.id}|${sched}`, userIds: [selfUser.user_id] })
              const u = made.length && get('SELECT email_intake FROM users WHERE id = ?', selfUser.user_id)
              if (u?.email_intake) {
                deliverMail(selfUser.user_id, 'Время принять лекарство', 'Пора отметить приём лекарства.', '#/today')
                run('UPDATE notifications SET emailed_at = ? WHERE id = ?', nowIso(), made[0].id)
              }
            }
            // Через час без отметки приём становится «не отмечен».
            if (local.dt >= addMinutes(sched, UNMARKED_AFTER)) {
              const id = uuid()
              const r = run("INSERT OR IGNORE INTO intakes (id, medication_id, profile_id, scheduled_at, status) VALUES (?,?,?,?,'unmarked')", id, m.id, p.id, sched)
              if (r.changes) notify({ familyId: f.id, profileId: p.id, kind: 'unmarked_intake', title: `Приём лекарства в ${t} не отмечен (${p.name})`, link: '#/today', refId: id })
            }
          }
        }
      }
      // Визиты: напоминание за сутки.
      for (const a of all("SELECT * FROM appointments WHERE profile_id = ? AND status = 'planned' AND reminded_at IS NULL", p.id)) {
        if (local.dt >= addMinutes(a.at, -1440) && local.dt < a.at) {
          notify({ familyId: f.id, profileId: p.id, kind: 'appointment_soon', title: `Визит к врачу завтра (${p.name})`, link: `#/visits/${p.id}/${a.id}`, refId: a.id })
          run('UPDATE appointments SET reminded_at = ? WHERE id = ?', nowIso(), a.id)
        }
      }
    }
  }
  flushEmails(now)
}

export function startScheduler() {
  if (process.env.SCHEDULER === '0') return
  const t = setInterval(() => {
    try {
      tick()
    } catch (e) {
      console.error('scheduler:', e.message)
    }
  }, 60000)
  t.unref()
}
