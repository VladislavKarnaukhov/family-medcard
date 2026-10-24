import express from 'express'
import compression from 'compression'
import { createReadStream, existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, tx, UPLOAD_DIR } from './db.js'
import { ruDate, all, checkPassword, get, hashPassword, inList, log, nowIso, numOrNull, plusDays, run, safeJson, str, today, token, uuid } from './util.js'
import { buildState, canWrite, consentOk, familyAccess, isOwner, profileAllowed } from './state.js'
import { mountConsent, recordConsent } from './consent.js'
import { aiEnabled, recognizeWithClaude } from './recognize.js'
import { ensureStaff } from './seed.js'
import { appUrl, isProd, layout, sendMailSoon } from './mailer.js'
import { mountAccount } from './account.js'
import { mountCare, notifView } from './care.js'
import { startScheduler } from './scheduler.js'

const here = dirname(fileURLToPath(import.meta.url))
const app = express()
app.disable('x-powered-by')
if (process.env.TRUST_PROXY) app.set('trust proxy', 1)
app.use(compression())
app.use(express.json({ limit: '6mb' }))

// Проверка живости для хостинга и балансировщика: без авторизации, без данных.
app.get('/healthz', (req, res) => {
  try {
    db.prepare('SELECT 1').get()
    res.json({ ok: true })
  } catch {
    res.status(503).json({ ok: false })
  }
})

// ---------- общие заголовки и защита ----------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cache-Control', 'no-store')
  if (isProd()) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
    res.setHeader('Strict-Transport-Security', 'max-age=15552000')
  }
  // Простая защита от CSRF: изменяющие запросы должны нести собственный заголовок.
  if (req.method !== 'GET' && req.path.startsWith('/api/') && req.get('x-app') !== '1') {
    return res.status(400).json({ error: 'bad_request' })
  }
  next()
})

const cookieOf = (req, name) =>
  (req.headers.cookie || '')
    .split(/;\s*/)
    .map((c) => c.split('='))
    .find(([k]) => k === name)?.[1]

app.use((req, res, next) => {
  const t = cookieOf(req, 'sid')
  if (t) {
    const s = get('SELECT * FROM sessions WHERE token = ?', t)
    if (s && s.expires_at > nowIso()) req.user = get('SELECT id, email, name, role, is_admin FROM users WHERE id = ? AND disabled = 0', s.user_id)
  }
  next()
})

const needUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'auth' }))
const needStaff = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'auth' })
  return req.user.role === 'staff' ? next() : res.status(403).json({ error: 'forbidden' })
}

const fail = (res, code, error) => res.status(code).json({ error })

function startSession(res, userId) {
  const t = token(32)
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)', t, userId, new Date(Date.now() + 30 * 86400000).toISOString())
  res.setHeader('Set-Cookie', `sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${isProd() ? '; Secure' : ''}`)
}

function mePayload(user) {
  const families =
    user.role === 'staff'
      ? []
      : all('SELECT g.*, f.name FROM grants g JOIN families f ON f.id = g.family_id WHERE g.user_id = ? ORDER BY g.created_at', user.id)
          .filter((g) => !g.expires_at || g.expires_at >= today())
          .map((g) => ({ id: g.family_id, name: g.name, access: g.access, roleLabel: g.role_label, expiresAt: g.expires_at, selfProfileId: g.self_profile_id || null }))
  const pref = get('SELECT email_events, email_intake, simple_mode FROM users WHERE id = ?', user.id)
  const isOwnerAny = families.some((f) => f.access === 'owner')
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role, isAdmin: !!user.is_admin, simpleMode: !!pref?.simple_mode, emailEvents: pref?.email_events || (isOwnerAny ? 'instant' : 'off'), emailIntake: !!pref?.email_intake },
    families,
  }
}

// ---------- авторизация ----------
const attempts = new Map()
const tooMany = (key) => {
  const a = attempts.get(key)
  return a && a.n >= 10 && Date.now() - a.t < 15 * 60000
}
const bump = (key, ok) => {
  if (ok) return attempts.delete(key)
  const a = attempts.get(key)
  attempts.set(key, { n: (a && Date.now() - a.t < 15 * 60000 ? a.n : 0) + 1, t: Date.now() })
}

function createFamily(user) {
  const staff = get(
    `SELECT u.id, u.name, COUNT(f.id) c FROM users u LEFT JOIN families f ON f.staff_id = u.id WHERE u.role = 'staff' GROUP BY u.id ORDER BY c LIMIT 1`,
  )
  const fid = uuid()
  run('INSERT INTO families (id, name, staff_id, created_at) VALUES (?,?,?,?)', fid, 'Моя семья', staff?.id || null, nowIso())
  run('INSERT INTO grants (id, family_id, user_id, role_label, access, created_at) VALUES (?,?,?,?,?,?)', uuid(), fid, user.id, 'Владелец', 'owner', nowIso())
  if (staff) {
    run(
      'INSERT INTO messages (id, family_id, author_id, author_name, author_kind, text, created_at) VALUES (?,?,?,?,?,?,?)',
      uuid(),
      fid,
      staff.id,
      staff.name,
      'staff',
      `Здравствуйте, ${user.name}! Меня зовут ${staff.name}, я ваш помощник по здоровью. Присылайте бланки и документы — я внесу их в досье. Если нужно что-то запросить в клинике или подготовить к визиту, напишите мне здесь.`,
      nowIso(),
    )
  }
  return fid
}

