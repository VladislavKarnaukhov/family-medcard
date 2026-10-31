import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { db } from './db.js'

export const uuid = () => randomUUID()
export const token = (n = 24) => randomBytes(n).toString('base64url')
export const nowIso = () => new Date().toISOString()
export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const plusDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MONTHS = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.']
export const ruDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso))
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso)
}

export const get = (sql, ...p) => db.prepare(sql).get(...p)
export const all = (sql, ...p) => db.prepare(sql).all(...p)
export const run = (sql, ...p) => db.prepare(sql).run(...p)

export function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`
}

export function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false
  const a = Buffer.from(hash, 'hex')
  const b = scryptSync(pw, salt, 64)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
export const numOrNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export const inList = (ids) => (ids.length ? `(${ids.map(() => '?').join(',')})` : '(NULL)')

// События для измерения MVP: только имя, время, кто и в какой семье. Содержимого записей (лекарства, тексты, показатели) здесь нет.
// Живой помощник (консьерж): в MVP выключен, включается CONCIERGE=1. Рабочее место сотрудников и очередь документов остаются.
export const conciergeOn = () => process.env.CONCIERGE === '1'

export function track(name, { userId = null, familyId = null, role = null } = {}) {
  try {
    run('INSERT INTO events (id, at, name, user_id, family_id, role) VALUES (?,?,?,?,?,?)', uuid(), nowIso(), name, userId, familyId, role)
  } catch (e) {
    console.error('track:', e.message)
  }
}

export function log(familyId, user, profileId, action, whoOverride) {
  run(
    'INSERT INTO access_log (id, family_id, profile_id, user_id, who, action, at) VALUES (?,?,?,?,?,?,?)',
    uuid(),
    familyId,
    profileId || null,
    user?.id || null,
    whoOverride || (user ? (user.role === 'staff' ? `${user.name} (помощник)` : user.name) : 'Неизвестный'),
    action,
    nowIso(),
  )
}

export const safeJson = (s) => {
  try {
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}
