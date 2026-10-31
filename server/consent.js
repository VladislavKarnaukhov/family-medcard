// Согласия, подпись одноразовым кодом, запросы субъектов, выгрузка и удаление данных.
import { unlinkSync } from 'node:fs'
import { createHash, randomInt } from 'node:crypto'
import { join } from 'node:path'
import { DATA_DIR, UPLOAD_DIR, tx } from './db.js'
import { DOCS, plainText } from '../src/legal/docs.js'
import { all, track, checkPassword, get, log, nowIso, plusDays, run, str, token, uuid } from './util.js'
import { buildState, consentOk } from './state.js'
import { isProd, layout, mailEnabled, sendMail } from './mailer.js'

const sha = (s) => createHash('sha256').update(s).digest('hex')
export const docHash = (id) => sha(plainText(DOCS[id]))

export function recordConsent(req, { userId, familyId = null, profileId = null, docId, method, subjectName = null, subjectContact = null }) {
  const d = DOCS[docId]
  if (!d) throw new Error('unknown doc ' + docId)
  const id = uuid()
  run(
    'INSERT INTO consents (id, user_id, family_id, profile_id, doc_id, doc_version, text_hash, method, subject_name, subject_contact, given_at, ip, ua) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id,
    userId,
    familyId,
    profileId,
    docId,
    d.version,
    docHash(docId),
    method,
    subjectName,
    subjectContact,
    nowIso(),
    req.ip || null,
    str(req.get('user-agent') || '', 300),
  )
  return id
}

// Код подтверждения уходит письмом. Пока SMTP не настроен и это не production, код возвращается в ответе,
// чтобы можно было проверить поток без почты.
async function startOtp(scope, target, res) {
  const last = get('SELECT created_at FROM otps WHERE scope = ? ORDER BY created_at DESC LIMIT 1', scope)
  if (last && Date.now() - Date.parse(last.created_at) < 20000) return res.status(429).json({ error: 'Код уже отправлен, подождите немного' })
  const code = String(randomInt(0, 1000000)).padStart(6, '0')
  let mail
  try {
    mail = await sendMail({
      to: target,
      subject: 'Код подтверждения',
      text: `Ваш код: ${code}. Он действует 10 минут. Если вы его не запрашивали, проигнорируйте письмо.`,
      html: layout({ title: 'Код подтверждения', lines: [`Ваш код: ${code}`, 'Он действует 10 минут. Никому его не сообщайте.', 'Если вы его не запрашивали, проигнорируйте письмо.'] }),
    })
  } catch (e) {
    console.error('mail:', e.message)
    return res.status(502).json({ error: 'Не удалось отправить письмо. Проверьте адрес и попробуйте позже.' })
  }
  run('DELETE FROM otps WHERE scope = ?', scope)
  run('INSERT INTO otps (id, scope, target, code_hash, expires_at, created_at) VALUES (?,?,?,?,?,?)', uuid(), scope, target, sha(`${scope}|${code}`), new Date(Date.now() + 10 * 60000).toISOString(), nowIso())
  const dev = !mail.sent && !isProd() && !mailEnabled()
  return res.json({ sent: true, to: target, ...(dev ? { devCode: code } : {}) })
}

function checkOtp(scope, code) {
  const o = get('SELECT * FROM otps WHERE scope = ?', scope)
  if (!o || o.expires_at < nowIso()) return 'Код истёк. Запросите новый.'
  if (o.attempts >= 5) return 'Слишком много попыток. Запросите новый код.'
  if (o.code_hash !== sha(`${scope}|${String(code || '').trim()}`)) {
    run('UPDATE otps SET attempts = attempts + 1 WHERE id = ?', o.id)
    return 'Неверный код'
  }
  run('DELETE FROM otps WHERE id = ?', o.id)
  return null
}

const ownerFamily = (userId) => get("SELECT g.family_id id FROM grants g WHERE g.user_id = ? AND g.access = 'owner' ORDER BY g.created_at LIMIT 1", userId)