function acceptInvite(user, tok) {
  const inv = get('SELECT * FROM invites WHERE token = ?', tok)
  if (!inv || inv.accepted_at || inv.expires_at < nowIso()) throw Object.assign(new Error('invite'), { code: 410 })
  const existing = get('SELECT id FROM grants WHERE family_id = ? AND user_id = ?', inv.family_id, user.id)
  if (existing) throw Object.assign(new Error('member'), { code: 409 })
  run(
    'INSERT INTO grants (id, family_id, user_id, role_label, access, profile_ids, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?)',
    uuid(),
    inv.family_id,
    user.id,
    inv.role_label,
    inv.access,
    inv.profile_ids,
    inv.access_days ? plusDays(inv.access_days) : null,
    nowIso(),
  )
  if (inv.self_profile_id) {
    // «Сам(а)»: пользователь связывается со своим профилем, для него включается простой режим.
    if (get('SELECT 1 FROM grants WHERE self_profile_id = ?', inv.self_profile_id)) throw Object.assign(new Error('taken'), { code: 409 })
    run('UPDATE grants SET self_profile_id = ? WHERE family_id = ? AND user_id = ?', inv.self_profile_id, inv.family_id, user.id)
    run('UPDATE users SET simple_mode = 1 WHERE id = ?', user.id)
  }
  run('UPDATE invites SET accepted_by = ?, accepted_at = ? WHERE token = ?', user.id, nowIso(), tok)
  log(inv.family_id, user, null, `Принял(а) приглашение (${inv.role_label})`)
  return inv.family_id
}

const regHits = new Map()
app.post('/api/auth/register', (req, res) => {
  const recent = (regHits.get(req.ip) || []).filter((t) => Date.now() - t < 3600000)
  if (recent.length >= 10) return fail(res, 429, 'Слишком много регистраций с этого адреса. Попробуйте позже.')
  regHits.set(req.ip, [...recent, Date.now()])
  const name = str(req.body.name, 80)
  const email = str(req.body.email, 200).toLowerCase()
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'Проверьте имя и email')
  if (password.length < 8) return fail(res, 400, 'Пароль должен быть не короче 8 символов')
  const given = req.body.consents || {}
  if (given.terms !== true || given.consent_pd !== true) return fail(res, 400, 'Примите пользовательское соглашение и дайте согласие на обработку персональных данных')
  if (get('SELECT id FROM users WHERE email = ?', email)) return fail(res, 409, 'Этот email уже зарегистрирован')
  try {
    const user = tx(() => {
      const id = uuid()
      run('INSERT INTO users (id, email, name, password, role, created_at) VALUES (?,?,?,?,?,?)', id, email, name, hashPassword(password), 'user', nowIso())
      const u = { id, email, name, role: 'user' }
      recordConsent(req, { userId: id, docId: 'terms', method: 'checkbox' })
      recordConsent(req, { userId: id, docId: 'consent_pd', method: 'checkbox' })
      if (req.body.inviteToken) acceptInvite(u, str(req.body.inviteToken, 100))
      else createFamily(u)
      return u
    })
    startSession(res, user.id)
    res.json(mePayload(user))
  } catch (e) {
    if (e.code === 410) return fail(res, 410, 'Приглашение недействительно или истекло')
    if (e.code === 409) return fail(res, 409, 'Это приглашение уже использовано')
    throw e
  }
})

app.post('/api/auth/login', (req, res) => {
  const email = str(req.body.email, 200).toLowerCase()
  const key = `${email}|${req.ip}`
  if (tooMany(key)) return fail(res, 429, 'Слишком много попыток. Подождите 15 минут.')
  const u = get('SELECT * FROM users WHERE email = ? AND disabled = 0', email)
  const ok = u && checkPassword(String(req.body.password || ''), u.password)
  bump(key, !!ok)
  if (!ok) return fail(res, 401, 'Неверный email или пароль')
  startSession(res, u.id)
  res.json(mePayload(u))
})

app.post('/api/auth/logout', (req, res) => {
  const t = cookieOf(req, 'sid')
  if (t) run('DELETE FROM sessions WHERE token = ?', t)
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')
  res.json({ ok: true })
})

app.get('/api/me', needUser, (req, res) => res.json(mePayload(req.user)))

// ---------- приглашения ----------
app.get('/api/invites/:token', (req, res) => {
  const inv = get('SELECT i.*, f.name family_name, u.name inviter FROM invites i JOIN families f ON f.id = i.family_id JOIN users u ON u.id = i.created_by WHERE i.token = ?', req.params.token)
  if (!inv || inv.accepted_at || inv.expires_at < nowIso()) return fail(res, 410, 'Приглашение недействительно или истекло')
  const ids = safeJson(inv.profile_ids)
  const profiles = ids
    ? all(`SELECT name FROM profiles WHERE id IN ${inList(ids)}`, ...ids).map((p) => p.name)
    : all('SELECT name FROM profiles WHERE family_id = ?', inv.family_id).map((p) => p.name)
  const self = inv.self_profile_id ? get('SELECT name, consent_status FROM profiles WHERE id = ?', inv.self_profile_id) : null
  // Кто увидит данные: владелец, помощник сервиса и уже приглашённые близкие. Для приглашения «Сам(а)» это показывается человеку явно.
  const viewers = all("SELECT u.name, g.role_label FROM grants g JOIN users u ON u.id = g.user_id WHERE g.family_id = ? AND g.self_profile_id IS NULL ORDER BY g.created_at", inv.family_id).map((g) => `${g.name} (${g.role_label})`)
  res.json({ familyName: inv.family_name, inviter: inv.inviter, role: inv.role_label, access: inv.access, accessDays: inv.access_days, profiles, self: !!self, selfProfile: self?.name || null, selfConfirmed: self ? self.consent_status === 'confirmed' : null, viewers })
})

app.post('/api/invites/:token/accept', needUser, (req, res) => {
  try {
    const fid = tx(() => acceptInvite(req.user, req.params.token))
    res.json({ familyId: fid, ...mePayload(req.user) })
  } catch (e) {
    if (e.code === 410) return fail(res, 410, 'Приглашение недействительно или истекло')
    if (e.code === 409) return fail(res, 409, 'Вы уже в этом круге заботы')
    throw e
  }
})

// Любая запись данных требует действующего согласия владельца на обработку данных о здоровье.
function gate(req, res, familyId, need, opts) {
  if (need === 'read' || req.method === 'DELETE' || opts?.consent === false) return true
  if (!consentOk(familyId)) {
    const stopped = get('SELECT processing_stopped s FROM families WHERE id = ?', familyId)?.s
    res.status(stopped ? 423 : 403).json({ error: stopped ? 'Обработка остановлена: согласие отозвано' : 'Сначала подпишите согласие на обработку данных о здоровье', code: stopped ? 'stopped' : 'consent_required' })
    return false
  }
  return true
}

