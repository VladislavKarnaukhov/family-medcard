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
