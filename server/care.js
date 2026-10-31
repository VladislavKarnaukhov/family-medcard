// Уход за близким: лекарства, отметки приёма, дневник, визиты, уведомления, экстренная карточка.
// Все маршруты записи идут через ctxProfile/ctxFamily (шлюз согласия). Наружу camelCase, в базе snake_case.
import { all, get, inList, log, nowIso, plusDays, ruDate, run, safeJson, str, token, uuid } from './util.js'
import { recordConsent } from './consent.js'
import { consentOk, isOwner } from './state.js'
import { DEFAULT_TZ, addDays, isDate, isDt, isTime, isoWeekday, medActiveOn, tzNow, validTz } from './timeutil.js'
import { notify } from './notify.js'

const FORMS = ['таблетка', 'капсула', 'капли', 'укол', 'мазь', 'ингаляция', 'другое']
const KINDS = ['food', 'sleep', 'wellbeing', 'walk', 'hygiene', 'fall', 'other']
const MOODS = ['good', 'so_so', 'bad']
const DAY_MS = 86400000
const EDIT_WINDOW = DAY_MS

const famTz = (familyId) => get('SELECT timezone FROM families WHERE id = ?', familyId)?.timezone || DEFAULT_TZ
const withinWindow = (iso) => iso && Date.now() - Date.parse(iso) < EDIT_WINDOW

// Кто пишет: сам человек, сиделка, близкий, владелец или помощник. Выставляет сервер, а не клиент.
export function actorRole(a, profileId) {
  const self = !!a.grant && a.grant.self_profile_id === profileId
  if (self) return { role: 'self', self: 1 }
  if (a.access === 'staff') return { role: 'staff', self: 0 }
  if (a.access === 'owner') return { role: 'owner', self: 0 }
  return { role: /сиделк/i.test(a.grant?.role_label || '') ? 'caregiver' : 'relative', self: 0 }
}

// Лекарства создаёт и меняет владелец, сам человек или близкий с правом добавления; сиделка только отмечает приёмы.
const medEditBlocked = (c, res) =>
  actorRole(c.a, c.p.id).role === 'caregiver' ? (res.status(403).json({ error: 'Лекарства меняет владелец или сам человек. Сиделка отмечает приёмы и пишет в дневник.', code: 'caregiver_readonly_meds' }), true) : false

function medBody(b, tz) {
  const name = str(b.name, 120)
  if (!name) return { error: 'Укажите название лекарства' }
  const times = Array.isArray(b.times) ? [...new Set(b.times.map(String))].sort() : []
  if (times.length > 8 || times.some((t) => !isTime(t))) return { error: 'Время приёма: до 8 значений в формате ЧЧ:ММ' }
  let days = null
  if (Array.isArray(b.days) && b.days.length && b.days.length < 7) {
    days = [...new Set(b.days.map(Number))].filter((d) => d >= 1 && d <= 7).sort()
    if (!days.length) return { error: 'Неверные дни недели' }
  }
  const start = isDate(b.startDate) ? b.startDate : tzNow(tz).date
  const end = b.endDate ? (isDate(b.endDate) ? b.endDate : null) : null
  if (b.endDate && !end) return { error: 'Неверная дата окончания' }
  if (end && end < start) return { error: 'Дата окончания раньше даты начала' }
  return {
    v: { name, form: FORMS.includes(b.form) ? b.form : '', dose: str(b.dose, 120), times: JSON.stringify(times), days: days ? JSON.stringify(days) : null, start, end, prescribedBy: str(b.prescribedBy, 200), note: str(b.note, 500) },
  }
}