export function mountConsent(app, { needUser, needStaff, fail, ctxProfile, removeFiles, wipeFamily }) {
  // --- реестр согласий пользователя
  app.get('/api/consents', needUser, (req, res) => {
    const own = all('SELECT * FROM consents WHERE user_id = ? ORDER BY given_at DESC', req.user.id)
    const fam = all("SELECT g.family_id FROM grants g WHERE g.user_id = ? AND g.access = 'owner'", req.user.id).map((g) => g.family_id)
    const others = fam.length
      ? all(`SELECT * FROM consents WHERE family_id IN (${fam.map(() => '?').join(',')}) AND (user_id IS NULL OR user_id != ?) ORDER BY given_at DESC`, ...fam, req.user.id)
      : []
    const names = Object.fromEntries(all(`SELECT id, name FROM profiles WHERE family_id IN (${fam.map(() => '?').join(',') || 'NULL'})`, ...fam).map((p) => [p.id, p.name]))
    const map = (c) => ({ id: c.id, docId: c.doc_id, version: c.doc_version, method: c.method, givenAt: c.given_at, revokedAt: c.revoked_at, profile: names[c.profile_id] || null, subject: c.subject_name })
    res.json({ own: own.map(map), about: [...own.filter((c) => c.profile_id), ...others].map(map).filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i) })
  })

  // --- подпись согласия на данные о здоровье одноразовым кодом (простая электронная подпись)
  app.post('/api/consents/health/start', needUser, async (req, res) => {
    const f = ownerFamily(req.user.id)
    if (!f) return fail(res, 403, 'Только владелец семьи подписывает это согласие')
    return startOtp(`health:${req.user.id}`, req.user.email, res)
  })

  app.post('/api/consents/health/sign', needUser, (req, res) => {
    const f = ownerFamily(req.user.id)
    if (!f) return fail(res, 403, 'Только владелец семьи подписывает это согласие')
    if (req.body.agree !== true) return fail(res, 400, 'Подтвердите согласие')
    const err = checkOtp(`health:${req.user.id}`, req.body.code)
    if (err) return fail(res, 400, err)
    tx(() => {
      recordConsent(req, { userId: req.user.id, familyId: f.id, docId: 'consent_health', method: 'otp', subjectName: req.user.name, subjectContact: req.user.email })
      run('UPDATE families SET processing_stopped = 0, delete_after = NULL WHERE id = ?', f.id)
      run('UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL', nowIso(), req.user.id)
      log(f.id, req.user, null, 'Подписано согласие на обработку данных о здоровье')
      track('consent_health', { userId: req.user.id, familyId: f.id, role: 'owner' })
    })
    res.json({ ok: true })
  })

  // --- отзыв согласия на данные о здоровье: обработка останавливается, удаление в течение 30 дней
  app.post('/api/consents/health/revoke', needUser, (req, res) => {
    const f = ownerFamily(req.user.id)
    if (!f) return fail(res, 403, 'Только владелец семьи может отозвать это согласие')
    tx(() => {
      run("UPDATE consents SET revoked_at = ? WHERE user_id = ? AND doc_id = 'consent_health' AND revoked_at IS NULL", nowIso(), req.user.id)
      run('UPDATE families SET processing_stopped = 1, delete_after = ? WHERE id = ?', new Date(Date.now() + 30 * 86400000).toISOString(), f.id)
      log(f.id, req.user, null, 'Отозвано согласие на обработку данных о здоровье')
    })
    res.json({ ok: true })
  })

  // --- согласие человека, чьи данные внёс другой пользователь
  app.post('/api/profiles/:id/subject-link', needUser, (req, res) => {
    const c = ctxProfile(req, res, req.params.id, 'owner')
    if (!c) return
    if (c.p.basis !== 'adult') return fail(res, 400, 'Ссылка нужна только для взрослого члена семьи')
    const t = token(18)
    run('INSERT INTO subject_links (token, profile_id, family_id, expires_at) VALUES (?,?,?,?)', t, c.p.id, c.p.family_id, new Date(Date.now() + 14 * 86400000).toISOString())
    log(c.p.family_id, req.user, c.p.id, 'Создана ссылка для подтверждения согласия самим человеком')
    res.json({ token: t })
  })

  const subjectLink = (req, res) => {
    const l = get('SELECT l.*, p.name pname, (SELECT u.name FROM grants g JOIN users u ON u.id = g.user_id WHERE g.family_id = l.family_id AND g.access = \'owner\' LIMIT 1) owner FROM subject_links l JOIN profiles p ON p.id = l.profile_id WHERE l.token = ?', req.params.token)
    if (!l || l.used_at || l.expires_at < nowIso()) return fail(res, 410, 'Ссылка недействительна или уже использована'), null
    return l
  }

  app.get('/api/subject-consent/:token', (req, res) => {
    const l = subjectLink(req, res)
    if (l) res.json({ owner: l.owner, profile: l.pname })
  })

  app.post('/api/subject-consent/:token/start', async (req, res) => {
    const l = subjectLink(req, res)
    if (!l) return
    const email = str(req.body.email, 200).toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || str(req.body.name, 120).length < 5) return fail(res, 400, 'Укажите полное имя и адрес электронной почты')
    return startOtp(`subject:${req.params.token}`, email, res)
  })

  app.post('/api/subject-consent/:token/sign', (req, res) => {
    const l = subjectLink(req, res)
    if (!l) return
    const name = str(req.body.name, 120)
    const email = str(req.body.email, 200).toLowerCase()
    if (req.body.agree !== true) return fail(res, 400, 'Подтвердите согласие')
    const o = get('SELECT target FROM otps WHERE scope = ?', `subject:${req.params.token}`)
    if (!o || o.target !== email) return fail(res, 400, 'Сначала запросите код на этот адрес')
    const err = checkOtp(`subject:${req.params.token}`, req.body.code)
    if (err) return fail(res, 400, err)
    tx(() => {
      recordConsent(req, { userId: null, familyId: l.family_id, profileId: l.profile_id, docId: 'consent_subject', method: 'otp', subjectName: name, subjectContact: email })
      run("UPDATE profiles SET consent_status = 'confirmed' WHERE id = ?", l.profile_id)
      run('UPDATE subject_links SET used_at = ? WHERE token = ?', nowIso(), l.token)
      log(l.family_id, null, l.profile_id, 'Человек подтвердил своё согласие по ссылке', name)
    })
    res.json({ ok: true })
  })

  // --- пользователь «Сам(а)» подтверждает своё согласие кодом на свою почту в одном потоке с принятием приглашения
  const selfProfile = (req, res) => {
    const g = get('SELECT * FROM grants WHERE user_id = ? AND self_profile_id = ?', req.user.id, req.params.id)
    if (!g) return fail(res, 403, 'forbidden'), null
    return g
  }
  app.post('/api/profiles/:id/self-consent/start', needUser, async (req, res) => {
    if (!selfProfile(req, res)) return
    return startOtp(`self:${req.user.id}:${req.params.id}`, req.user.email, res)
  })
  app.post('/api/profiles/:id/self-consent/sign', needUser, (req, res) => {
    const g = selfProfile(req, res)
    if (!g) return
    if (req.body.agree !== true) return fail(res, 400, 'Подтвердите согласие')
    const err = checkOtp(`self:${req.user.id}:${req.params.id}`, req.body.code)
    if (err) return fail(res, 400, err)
    tx(() => {
      recordConsent(req, { userId: req.user.id, familyId: g.family_id, profileId: req.params.id, docId: 'consent_subject', method: 'otp', subjectName: req.user.name, subjectContact: req.user.email })
      run("UPDATE profiles SET consent_status = 'confirmed' WHERE id = ?", req.params.id)
      run('UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL', nowIso(), req.user.id)
      log(g.family_id, req.user, req.params.id, 'Человек подтвердил своё согласие при входе')
    })
    res.json({ ok: true })
  })

  // --- запросы субъектов данных (ст. 14, 20, 21 152-ФЗ): срок ответа 10 рабочих дней, берём 14 календарных
  const hits = new Map()
  app.post('/api/data-requests', (req, res) => {
    const key = req.ip
    const h = (hits.get(key) || []).filter((t) => Date.now() - t < 3600000)
    if (h.length >= 5) return fail(res, 429, 'Слишком много обращений. Попробуйте позже.')
    hits.set(key, [...h, Date.now()])
    const type = ['access', 'correction', 'deletion', 'revoke', 'other'].includes(req.body.type) ? req.body.type : 'other'
    const name = req.user ? req.user.name : str(req.body.name, 120)
    const email = req.user ? req.user.email : str(req.body.email, 200)
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'Укажите имя и адрес электронной почты для ответа')
    run('INSERT INTO data_requests (id, user_id, name, email, type, text, created_at, due_at) VALUES (?,?,?,?,?,?,?,?)', uuid(), req.user?.id || null, name, email, type, str(req.body.text, 2000), nowIso(), new Date(Date.now() + 14 * 86400000).toISOString())
    res.json({ ok: true })
  })

  app.get('/api/staff/data-requests', needStaff, (req, res) => {
    res.json(all("SELECT * FROM data_requests ORDER BY CASE status WHEN 'new' THEN 0 ELSE 1 END, due_at").map((r) => ({ id: r.id, name: r.name, email: r.email, type: r.type, text: r.text, status: r.status, createdAt: r.created_at, dueAt: r.due_at, resolvedAt: r.resolved_at })))
  })

  app.patch('/api/staff/data-requests/:id', needStaff, (req, res) => {
    run("UPDATE data_requests SET status = 'done', resolved_at = ? WHERE id = ?", nowIso(), req.params.id)
    res.json({ ok: true })
  })

  // --- выгрузка данных
  app.get('/api/families/:fid/export', needUser, (req, res) => {
    const g = get("SELECT 1 FROM grants WHERE family_id = ? AND user_id = ? AND access = 'owner'", req.params.fid, req.user.id)
    if (!g) return fail(res, 404, 'not_found')
    const data = buildState(req.params.fid, { access: 'owner', profileIds: null })
    const consents = all('SELECT doc_id, doc_version, method, subject_name, given_at, revoked_at, profile_id FROM consents WHERE family_id = ? OR user_id = ?', req.params.fid, req.user.id)
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''blizkie-export.json")
    res.json({ exportedAt: nowIso(), data, consents, note: 'Файлы документов скачиваются отдельно по ссылкам fileUrl, пока вы вошли в аккаунт.' })
  })

  // --- удаление учётной записи и данных
  app.delete('/api/me/account', needUser, (req, res) => {
    if (req.user.role === 'staff') return fail(res, 403, 'forbidden')
    const u = get('SELECT password FROM users WHERE id = ?', req.user.id)
    if (!checkPassword(String(req.body.password || ''), u.password)) return fail(res, 401, 'Неверный пароль')
    tx(() => {
      for (const f of all("SELECT family_id id FROM grants WHERE user_id = ? AND access = 'owner'", req.user.id)) {
        wipeFamily(f.id)
        run('DELETE FROM families WHERE id = ?', f.id)
      }
      run('UPDATE data_requests SET user_id = NULL WHERE user_id = ?', req.user.id)
      run('DELETE FROM events WHERE user_id = ?', req.user.id)
      run('DELETE FROM users WHERE id = ?', req.user.id)
    })
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')
    res.json({ ok: true })
  })

  // --- плановое уничтожение данных после отзыва согласия
  const purge = () => {
    for (const f of all("SELECT id FROM families WHERE delete_after IS NOT NULL AND delete_after < ?", nowIso())) {
      tx(() => {
        wipeFamily(f.id)
        run('DELETE FROM families WHERE id = ?', f.id)
      })
    }
  }
  purge()
  setInterval(purge, 3600000).unref()
}

export { consentOk, plusDays, unlinkSync, UPLOAD_DIR }