function ctxFamily(req, res, need = 'read', opts) {
  const a = familyAccess(req.user, req.params.fid)
  if (!a) return fail(res, 404, 'not_found'), null
  if (need === 'write' && !canWrite(a)) return fail(res, 403, 'forbidden'), null
  if (need === 'owner' && !isOwner(a)) return fail(res, 403, 'forbidden'), null
  if (!gate(req, res, req.params.fid, need, opts)) return null
  return a
}

app.post('/api/families/:fid/invites', needUser, (req, res) => {
  const a = ctxFamily(req, res, 'owner')
  if (!a) return
  const preset = ['self', 'caregiver'].includes(req.body.preset) ? req.body.preset : null
  const access = preset || req.body.access === 'add' ? 'add' : 'view'
  const role = preset === 'self' ? 'Сам(а)' : preset === 'caregiver' ? 'Сиделка' : str(req.body.role, 40) || 'Близкий'
  let ids = Array.isArray(req.body.profileIds) && req.body.profileIds.length ? req.body.profileIds.map(String) : null
  let selfProfileId = null
  if (preset === 'self') {
    selfProfileId = str(req.body.profileId, 80) || (ids && ids.length === 1 ? ids[0] : '')
    const sp = get('SELECT id FROM profiles WHERE id = ? AND family_id = ?', selfProfileId, req.params.fid)
    if (!sp) return fail(res, 400, 'Выберите профиль человека')
    if (get('SELECT 1 FROM grants WHERE self_profile_id = ?', sp.id) || get('SELECT 1 FROM invites WHERE self_profile_id = ? AND accepted_at IS NULL AND expires_at > ?', sp.id, nowIso())) return fail(res, 409, 'У этого профиля уже есть вход или отправлено приглашение')
    ids = [sp.id]
  }
  if (ids) {
    const ok = all(`SELECT id FROM profiles WHERE family_id = ? AND id IN ${inList(ids)}`, req.params.fid, ...ids).length
    if (ok !== ids.length) return fail(res, 400, 'Неверные профили')
  }
  const days = preset === 'self' ? null : [7, 30, 90].includes(Number(req.body.accessDays)) ? Number(req.body.accessDays) : null
  if (req.body.consentConfirmed !== true) return fail(res, 400, 'Подтвердите согласие на предоставление доступа')
  const covered = ids || all('SELECT id FROM profiles WHERE family_id = ?', req.params.fid).map((p) => p.id)
  for (const pid of covered) recordConsent(req, { userId: req.user.id, familyId: req.params.fid, profileId: pid, docId: 'consent_circle', method: 'attestation', subjectContact: role })
  const tok = token(18)
  run(
    'INSERT INTO invites (token, family_id, created_by, role_label, access, profile_ids, access_days, expires_at, self_profile_id) VALUES (?,?,?,?,?,?,?,?,?)',
    tok,
    req.params.fid,
    req.user.id,
    role,
    access,
    ids ? JSON.stringify(ids) : null,
    days,
    new Date(Date.now() + 14 * 86400000).toISOString(),
    selfProfileId,
  )
  log(req.params.fid, req.user, null, `Создано приглашение: ${role}`)
  const to = str(req.body.email, 200).toLowerCase()
  let emailed = false
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    const url = `${appUrl()}/#/invite/${tok}`
    sendMailSoon({
      to,
      subject: `${req.user.name} приглашает вас в «Близкие»`,
      text: `${req.user.name} открывает вам доступ (${role}). Приглашение действует 14 дней: ${url}`,
      html: layout({ title: `${req.user.name} приглашает вас в круг заботы`, lines: [`Ваша роль: ${role}.`, access === 'add' ? 'Вы сможете просматривать данные и добавлять документы.' : 'Вы сможете просматривать данные.', 'Приглашение действует 14 дней.'], cta: { label: 'Принять приглашение', url } }),
    })
    emailed = true
  }
  res.json({ token: tok, emailed })
})

app.delete('/api/invites/:token', needUser, (req, res) => {
  const inv = get('SELECT * FROM invites WHERE token = ?', req.params.token)
  if (!inv) return fail(res, 404, 'not_found')
  req.params.fid = inv.family_id
  if (!ctxFamily(req, res, 'owner')) return
  run('DELETE FROM invites WHERE token = ?', req.params.token)
  res.json({ ok: true })
})

app.delete('/api/families/:fid/members/:gid', needUser, (req, res) => {
  if (!ctxFamily(req, res, 'owner')) return
  const g = get('SELECT g.*, u.name FROM grants g JOIN users u ON u.id = g.user_id WHERE g.id = ? AND g.family_id = ?', req.params.gid, req.params.fid)
  if (!g) return fail(res, 404, 'not_found')
  if (g.access === 'owner') return fail(res, 400, 'Владельца удалить нельзя')
  run('DELETE FROM grants WHERE id = ?', g.id)
  log(req.params.fid, req.user, null, `Доступ закрыт: ${g.name}`)
  res.json({ ok: true })
})

// ---------- данные семьи ----------
app.get('/api/families/:fid/state', needUser, (req, res) => {
  const a = ctxFamily(req, res)
  if (!a) return
  // Прозрачность для клиента: открытие данных не владельцем попадает в журнал (не чаще раза в 30 минут).
  if (a.access !== 'owner') {
    const since = new Date(Date.now() - 30 * 60000).toISOString()
    const seen = get('SELECT id FROM access_log WHERE family_id = ? AND user_id = ? AND action = ? AND at > ?', req.params.fid, req.user.id, 'Открыл(а) данные', since)
    if (!seen) log(req.params.fid, req.user, null, 'Открыл(а) данные')
  }
  const state = buildState(req.params.fid, a)
  state.notifications = all('SELECT * FROM notifications WHERE user_id = ? AND family_id = ? ORDER BY created_at DESC LIMIT 50', req.user.id, req.params.fid).map(notifView)
  state.unreadNotifications = get('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND family_id = ? AND read_at IS NULL', req.user.id, req.params.fid).c
  res.json(state)
})