export function mountCare(app, { needUser, fail, ctxProfile, ctxFamily, familyAccess, tooMany, bump }) {
  const profileOfMed = (id) => get('SELECT m.*, p.family_id fid FROM medications m JOIN profiles p ON p.id = m.profile_id WHERE m.id = ?', id)

  // ---------- лекарства ----------
  app.post('/api/profiles/:id/medications', needUser, (req, res) => {
    const c = ctxProfile(req, res, req.params.id, 'write')
    if (!c) return
    if (medEditBlocked(c, res)) return
    const r = medBody(req.body, famTz(c.p.family_id))
    if (r.error) return fail(res, 400, r.error)
    const v = r.v
    const id = uuid()
    run("INSERT INTO medications (id, profile_id, name, form, dose, times, days, start_date, end_date, prescribed_by, note, status, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',?,?)", id, c.p.id, v.name, v.form, v.dose, v.times, v.days, v.start, v.end, v.prescribedBy, v.note, nowIso(), req.user.id)
    log(c.p.family_id, req.user, c.p.id, `Добавлено лекарство: ${v.name}`)
    res.json({ id })
  })

  app.put('/api/medications/:id', needUser, (req, res) => {
    const m = profileOfMed(req.params.id)
    if (!m) return fail(res, 404, 'not_found')
    const c = ctxProfile(req, res, m.profile_id, 'write')
    if (!c) return
    if (medEditBlocked(c, res)) return
    if (req.body.status === 'stopped' || req.body.status === 'active') {
      if (req.body.status === 'stopped') run("UPDATE medications SET status = 'stopped', stopped_at = ? WHERE id = ?", nowIso(), m.id)
      else run("UPDATE medications SET status = 'active', stopped_at = NULL WHERE id = ?", m.id)
      log(m.fid, req.user, m.profile_id, req.body.status === 'stopped' ? `Лекарство отменено: ${m.name}` : `Лекарство возобновлено: ${m.name}`)
      if (req.body.name === undefined) return res.json({ ok: true })
    }
    const r = medBody(req.body, famTz(m.fid))
    if (r.error) return fail(res, 400, r.error)
    const v = r.v
    run('UPDATE medications SET name = ?, form = ?, dose = ?, times = ?, days = ?, start_date = ?, end_date = ?, prescribed_by = ?, note = ? WHERE id = ?', v.name, v.form, v.dose, v.times, v.days, v.start, v.end, v.prescribedBy, v.note, m.id)
    log(m.fid, req.user, m.profile_id, `Изменено лекарство: ${v.name}`)
    res.json({ ok: true })
  })

  app.delete('/api/medications/:id', needUser, (req, res) => {
    const m = profileOfMed(req.params.id)
    if (!m) return fail(res, 404, 'not_found')
    const c = ctxProfile(req, res, m.profile_id, 'owner')
    if (!c) return
    run('DELETE FROM medications WHERE id = ?', m.id)
    log(m.fid, req.user, m.profile_id, `Удалено лекарство: ${m.name}`)
    res.json({ ok: true })
  })

  // ---------- отметки приёма ----------
  const intakeView = (i) => ({ id: i.id, medicationId: i.medication_id, profileId: i.profile_id, scheduledAt: i.scheduled_at, status: i.status, reason: i.reason, by: i.marked_by_name, bySelf: !!i.marked_by_self, markedAt: i.marked_at })

  app.post('/api/medications/:id/intakes', needUser, (req, res) => {
    const m = profileOfMed(req.params.id)
    if (!m) return fail(res, 404, 'not_found')
    const c = ctxProfile(req, res, m.profile_id, 'write')
    if (!c) return
    const status = req.body.status
    if (!['taken', 'skipped'].includes(status)) return fail(res, 400, 'Неверный статус')
    const tz = famTz(m.fid)
    const local = tzNow(tz)
    const times = safeJson(m.times) || []
    let at = null
    if (times.length === 0) {
      if (status !== 'taken') return fail(res, 400, 'Для лекарства «по необходимости» можно отметить только приём')
      at = local.dt
    } else {
      at = str(req.body.scheduledAt, 16)
      if (!isDt(at) || !times.includes(at.slice(11)) || !medActiveOn(m, at.slice(0, 10)) || at.slice(0, 10) > local.date || at.slice(0, 10) < addDays(local.date, -1)) return fail(res, 400, 'Такого приёма нет в расписании')
    }
    const who = actorRole(c.a, m.profile_id)
    const ex = get('SELECT * FROM intakes WHERE medication_id = ? AND scheduled_at = ?', m.id, at)
    if (ex && ex.status !== 'unmarked' && !withinWindow(ex.marked_at) && !isOwner(c.a)) return fail(res, 409, 'Отметку можно исправить в течение 24 часов')
    const reason = str(req.body.reason, 200)
    let id
    if (ex) {
      id = ex.id
      run('UPDATE intakes SET status = ?, reason = ?, marked_by_id = ?, marked_by_name = ?, marked_by_self = ?, marked_at = ? WHERE id = ?', status, reason, req.user.id, req.user.name, who.self, nowIso(), id)
      if (ex.status !== 'unmarked') log(m.fid, req.user, m.profile_id, `Исправлена отметка приёма: ${m.name}`)
    } else {
      id = uuid()
      run('INSERT INTO intakes (id, medication_id, profile_id, scheduled_at, status, reason, marked_by_id, marked_by_name, marked_by_self, marked_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, m.id, m.profile_id, at, status, reason, req.user.id, req.user.name, who.self, nowIso())
    }
    res.json(intakeView(get('SELECT * FROM intakes WHERE id = ?', id)))
  })

  app.put('/api/intakes/:id', needUser, (req, res) => {
    const i = get('SELECT i.*, p.family_id fid, m.name mname FROM intakes i JOIN medications m ON m.id = i.medication_id JOIN profiles p ON p.id = i.profile_id WHERE i.id = ?', req.params.id)
    if (!i) return fail(res, 404, 'not_found')
    const c = ctxProfile(req, res, i.profile_id, 'write')
    if (!c) return
    if (!['taken', 'skipped'].includes(req.body.status)) return fail(res, 400, 'Неверный статус')
    if (i.status !== 'unmarked' && !withinWindow(i.marked_at) && !isOwner(c.a)) return fail(res, 409, 'Отметку можно исправить в течение 24 часов')
    const who = actorRole(c.a, i.profile_id)
    run('UPDATE intakes SET status = ?, reason = ?, marked_by_id = ?, marked_by_name = ?, marked_by_self = ?, marked_at = ? WHERE id = ?', req.body.status, str(req.body.reason, 200), req.user.id, req.user.name, who.self, nowIso(), i.id)
    log(i.fid, req.user, i.profile_id, `Исправлена отметка приёма: ${i.mname}`)
    res.json({ ok: true })
  })

  // ---------- дневник ----------
  app.post('/api/profiles/:id/care-notes', needUser, (req, res) => {
    const c = ctxProfile(req, res, req.params.id, 'write')
    if (!c) return
    const kind = KINDS.includes(req.body.kind) ? req.body.kind : null
    if (!kind) return fail(res, 400, 'Выберите тип записи')
    const text = str(req.body.text, 1000)
    const mood = MOODS.includes(req.body.mood) ? req.body.mood : null
    if (!text && !mood) return fail(res, 400, 'Напишите, что произошло')
    const tz = famTz(c.p.family_id)
    const at = isDt(req.body.at) ? req.body.at : tzNow(tz).dt
    const needs = kind === 'fall' ? (['yes', 'no', 'unknown'].includes(req.body.needsDoctor) ? req.body.needsDoctor : 'unknown') : null
    const who = actorRole(c.a, c.p.id)
    const id = uuid()
    run('INSERT INTO care_notes (id, profile_id, at, kind, text, mood, needs_doctor, author_id, author_name, author_role, by_self, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', id, c.p.id, at, kind, text, mood, needs, req.user.id, req.user.name, who.role, who.self, nowIso())
    if (kind === 'fall') {
      notify({ familyId: c.p.family_id, profileId: c.p.id, kind: 'fall', title: `Запись о падении (${c.p.name})`, link: '#/today', refId: id })
      log(c.p.family_id, req.user, c.p.id, 'Запись в дневнике: падение')
    } else if (who.self && mood === 'bad' && c.p.notify_bad_mood) {
      const owners = all("SELECT user_id FROM grants WHERE family_id = ? AND access = 'owner'", c.p.family_id).map((g) => g.user_id)
      notify({ familyId: c.p.family_id, profileId: c.p.id, kind: 'wellbeing_bad', title: `Самочувствие: «Плохо» (${c.p.name})`, link: '#/today', refId: id, userIds: owners })
    }
    res.json({ id })
  })

  const noteCtx = (req, res) => {
    const n = get('SELECT n.*, p.family_id fid FROM care_notes n JOIN profiles p ON p.id = n.profile_id WHERE n.id = ?', req.params.id)
    if (!n) return fail(res, 404, 'not_found'), null
    const c = ctxProfile(req, res, n.profile_id, 'write')
    if (!c) return null
    const mine = n.author_id === req.user.id && withinWindow(n.created_at)
    if (!mine && !isOwner(c.a)) return fail(res, 403, 'Запись может изменить автор в течение 24 часов или владелец'), null
    return { n, c }
  }

  app.put('/api/care-notes/:id', needUser, (req, res) => {
    const x = noteCtx(req, res)
    if (!x) return
    const text = str(req.body.text, 1000)
    const mood = MOODS.includes(req.body.mood) ? req.body.mood : x.n.mood
    if (!text && !mood) return fail(res, 400, 'Напишите, что произошло')
    const needs = x.n.kind === 'fall' ? (['yes', 'no', 'unknown'].includes(req.body.needsDoctor) ? req.body.needsDoctor : x.n.needs_doctor) : null
    run('UPDATE care_notes SET text = ?, mood = ?, needs_doctor = ?, updated_at = ? WHERE id = ?', text, mood, needs, nowIso(), x.n.id)
    log(x.n.fid, req.user, x.n.profile_id, 'Исправлена запись дневника')
    res.json({ ok: true })
  })

  app.delete('/api/care-notes/:id', needUser, (req, res) => {
    const x = noteCtx(req, res)
    if (!x) return
    run('DELETE FROM care_notes WHERE id = ?', x.n.id)
    log(x.n.fid, req.user, x.n.profile_id, 'Удалена запись дневника')
    res.json({ ok: true })
  })

  // ---------- визиты ----------
  const apptBody = (b) => {
    const at = str(b.at, 16)
    const specialist = str(b.specialist, 160)
    if (!isDt(at)) return { error: 'Укажите дату и время визита' }
    if (!specialist) return { error: 'Укажите врача или клинику' }
    return { v: { at, specialist, address: str(b.address, 300), purpose: str(b.purpose, 500), companion: str(b.companion, 160), bring: str(b.bring, 500) } }
  }

  app.post('/api/profiles/:id/appointments', needUser, (req, res) => {
    const c = ctxProfile(req, res, req.params.id, 'write')
    if (!c) return
    const r = apptBody(req.body)
    if (r.error) return fail(res, 400, r.error)
    const v = r.v
    const id = uuid()
    run("INSERT INTO appointments (id, profile_id, at, specialist, address, purpose, companion, bring, status, created_at) VALUES (?,?,?,?,?,?,?,?,'planned',?)", id, c.p.id, v.at, v.specialist, v.address, v.purpose, v.companion, v.bring, nowIso())
    log(c.p.family_id, req.user, c.p.id, `Добавлен визит: ${v.specialist}`)
    res.json({ id })
  })

  const apptCtx = (req, res, need) => {
    const a = get('SELECT a.*, p.family_id fid, p.name pname FROM appointments a JOIN profiles p ON p.id = a.profile_id WHERE a.id = ?', req.params.id)
    if (!a) return fail(res, 404, 'not_found'), null
    const c = ctxProfile(req, res, a.profile_id, need)
    return c ? { a, c } : null
  }

  app.put('/api/appointments/:id', needUser, (req, res) => {
    const x = apptCtx(req, res, 'write')
    if (!x) return
    const r = apptBody({ ...{ at: x.a.at, specialist: x.a.specialist, address: x.a.address, purpose: x.a.purpose, companion: x.a.companion, bring: x.a.bring }, ...req.body })
    if (r.error) return fail(res, 400, r.error)
    const v = r.v
    const status = ['planned', 'done', 'cancelled'].includes(req.body.status) ? req.body.status : x.a.status
    const docIds = Array.isArray(req.body.documentIds) ? req.body.documentIds.map(String).filter((d) => get('SELECT 1 FROM documents WHERE id = ? AND profile_id = ?', d, x.a.profile_id)) : safeJson(x.a.document_ids) || []
    const moved = v.at !== x.a.at
    run('UPDATE appointments SET at = ?, specialist = ?, address = ?, purpose = ?, companion = ?, bring = ?, status = ?, result_note = ?, document_ids = ?, reminded_at = ? WHERE id = ?', v.at, v.specialist, v.address, v.purpose, v.companion, v.bring, status, req.body.resultNote !== undefined ? str(req.body.resultNote, 1000) : x.a.result_note, JSON.stringify(docIds), moved ? null : x.a.reminded_at, x.a.id)
    log(x.a.fid, req.user, x.a.profile_id, `Изменён визит: ${v.specialist}`)
    res.json({ ok: true })
  })

  app.delete('/api/appointments/:id', needUser, (req, res) => {
    const x = apptCtx(req, res, 'owner')
    if (!x) return
    run('DELETE FROM appointments WHERE id = ?', x.a.id)
    log(x.a.fid, req.user, x.a.profile_id, `Удалён визит: ${x.a.specialist}`)
    res.json({ ok: true })
  })

  // Поручение помощнику: тот же механизм, что у обычных поручений.
  app.post('/api/appointments/:id/request', needUser, (req, res) => {
    const x = apptCtx(req, res, 'owner')
    if (!x) return
    if (x.a.request_id && get('SELECT 1 FROM requests WHERE id = ?', x.a.request_id)) return fail(res, 409, 'Поручение по этому визиту уже создано')
    const f = get('SELECT staff_id FROM families WHERE id = ?', x.a.fid)
    const title = `Подготовить визит: ${x.a.specialist}, ${ruDate(x.a.at)}`
    const rid = uuid()
    run('INSERT INTO requests (id, family_id, profile_id, title, assignee_id, due, created_at, created_by) VALUES (?,?,?,?,?,?,?,?)', rid, x.a.fid, x.a.profile_id, title, f?.staff_id || null, plusDays(1), nowIso(), req.user.id)
    run('INSERT INTO messages (id, family_id, author_id, author_name, author_kind, text, created_at) VALUES (?,?,?,?,?,?,?)', uuid(), x.a.fid, req.user.id, req.user.name, 'client', `${title} — ${x.a.pname}. Визит: #/visits/${x.a.profile_id}/${x.a.id}`, nowIso())
    run('UPDATE appointments SET request_id = ? WHERE id = ?', rid, x.a.id)
    res.json({ id: rid })
  })

  // ---------- уведомления и настройки ----------
  app.get('/api/notifications', needUser, (req, res) => {
    res.json(all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', req.user.id).map(notifView))
  })

  app.post('/api/notifications/read', needUser, (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : null
    if (ids) run(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN ${inList(ids)}`, nowIso(), req.user.id, ...ids)
    else run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', nowIso(), req.user.id)
    res.json({ ok: true })
  })

  app.put('/api/me/email-events', needUser, (req, res) => {
    const events = ['instant', 'daily', 'off'].includes(req.body.events) ? req.body.events : null
    if (!events) return fail(res, 400, 'Неверная настройка')
    run('UPDATE users SET email_events = ?, email_intake = ? WHERE id = ?', events, req.body.intake ? 1 : 0, req.user.id)
    res.json({ ok: true })
  })

  app.put('/api/me/simple-mode', needUser, (req, res) => {
    run('UPDATE users SET simple_mode = ? WHERE id = ?', req.body.on ? 1 : 0, req.user.id)
    res.json({ ok: true })
  })

  // Отметка «Плохо» может уведомлять владельца. Решает сам человек, а если у профиля нет входа, то владелец.
  app.put('/api/profiles/:id/notify-bad-mood', needUser, (req, res) => {
    const c = ctxProfile(req, res, req.params.id, 'write')
    if (!c) return
    const self = c.a.grant?.self_profile_id === c.p.id
    const hasSelf = !!get('SELECT 1 FROM grants WHERE self_profile_id = ?', c.p.id)
    if (!self && !(isOwner(c.a) && !hasSelf)) return fail(res, 403, 'Это решает сам человек')
    run('UPDATE profiles SET notify_bad_mood = ? WHERE id = ?', req.body.on ? 1 : 0, c.p.id)
    res.json({ ok: true })
  })

  // Показ своих результатов другим участникам общей карты. Решает сам человек; владелец решает только за свой профиль «Это мои данные».
  app.put('/api/profiles/:id/share-peers', needUser, (req, res) => {
    const c = ctxProfile(req, res, req.params.id, 'write')
    if (!c) return
    const self = c.a.grant?.self_profile_id === c.p.id
    const ownerOwn = isOwner(c.a) && c.p.basis === 'self'
    if (!self && !ownerOwn) return fail(res, 403, 'Это решает сам человек')
    if (req.body.on) {
      if (req.body.consentConfirmed !== true) return fail(res, 400, 'Подтвердите согласие')
      if (c.p.consent_status === 'attested') return fail(res, 400, 'Сначала нужно подтвердить согласие на обработку данных')
      recordConsent(req, { userId: req.user.id, familyId: c.p.family_id, profileId: c.p.id, docId: 'consent_peers', method: 'attestation' })
    }
    run('UPDATE profiles SET share_peers = ? WHERE id = ?', req.body.on ? 1 : 0, c.p.id)
    log(c.p.family_id, req.user, c.p.id, req.body.on ? 'Включён показ результатов участникам общей карты' : 'Выключен показ результатов участникам общей карты')
    res.json({ ok: true })
  })

  app.put('/api/families/:fid/timezone', needUser, (req, res) => {
    if (!ctxFamily(req, res, 'owner')) return
    const tz = str(req.body.timezone, 60)
    if (!validTz(tz)) return fail(res, 400, 'Неверный часовой пояс')
    run('UPDATE families SET timezone = ? WHERE id = ?', tz, req.params.fid)
    res.json({ ok: true })
  })

  // ---------- экстренная карточка ----------
  app.post('/api/profiles/:id/emergency', needUser, (req, res) => {
    const c = ctxProfile(req, res, req.params.id, 'owner')
    if (!c) return
    if (req.body.consentConfirmed !== true) return fail(res, 400, 'Подтвердите согласие на открытие карточки')
    const contacts = safeJson(c.p.emergency_contacts) || []
    if (contacts.length && req.body.contactsConfirmed !== true) return fail(res, 400, 'Подтвердите, что люди из карточки согласны на указание их телефона')
    recordConsent(req, { userId: req.user.id, familyId: c.p.family_id, profileId: c.p.id, docId: 'consent_emergency', method: 'attestation' })
    run('UPDATE emergency_links SET revoked_at = ? WHERE profile_id = ? AND revoked_at IS NULL', nowIso(), c.p.id)
    const t = token(24)
    run('INSERT INTO emergency_links (token, profile_id, family_id, created_at) VALUES (?,?,?,?)', t, c.p.id, c.p.family_id, nowIso())
    log(c.p.family_id, req.user, c.p.id, 'Создана экстренная карточка')
    res.json({ token: t })
  })

  app.delete('/api/profiles/:id/emergency', needUser, (req, res) => {
    const c = ctxProfile(req, res, req.params.id, 'owner')
    if (!c) return
    run('UPDATE emergency_links SET revoked_at = ? WHERE profile_id = ? AND revoked_at IS NULL', nowIso(), c.p.id)
    log(c.p.family_id, req.user, c.p.id, 'Отозвана экстренная карточка')
    res.json({ ok: true })
  })

  // Публичная страница: ответ собирается здесь отдельно, чтобы ничего лишнего не могло попасть наружу.
  app.get('/api/emergency/:token', (req, res) => {
    const key = `sos:${req.ip}`
    if (tooMany(key)) return fail(res, 429, 'Слишком много запросов')
    const l = get('SELECT * FROM emergency_links WHERE token = ?', req.params.token)
    if (!l || l.revoked_at || !consentOk(l.family_id)) {
      bump(key, false)
      return fail(res, 410, 'Ссылка недействительна или отозвана')
    }
    const p = get('SELECT * FROM profiles WHERE id = ?', l.profile_id)
    const today = tzNow(famTz(l.family_id)).date
    const meds = all("SELECT * FROM medications WHERE profile_id = ? AND status = 'active'", p.id).filter((m) => medActiveOn(m, today) || m.start_date > today)
    log(l.family_id, null, p.id, 'Открыта экстренная карточка', 'Экстренная карточка (по ссылке)')
    res.json({
      name: p.name,
      birthYear: p.birth_year,
      allergies: p.allergies,
      conditions: p.notes,
      medications: meds.map((m) => ({ name: m.name, dose: m.dose, times: safeJson(m.times) || [] })),
      contacts: (safeJson(p.emergency_contacts) || []).slice(0, 3).map((c) => ({ name: c.name, relation: c.relation, phone: c.phone })),
    })
  })
}

export const notifView = (n) => ({ id: n.id, kind: n.kind, title: n.title, link: n.link, profileId: n.profile_id, at: n.created_at, read: !!n.read_at })

// Состояние ухода для buildState. share = ссылка для врача: только лекарства и аллергии.
export function careState(profiles, a, family) {
  const pids = profiles.map((p) => p.id)
  const inP = inList(pids)
  const share = a.access === 'share'
  const tz = family.timezone || DEFAULT_TZ
  const local = tzNow(tz)
  const since = addDays(local.date, -30)
  const meds = all(`SELECT * FROM medications WHERE profile_id IN ${inP} ORDER BY created_at`, ...pids)
  const out = {
    medications: meds
      .filter((m) => !share || m.status === 'active')
      .map((m) => ({ id: m.id, profileId: m.profile_id, name: m.name, form: m.form, dose: m.dose, times: safeJson(m.times) || [], days: safeJson(m.days), startDate: m.start_date, endDate: m.end_date, prescribedBy: m.prescribed_by, note: m.note, status: m.status, stoppedAt: m.stopped_at })),
    intakes: [],
    careNotes: [],
    appointments: [],
  }
  if (share) return out
  out.intakes = all(`SELECT * FROM intakes WHERE profile_id IN ${inP} AND (scheduled_at >= ? OR marked_at >= ?) ORDER BY scheduled_at`, ...pids, since, `${since}T00:00`).map((i) => ({ id: i.id, medicationId: i.medication_id, profileId: i.profile_id, scheduledAt: i.scheduled_at, status: i.status, reason: i.reason, by: i.marked_by_name, bySelf: !!i.marked_by_self, markedAt: i.marked_at }))
  const sexOf = Object.fromEntries(profiles.map((p) => [p.id, p.sex]))
  const labels = Object.fromEntries(all('SELECT user_id, role_label FROM grants WHERE family_id = ?', family.id).map((g) => [g.user_id, g.role_label]))
  out.careNotes = all(`SELECT * FROM care_notes WHERE profile_id IN ${inP} AND at >= ? ORDER BY at DESC`, ...pids, `${since}T00:00`).map((n) => ({
    id: n.id,
    profileId: n.profile_id,
    at: n.at,
    kind: n.kind,
    text: n.text,
    mood: n.mood,
    needsDoctor: n.needs_doctor,
    author: n.author_name,
    authorId: n.author_id,
    role: n.author_role,
    roleLabel: n.author_role === 'self' ? (sexOf[n.profile_id] === 'm' ? 'сам' : 'сама') : n.author_role === 'staff' ? 'помощник' : n.author_role === 'caregiver' ? 'сиделка' : (labels[n.author_id] || 'близкий').toLowerCase(),
    bySelf: !!n.by_self,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  }))
  out.appointments = all(`SELECT * FROM appointments WHERE profile_id IN ${inP} AND at >= ? ORDER BY at`, ...pids, `${addDays(local.date, -90)}T00:00`).map((x) => ({ id: x.id, profileId: x.profile_id, at: x.at, specialist: x.specialist, address: x.address, purpose: x.purpose, companion: x.companion, bring: x.bring, status: x.status, resultNote: x.result_note, documentIds: safeJson(x.document_ids) || [], requestId: x.request_id }))
  return out
}
