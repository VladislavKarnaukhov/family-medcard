// Уведомления: запись в таблицу и письма. Единая точка доставки: deliver(). Каналы кроме сайта и почты пока не нужны.
import { all, get, nowIso, run, uuid } from './util.js'
import { appUrl, layout, sendMailSoon } from './mailer.js'
import { profileAllowed } from './state.js'
import { tzNow } from './timeutil.js'
import { safeJson } from './util.js'

// Получатели события по профилю: kind определяет, кому что приходит.
export function recipients(familyId, profileId, kind) {
  const out = new Set()
  const grants = all('SELECT g.*, u.email_events FROM grants g JOIN users u ON u.id = g.user_id WHERE g.family_id = ? AND u.disabled = 0', familyId)
  const today = new Date().toISOString().slice(0, 10)
  for (const g of grants) {
    if (g.expires_at && g.expires_at < today) continue
    const ids = safeJson(g.profile_ids)
    if (!profileAllowed({ profileIds: ids }, profileId)) continue
    const self = g.self_profile_id === profileId
    if (g.access === 'owner') {
      if (kind !== 'intake_due') out.add(g.user_id)
    } else if (self) {
      if (kind === 'intake_due' || kind === 'appointment_soon') out.add(g.user_id)
    } else if (['unmarked_intake', 'fall', 'appointment_soon'].includes(kind) && ['instant', 'daily'].includes(g.email_events)) {
      out.add(g.user_id)
    }
  }
  if (kind === 'fall') {
    const f = get('SELECT staff_id FROM families WHERE id = ?', familyId)
    if (f?.staff_id) out.add(f.staff_id)
  }
  return [...out]
}

export function notify({ familyId, profileId, kind, title, link, refId, userIds }) {
  const ids = userIds || recipients(familyId, profileId, kind)
  const created = []
  for (const userId of ids) {
    const id = uuid()
    const r = run('INSERT OR IGNORE INTO notifications (id, family_id, user_id, profile_id, kind, title, link, ref_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)', id, familyId, userId, profileId || null, kind, title, link || '#/notifications', refId || null, nowIso())
    if (r.changes) created.push({ id, userId })
  }
  return created
}

// Письмо без сведений о здоровье: только факт и ссылка.
export function deliverMail(userId, subject, line, path) {
  const u = get('SELECT email FROM users WHERE id = ?', userId)
  if (!u) return
  const url = `${appUrl()}/${path}`
  sendMailSoon({ to: u.email, subject, text: `${line} Откройте приложение: ${url}`, html: layout({ title: subject, lines: [line], cta: { label: 'Открыть «Близкие»', url } }) })
}

// Письма о накопленных событиях по настройке пользователя: сразу (не чаще раза в 15 минут), сводкой раз в день или не присылать.
export function flushEmails(now = new Date()) {
  const users = all(
    `SELECT DISTINCT u.id, u.email_events, u.emailed_at, u.digest_date, u.role,
       EXISTS (SELECT 1 FROM grants g WHERE g.user_id = u.id AND g.access = 'owner') is_owner
     FROM users u JOIN notifications n ON n.user_id = u.id
     WHERE n.emailed_at IS NULL AND n.kind != 'intake_due' AND n.created_at > ? AND u.disabled = 0 AND u.role != 'staff'`,
    new Date(now.getTime() - 48 * 3600000).toISOString(),
  )
  for (const u of users) {
    const mode = u.email_events || (u.is_owner ? 'instant' : 'off')
    if (mode === 'off') continue
    const tz = get('SELECT f.timezone FROM grants g JOIN families f ON f.id = g.family_id WHERE g.user_id = ? ORDER BY g.created_at LIMIT 1', u.id)?.timezone
    const local = tzNow(tz, now)
    const day = local.date
    if (mode === 'instant' && u.emailed_at && now.getTime() - Date.parse(u.emailed_at) < 15 * 60000) continue
    if (mode === 'daily' && (u.digest_date === day || local.hour < 9)) continue
    const rows = all("SELECT id FROM notifications WHERE user_id = ? AND emailed_at IS NULL AND kind != 'intake_due' AND created_at > ?", u.id, new Date(now.getTime() - 48 * 3600000).toISOString())
    if (!rows.length) continue
    const n = rows.length
    deliverMail(u.id, n === 1 ? 'Новое событие в «Близких»' : `У вас ${n} новых событий`, n === 1 ? 'В «Близких» появилось новое событие.' : `В «Близких» появилось событий: ${n}.`, '#/notifications')
    const stamp = now.toISOString()
    for (const r of rows) run('UPDATE notifications SET emailed_at = ? WHERE id = ?', stamp, r.id)
    run('UPDATE users SET emailed_at = ?, digest_date = ? WHERE id = ?', stamp, day, u.id)
  }
}