function ctxProfile(req, res, pid, need = 'read', opts) {
  const p = get('SELECT * FROM profiles WHERE id = ?', pid)
  const a = p && familyAccess(req.user, p.family_id)
  if (!p || !a || !profileAllowed(a, p.id)) return fail(res, 404, 'not_found'), null
  if (need === 'write' && !canWrite(a)) return fail(res, 403, 'forbidden'), null
  if (need === 'owner' && !isOwner(a)) return fail(res, 403, 'forbidden'), null
  if (!gate(req, res, p.family_id, need, opts)) return null
  return { p, a }
}

const sex = (v) => (v === 'm' || v === 'f' ? v : '')
const year = (v) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1900 && n <= new Date().getFullYear() ? n : null
}

app.post('/api/families/:fid/profiles', needUser, (req, res) => {
  if (!ctxFamily(req, res, 'owner')) return
  const name = str(req.body.name, 80)
  if (!name) return fail(res, 400, 'Укажите имя')
  const basis = ['self', 'adult', 'guardian_child', 'guardian_ward'].includes(req.body.basis) ? req.body.basis : null
  if (!basis) return fail(res, 400, 'Укажите, чьи это данные')
  const by = year(req.body.birthYear)
  if (by && by > new Date().getFullYear() - 18 && basis !== 'guardian_child') return fail(res, 400, 'Данные несовершеннолетнего вносит законный представитель')
  if (basis !== 'self' && req.body.attest !== true) return fail(res, 400, 'Подтвердите согласие или полномочия')
  const id = uuid()
  tx(() => {
    run('INSERT INTO profiles (id, family_id, name, birth_year, sex, notes, basis, consent_status) VALUES (?,?,?,?,?,?,?,?)', id, req.params.fid, name, by, sex(req.body.sex), str(req.body.notes, 4000), basis, basis === 'self' ? 'self' : 'attested')
    if (basis !== 'self') recordConsent(req, { userId: req.user.id, familyId: req.params.fid, profileId: id, docId: basis === 'adult' ? 'consent_adult' : 'consent_guardian', method: 'attestation', subjectName: name })
  })
  log(req.params.fid, req.user, id, `Создан профиль «${name}»`)
  res.json({ id })
})

app.put('/api/profiles/:id', needUser, (req, res) => {
  const c = ctxProfile(req, res, req.params.id, 'owner')
  if (!c) return
  const name = str(req.body.name, 80)
  if (!name) return fail(res, 400, 'Укажите имя')
  const nby = year(req.body.birthYear)
  if (nby && nby > new Date().getFullYear() - 18 && c.p.basis !== 'guardian_child') return fail(res, 400, 'Данные несовершеннолетнего вносит законный представитель')
  const contacts = Array.isArray(req.body.emergencyContacts) ? req.body.emergencyContacts.slice(0, 3).map((x) => ({ name: str(x?.name, 80), relation: str(x?.relation, 40), phone: str(x?.phone, 30) })).filter((x) => x.name && x.phone) : safeJson(c.p.emergency_contacts) || []
  run('UPDATE profiles SET name = ?, birth_year = ?, sex = ?, notes = ?, allergies = ?, emergency_contacts = ? WHERE id = ?', name, year(req.body.birthYear), sex(req.body.sex), str(req.body.notes, 4000), req.body.allergies === undefined ? c.p.allergies : str(req.body.allergies, 1000), JSON.stringify(contacts), c.p.id)
  res.json({ ok: true })
})

function removeFiles(rows) {
  for (const r of rows) if (r.file_path) try { unlinkSync(join(UPLOAD_DIR, r.file_path)) } catch { /* файла уже нет */ }
}

app.delete('/api/profiles/:id', needUser, (req, res) => {
  const c = ctxProfile(req, res, req.params.id, 'owner')
  if (!c) return
  removeFiles(all('SELECT file_path FROM documents WHERE profile_id = ?', c.p.id))
  run('DELETE FROM profiles WHERE id = ?', c.p.id)
  res.json({ ok: true })
})

app.put('/api/profiles/:id/questions', needUser, (req, res) => {
  const c = ctxProfile(req, res, req.params.id, 'write')
  if (!c) return
  run('UPDATE profiles SET questions = ? WHERE id = ?', str(req.body.text, 4000), c.p.id)
  res.json({ ok: true })
})

function insertLabResult(profileId, body) {
  const date = str(body.date, 10)
  const labName = str(body.labName, 120)
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 200) : []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !labName || !rows.length) return null
  const id = uuid()
  tx(() => {
    run('INSERT INTO lab_results (id, profile_id, date, lab_name, source_file) VALUES (?,?,?,?,?)', id, profileId, date, labName, str(body.sourceFile, 200))
    insertMeasurements(id, rows)
  })
  return id
}

function insertMeasurements(labId, rows) {
  for (const r of rows) {
    const value = numOrNull(r.value)
    const name = str(r.name, 160)
    if (value == null || !name) continue
    run(
      'INSERT INTO measurements (id, lab_result_id, name, value, unit, ref_low, ref_high, normalized_value, normalized_unit, indicator_key) VALUES (?,?,?,?,?,?,?,?,?,?)',
      uuid(),
      labId,
      name,
      value,
      str(r.unit, 30),
      numOrNull(r.refLow),
      numOrNull(r.refHigh),
      numOrNull(r.normalizedValue) ?? value,
      str(r.normalizedUnit, 30) || str(r.unit, 30),
      str(r.indicatorKey, 200) || null,
    )
  }
}

app.post('/api/profiles/:id/lab-results', needUser, (req, res) => {
  const c = ctxProfile(req, res, req.params.id, 'write')
  if (!c) return
  const id = insertLabResult(c.p.id, req.body)
  if (!id) return fail(res, 400, 'Проверьте дату, лабораторию и показатели')
  log(c.p.family_id, req.user, c.p.id, `Добавлен анализ (${str(req.body.labName, 60)})`)
  res.json({ id })
})

// Исправление анализа: дата, лаборатория и все строки заменяются.
app.put('/api/lab-results/:id', needUser, (req, res) => {
  const l = get('SELECT * FROM lab_results WHERE id = ?', req.params.id)
  if (!l) return fail(res, 404, 'not_found')
  const c = ctxProfile(req, res, l.profile_id, 'write')
  if (!c) return
  const date = str(req.body.date, 10)
  const labName = str(req.body.labName, 120)
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 200) : []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !labName || !rows.length) return fail(res, 400, 'Проверьте дату, лабораторию и показатели')
  tx(() => {
    run('UPDATE lab_results SET date = ?, lab_name = ? WHERE id = ?', date, labName, l.id)
    run('DELETE FROM measurements WHERE lab_result_id = ?', l.id)
    insertMeasurements(l.id, rows)
  })
  log(c.p.family_id, req.user, c.p.id, `Исправлен анализ (${labName})`)
  res.json({ ok: true })
})

app.delete('/api/lab-results/:id', needUser, (req, res) => {
  const l = get('SELECT * FROM lab_results WHERE id = ?', req.params.id)
  if (!l) return fail(res, 404, 'not_found')
  const c = ctxProfile(req, res, l.profile_id, 'write')
  if (!c) return
  removeFiles(all('SELECT file_path FROM documents WHERE lab_result_id = ?', l.id))
  run('DELETE FROM documents WHERE lab_result_id = ?', l.id)
  run('DELETE FROM lab_results WHERE id = ?', l.id)
  res.json({ ok: true })
})

app.post('/api/profiles/:id/vitals', needUser, (req, res) => {
  const c = ctxProfile(req, res, req.params.id, 'write')
  if (!c) return
  const s = Number(req.body.systolic)
  const d = Number(req.body.diastolic)
  const p = Number(req.body.pulse)
  if (![s, d, p].every(Number.isInteger) || s < 60 || s > 260 || d < 30 || d > 160 || s <= d || p < 30 || p > 220) return fail(res, 400, 'Проверьте значения')
  const dt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(req.body.datetime) ? req.body.datetime : nowIso().slice(0, 16)
  const id = uuid()
  run('INSERT INTO vitals (id, profile_id, datetime, systolic, diastolic, pulse) VALUES (?,?,?,?,?,?)', id, c.p.id, dt, s, d, p)
  res.json({ id })
})

app.delete('/api/vitals/:id', needUser, (req, res) => {
  const v = get('SELECT * FROM vitals WHERE id = ?', req.params.id)
  if (!v || !ctxProfile(req, res, v.profile_id, 'write')) return
  run('DELETE FROM vitals WHERE id = ?', v.id)
  res.json({ ok: true })
})

// ---------- документы и файлы ----------
const TYPES = ['analysis', 'extract', 'imaging', 'prescription', 'vaccine', 'insurance', 'authorization']
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf'])

app.post('/api/profiles/:id/documents', needUser, (req, res) => {
  const c = ctxProfile(req, res, req.params.id, 'write')
  if (!c) return
  const type = TYPES.includes(req.body.type) ? req.body.type : 'extract'
  const title = str(req.body.title, 200)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date) ? req.body.date : today()
  if (!title) return fail(res, 400, 'Укажите название')
  const staff = req.user.role === 'staff'
  const labId = req.body.labResultId && get('SELECT id FROM lab_results WHERE id = ? AND profile_id = ?', req.body.labResultId, c.p.id)?.id
  const status = staff || labId ? 'ready' : 'processing'
  const id = uuid()
  run(
    'INSERT INTO documents (id, profile_id, type, title, date, status, added_by_kind, added_by_name, lab_result_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    id,
    c.p.id,
    type,
    title,
    date,
    status,
    staff ? 'assistant' : 'client',
    req.user.name,
    labId || null,
    str(req.body.note, 500),
    nowIso(),
  )
  log(c.p.family_id, req.user, c.p.id, `Добавлен документ: ${title}`)
  res.json({ id })
})

app.put('/api/documents/:id/file', needUser, express.raw({ type: () => true, limit: '25mb' }), (req, res) => {
  const d = get('SELECT * FROM documents WHERE id = ?', req.params.id)
  if (!d || !ctxProfile(req, res, d.profile_id, 'write')) return
  const mime = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!MIME.has(mime)) return fail(res, 415, 'Допустимы фото (JPG, PNG, WebP, HEIC) и PDF')
  if (!Buffer.isBuffer(req.body) || !req.body.length) return fail(res, 400, 'Пустой файл')
  if (mime === 'application/pdf' && req.body.subarray(0, 5).toString() !== '%PDF-') return fail(res, 415, 'Файл не похож на PDF')
  const name = uuid()
  writeFileSync(join(UPLOAD_DIR, name), req.body)
  removeFiles([d])
  run('UPDATE documents SET file_path = ?, file_mime = ?, file_name = ? WHERE id = ?', name, mime, str(decodeURIComponent(req.get('x-filename') || 'file'), 200), d.id)
  if (req.user.role !== 'staff') notifyStaffFile(req.user.name)
  res.json({ ok: true })
})

app.get('/api/documents/:id/file', needUser, (req, res) => {
  const d = get('SELECT * FROM documents WHERE id = ?', req.params.id)
  if (!d || !d.file_path || !ctxProfile(req, res, d.profile_id, 'read')) return
  const path = join(UPLOAD_DIR, d.file_path)
  if (!existsSync(path)) return fail(res, 404, 'not_found')
  res.setHeader('Content-Type', d.file_mime)
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(d.file_name || 'file')}`)
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox")
  createReadStream(path).pipe(res)
})

app.delete('/api/documents/:id', needUser, (req, res) => {
  const d = get('SELECT * FROM documents WHERE id = ?', req.params.id)
  if (!d || !ctxProfile(req, res, d.profile_id, 'write')) return
  removeFiles([d])
  run('DELETE FROM documents WHERE id = ?', d.id)
  res.json({ ok: true })
})

// ---------- переписка и поручения ----------
app.post('/api/families/:fid/messages', needUser, (req, res) => {
  const a = ctxFamily(req, res, 'owner', { consent: false })
  if (!a) return
  const text = str(req.body.text, 4000)
  if (!text) return fail(res, 400, 'Пустое сообщение')
  run('INSERT INTO messages (id, family_id, author_id, author_name, author_kind, text, created_at) VALUES (?,?,?,?,?,?,?)', uuid(), req.params.fid, req.user.id, req.user.name, 'client', text, nowIso())
  res.json({ ok: true })
})

app.post('/api/families/:fid/read', needUser, (req, res) => {
  if (!ctxFamily(req, res, 'owner', { consent: false })) return
  run('UPDATE families SET client_read_at = ? WHERE id = ?', nowIso(), req.params.fid)
  res.json({ ok: true })
})

app.post('/api/families/:fid/requests', needUser, (req, res) => {
  const a = ctxFamily(req, res, 'owner')
  if (!a) return
  const title = str(req.body.title, 200)
  if (!title) return fail(res, 400, 'Пустое поручение')
  const pid = req.body.profileId && get('SELECT id, name FROM profiles WHERE id = ? AND family_id = ?', req.body.profileId, req.params.fid)
  const f = get('SELECT staff_id FROM families WHERE id = ?', req.params.fid)
  tx(() => {
    run('INSERT INTO requests (id, family_id, profile_id, title, assignee_id, due, created_at, created_by) VALUES (?,?,?,?,?,?,?,?)', uuid(), req.params.fid, pid?.id || null, title, f?.staff_id || null, plusDays(1), nowIso(), req.user.id)
    run('INSERT INTO messages (id, family_id, author_id, author_name, author_kind, text, created_at) VALUES (?,?,?,?,?,?,?)', uuid(), req.params.fid, req.user.id, req.user.name, 'client', `${title}${pid ? ` — ${pid.name}` : ''}`, nowIso())
  })
  res.json({ ok: true })
})

// ---------- ссылка для врача ----------
app.post('/api/profiles/:id/share', needUser, (req, res) => {
  const c = ctxProfile(req, res, req.params.id, 'owner')
  if (!c) return
  const days = [1, 7, 30].includes(Number(req.body.days)) ? Number(req.body.days) : 7
  if (req.body.consentConfirmed !== true) return fail(res, 400, 'Подтвердите согласие на передачу сводки врачу')
  recordConsent(req, { userId: req.user.id, familyId: c.p.family_id, profileId: c.p.id, docId: 'consent_doctor', method: 'attestation' })
  const t = token(18)
  run('INSERT INTO share_links (token, profile_id, family_id, expires_at, created_at) VALUES (?,?,?,?,?)', t, c.p.id, c.p.family_id, new Date(Date.now() + days * 86400000).toISOString(), nowIso())
  log(c.p.family_id, req.user, c.p.id, `Создана ссылка для врача на ${days} дн.`)
  res.json({ token: t })
})

app.get('/api/share/:token', (req, res) => {
  const s = get('SELECT * FROM share_links WHERE token = ?', req.params.token)
  if (!s || s.expires_at < nowIso()) return fail(res, 410, 'Ссылка недействительна или истекла')
  log(s.family_id, null, s.profile_id, 'Открыта ссылка для врача', 'Врач (по ссылке)')
  const state = buildState(s.family_id, { access: 'share', profileIds: [s.profile_id] })
  res.json({ ...state, activeProfileId: s.profile_id, expiresAt: s.expires_at })
})

// ---------- удаление данных семьи ----------
function wipeFamily(fid) {
  removeFiles(all('SELECT d.file_path FROM documents d JOIN profiles p ON p.id = d.profile_id WHERE p.family_id = ?', fid))
  run('DELETE FROM profiles WHERE family_id = ?', fid)
  run('DELETE FROM requests WHERE family_id = ?', fid)
  run('DELETE FROM messages WHERE family_id = ?', fid)
}

// ---------- интерфейс сотрудников ----------
app.get('/api/staff/inbox', needStaff, (req, res) => {
  const fams = all(
    `SELECT f.*, (SELECT name FROM users WHERE id = f.staff_id) staff_name,
       (SELECT u.name FROM grants g JOIN users u ON u.id = g.user_id WHERE g.family_id = f.id AND g.access = 'owner' LIMIT 1) owner_name,
       (SELECT u.email FROM grants g JOIN users u ON u.id = g.user_id WHERE g.family_id = f.id AND g.access = 'owner' LIMIT 1) owner_email
     FROM families f`,
  )
  const rows = fams.map((f) => {
    const last = get('SELECT * FROM messages WHERE family_id = ? ORDER BY created_at DESC LIMIT 1', f.id)
    const lastClient = get("SELECT created_at FROM messages WHERE family_id = ? AND author_kind = 'client' AND internal = 0 ORDER BY created_at DESC LIMIT 1", f.id)
    return {
      id: f.id,
      owner: f.owner_name,
      email: f.owner_email,
      assigneeId: f.staff_id,
      assignee: f.staff_name,
      unread: !!lastClient && (!f.staff_read_at || lastClient.created_at > f.staff_read_at),
      waitingSince: lastClient && (!f.staff_read_at || lastClient.created_at > f.staff_read_at) ? lastClient.created_at : null,
      last: last ? { text: last.text, at: last.created_at, from: last.author_kind, internal: !!last.internal } : null,
      openRequests: get("SELECT COUNT(*) c FROM requests WHERE family_id = ? AND status != 'done'", f.id).c,
      pendingDocs: get("SELECT COUNT(*) c FROM documents d JOIN profiles p ON p.id = d.profile_id WHERE p.family_id = ? AND d.status = 'processing'", f.id).c,
      profiles: all('SELECT name FROM profiles WHERE family_id = ?', f.id).map((p) => p.name),
      consent: consentOk(f.id),
    }
  })
  rows.sort((a, b) => Number(b.unread) - Number(a.unread) || (b.last?.at || '').localeCompare(a.last?.at || ''))
  res.json(rows)
})

app.get('/api/staff/staff-list', needStaff, (req, res) => res.json(all("SELECT id, name FROM users WHERE role = 'staff' AND disabled = 0 ORDER BY name")))

app.get('/api/staff/families/:fid', needStaff, (req, res) => {
  const f = get('SELECT * FROM families WHERE id = ?', req.params.fid)
  if (!f) return fail(res, 404, 'not_found')
  if (!consentOk(f.id)) return res.status(423).json({ error: 'У клиента нет действующего согласия на обработку данных о здоровье. Работа с данными невозможна.', code: 'no_consent' })
  const owner = get("SELECT u.name, u.email FROM grants g JOIN users u ON u.id = g.user_id WHERE g.family_id = ? AND g.access = 'owner'", f.id)
  const state = buildState(f.id, { access: 'staff', profileIds: null })
  // Прозрачность: клиент видит в журнале, что помощник открывал данные (не чаще раза в 30 минут).
  const since = new Date(Date.now() - 30 * 60000).toISOString()
  if (!get('SELECT id FROM access_log WHERE family_id = ? AND user_id = ? AND action = ? AND at > ?', f.id, req.user.id, 'Открыл(а) данные', since)) log(f.id, req.user, null, 'Открыл(а) данные')
  res.json({ ...state, assigneeId: f.staff_id, owner })
})

app.post('/api/staff/families/:fid/read', needStaff, (req, res) => {
  run('UPDATE families SET staff_read_at = ? WHERE id = ?', nowIso(), req.params.fid)
  res.json({ ok: true })
})

app.patch('/api/staff/families/:fid', needStaff, (req, res) => {
  const id = req.body.assigneeId
  if (id && !get("SELECT id FROM users WHERE id = ? AND role = 'staff'", id)) return fail(res, 400, 'Неверный сотрудник')
  run('UPDATE families SET staff_id = ? WHERE id = ?', id || null, req.params.fid)
  res.json({ ok: true })
})

app.post('/api/staff/families/:fid/messages', needStaff, (req, res) => {
  const text = str(req.body.text, 4000)
  if (!text) return fail(res, 400, 'Пустое сообщение')
  if (!get('SELECT id FROM families WHERE id = ?', req.params.fid)) return fail(res, 404, 'not_found')
  const internal = req.body.internal ? 1 : 0
  run('INSERT INTO messages (id, family_id, author_id, author_name, author_kind, text, internal, created_at) VALUES (?,?,?,?,?,?,?,?)', uuid(), req.params.fid, req.user.id, req.user.name, 'staff', text, internal, nowIso())
  if (!internal) {
    run('UPDATE families SET staff_read_at = ? WHERE id = ?', nowIso(), req.params.fid)
    notifyClient(req.params.fid, req.user.name)
  }
  res.json({ ok: true })
})

// Письмо клиенту о новом сообщении помощника: без текста сообщения, не чаще раза в 15 минут.
function notifyClient(familyId, staffName) {
  const f = get('SELECT notified_at FROM families WHERE id = ?', familyId)
  if (f?.notified_at && Date.now() - Date.parse(f.notified_at) < 15 * 60000) return
  const owner = get("SELECT u.email FROM grants g JOIN users u ON u.id = g.user_id WHERE g.family_id = ? AND g.access = 'owner'", familyId)
  if (!owner) return
  run('UPDATE families SET notified_at = ? WHERE id = ?', nowIso(), familyId)
  const url = `${appUrl()}/#/assistant`
  sendMailSoon({
    to: owner.email,
    subject: 'Новое сообщение от помощника',
    text: `${staffName} ответил(а) вам в «Близких». Откройте приложение, чтобы прочитать: ${url}`,
    html: layout({ title: 'Новое сообщение от помощника', lines: [`${staffName} ответил(а) вам в «Близких».`, 'Текст сообщения мы не отправляем по почте, чтобы он не попал в чужие руки.'], cta: { label: 'Открыть сообщения', url } }),
  })
}

app.get('/api/staff/requests', needStaff, (req, res) => {
  res.json(
    all(
      `SELECT r.*, (SELECT name FROM users WHERE id = r.assignee_id) assignee,
         (SELECT name FROM profiles WHERE id = r.profile_id) profile_name,
         (SELECT u.name FROM grants g JOIN users u ON u.id = g.user_id WHERE g.family_id = r.family_id AND g.access = 'owner' LIMIT 1) owner
       FROM requests r ORDER BY CASE r.status WHEN 'done' THEN 1 ELSE 0 END, r.created_at DESC LIMIT 200`,
    ).map((r) => ({ id: r.id, familyId: r.family_id, title: r.title, status: r.status, due: r.due, createdAt: r.created_at, assigneeId: r.assignee_id, assignee: r.assignee, profile: r.profile_name, owner: r.owner })),
  )
})

app.patch('/api/staff/requests/:id', needStaff, (req, res) => {
  const r = get('SELECT * FROM requests WHERE id = ?', req.params.id)
  if (!r) return fail(res, 404, 'not_found')
  const status = ['accepted', 'working', 'done'].includes(req.body.status) ? req.body.status : r.status
  const assignee = 'assigneeId' in req.body ? req.body.assigneeId || null : r.assignee_id
  if (assignee && !get("SELECT id FROM users WHERE id = ? AND role = 'staff'", assignee)) return fail(res, 400, 'Неверный сотрудник')
  run('UPDATE requests SET status = ?, assignee_id = ? WHERE id = ?', status, assignee, r.id)
  res.json({ ok: true })
})

// Письмо администраторам о новом файле от клиента: без содержимого, не чаще раза в 10 минут.
let staffNotifiedAt = 0
function notifyStaffFile(clientName) {
  if (Date.now() - staffNotifiedAt < 600000) return
  const admins = all('SELECT email FROM users WHERE role = ? AND is_admin = 1 AND disabled = 0', 'staff')
  if (!admins.length) return
  staffNotifiedAt = Date.now()
  const url = `${appUrl()}/staff/#/docs`
  for (const a of admins) {
    sendMailSoon({
      to: a.email,
      subject: 'Новый файл от клиента',
      text: `${clientName} прислал(а) файл. Откройте очередь документов: ${url}`,
      html: layout({ title: 'Новый файл от клиента', lines: [`${clientName} прислал(а) файл. Содержимое по почте не отправляется.`], cta: { label: 'Открыть очередь', url } }),
    })
  }
}

app.get('/api/staff/documents', needStaff, (req, res) => {
  const everything = req.query.all === '1'
  res.json(
    all(
      `SELECT d.*, p.name profile_name, p.id pid, p.family_id fid,
         (SELECT u.name FROM grants g JOIN users u ON u.id = g.user_id WHERE g.family_id = p.family_id AND g.access = 'owner' LIMIT 1) owner
       FROM documents d JOIN profiles p ON p.id = d.profile_id
       ${everything ? "WHERE d.file_path IS NOT NULL ORDER BY d.created_at DESC LIMIT 200" : "WHERE d.status IN ('processing', 'requested') ORDER BY d.created_at"}`,
    ).map((d) => ({ id: d.id, familyId: d.fid, profileId: d.pid, profile: d.profile_name, owner: d.owner, type: d.type, title: d.title, date: d.date, status: d.status, fileUrl: d.file_path ? `/api/documents/${d.id}/file` : null, fileName: d.file_name, createdAt: d.created_at })),
  )
})

// Сотрудник вносит показатели из бланка и закрывает документ.
app.post('/api/staff/documents/:id/process', needStaff, (req, res) => {
  const d = get('SELECT d.*, p.family_id fid, p.name pname FROM documents d JOIN profiles p ON p.id = d.profile_id WHERE d.id = ?', req.params.id)
  if (!d) return fail(res, 404, 'not_found')
  if (!consentOk(d.fid)) return fail(res, 423, 'У клиента нет действующего согласия на обработку данных о здоровье')
  const labId = insertLabResult(d.profile_id, { ...req.body, sourceFile: d.file_name || '' })
  if (!labId) return fail(res, 400, 'Проверьте дату, лабораторию и показатели')
  run("UPDATE documents SET status = 'ready', lab_result_id = ?, type = 'analysis' WHERE id = ?", labId, d.id)
  log(d.fid, req.user, d.profile_id, `Внесён анализ из документа «${d.title}»`)
  if (req.body.notify) {
    run('INSERT INTO messages (id, family_id, author_id, author_name, author_kind, text, created_at) VALUES (?,?,?,?,?,?,?)', uuid(), d.fid, req.user.id, req.user.name, 'staff', `Внесла анализ от ${ruDate(req.body.date)} (${str(req.body.labName, 80)}) в досье профиля «${d.pname}». Показатели сверены с бланком.`, nowIso())
  }
  res.json({ id: labId })
})

app.patch('/api/staff/documents/:id', needStaff, (req, res) => {
  const d = get('SELECT * FROM documents WHERE id = ?', req.params.id)
  if (!d) return fail(res, 404, 'not_found')
  const status = ['ready', 'requested', 'processing'].includes(req.body.status) ? req.body.status : d.status
  run('UPDATE documents SET status = ? WHERE id = ?', status, d.id)
  res.json({ ok: true })
})

app.get('/api/features', needUser, (req, res) => res.json({ aiRecognition: aiEnabled() }))

// Распознавание бланка через Claude. Выключено по умолчанию; требует отдельного согласия на каждую отправку.
app.post('/api/recognize', needUser, express.raw({ type: () => true, limit: '25mb' }), async (req, res) => {
  if (!aiEnabled()) return fail(res, 501, 'Распознавание ИИ выключено')
  if (req.get('x-consent-ai') !== '1') return fail(res, 400, 'Нужно согласие на передачу бланка ИИ-сервису')
  const c = ctxProfile(req, res, String(req.query.profileId || ''), 'write')
  if (!c) return
  const mime = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!MIME.has(mime) || mime === 'image/heic') return fail(res, 415, 'Для распознавания подходят JPG, PNG, WebP и PDF')
  if (!Buffer.isBuffer(req.body) || !req.body.length) return fail(res, 400, 'Пустой файл')
  recordConsent(req, { userId: req.user.id, familyId: c.p.family_id, profileId: c.p.id, docId: 'consent_ai', method: 'attestation' })
  log(c.p.family_id, req.user, c.p.id, 'Бланк отправлен на распознавание ИИ-сервису')
  try {
    res.json(await recognizeWithClaude(req.body, mime))
  } catch (e) {
    console.error('recognize:', e.message)
    fail(res, 502, 'Не удалось распознать бланк. Внесите показатели вручную или отправьте бланк помощнику.')
  }
})

mountAccount(app, { needUser, needStaff, fail })
mountConsent(app, { needUser, needStaff, fail, ctxProfile, removeFiles, wipeFamily })
mountCare(app, { needUser, fail, ctxProfile, ctxFamily, familyAccess, tooMany, bump })

// ---------- статика (собранное приложение) ----------
const dist = join(here, '..', 'dist')
if (existsSync(dist)) app.use(express.static(dist, { index: 'index.html', setHeaders: (r, f) => r.setHeader('Cache-Control', f.includes(`${join('dist', 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache') }))

app.use((req, res) => (req.path.startsWith('/api/') ? fail(res, 404, 'not_found') : res.status(404).send('Не найдено')))
app.use((err, req, res, next) => {
  console.error(err)
  if (res.headersSent) return next(err)
  fail(res, 500, 'Ошибка сервера')
})

ensureStaff()
startScheduler()
const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '127.0.0.1'
const server = app.listen(port, host, () => console.log(`Близкие: сервер http://${host}:${port}`))

// Просроченные сессии и коды подтверждения чистим раз в час.
const sweep = setInterval(() => {
  try {
    run('DELETE FROM sessions WHERE expires_at < ?', nowIso())
    run('DELETE FROM otps WHERE expires_at < ?', nowIso())
  } catch (e) {
    console.error('sweep:', e.message)
  }
}, 3600000)
sweep.unref()

function shutdown() {
  console.log('Останавливаюсь…')
  server.close(() => {
    try { db.close() } catch {}
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
