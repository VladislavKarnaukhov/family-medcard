// Аккаунт: восстановление пароля, смена имени и пароля, команда сотрудников.
import { createHash, randomBytes } from 'node:crypto'
import { all, checkPassword, get, hashPassword, nowIso, run, str, token, uuid } from './util.js'
import { appUrl, layout, sendMail, sendMailSoon } from './mailer.js'

const sha = (s) => createHash('sha256').update(s).digest('hex')
const hits = new Map()
const limited = (key, max, windowMs) => {
  const list = (hits.get(key) || []).filter((t) => Date.now() - t < windowMs)
  hits.set(key, [...list, Date.now()])
  return list.length >= max
}

// Письмо со ссылкой подтверждения адреса. Без подтверждения работать можно: адрес всё равно проверяется кодом при подписи согласия.
export function sendVerification(u) {
  const t = token(24)
  run('DELETE FROM email_verifications WHERE user_id = ?', u.id)
  run('INSERT INTO email_verifications (token_hash, user_id, expires_at) VALUES (?,?,?)', sha(t), u.id, new Date(Date.now() + 2 * 86400000).toISOString())
  const url = `${appUrl()}/#/verify/${t}`
  sendMailSoon({
    to: u.email,
    subject: 'Подтвердите адрес почты',
    text: `Подтвердите адрес почты, откройте ссылку (действует 2 дня): ${url}`,
    html: layout({ title: 'Подтвердите адрес почты', lines: ['Откройте ссылку, чтобы подтвердить, что этот адрес ваш.', 'Ссылка действует 2 дня.'], cta: { label: 'Подтвердить адрес', url } }),
  })
}

export function mountAccount(app, { needUser, needStaff, fail, startSessionFor }) {
  app.post('/api/auth/verify', (req, res) => {
    if (limited(`verify:${req.ip}`, 20, 3600000)) return fail(res, 429, 'Слишком много попыток')
    const r = get('SELECT * FROM email_verifications WHERE token_hash = ?', sha(String(req.body.token || '')))
    if (!r || r.expires_at < nowIso()) return fail(res, 410, 'Ссылка недействительна или истекла. Запросите новое письмо в приложении.')
    run('UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL', nowIso(), r.user_id)
    run('DELETE FROM email_verifications WHERE user_id = ?', r.user_id)
    res.json({ ok: true })
  })

  app.post('/api/me/resend-verification', needUser, (req, res) => {
    if (limited(`resend:${req.user.id}`, 3, 3600000)) return fail(res, 429, 'Письмо уже отправлено. Попробуйте позже.')
    if (get('SELECT email_verified_at v FROM users WHERE id = ?', req.user.id)?.v) return res.json({ ok: true, verified: true })
    sendVerification(req.user)
    res.json({ ok: true })
  })

  // --- восстановление пароля: ответ всегда одинаковый, чтобы не раскрывать, есть ли такой email
  app.post('/api/auth/forgot', async (req, res) => {
    if (limited(`forgot:${req.ip}`, 5, 3600000)) return fail(res, 429, 'Слишком много запросов. Попробуйте позже.')
    const email = str(req.body.email, 200).toLowerCase()
    const u = get('SELECT * FROM users WHERE email = ? AND disabled = 0', email)
    if (u) {
      const t = token(24)
      run('DELETE FROM resets WHERE user_id = ?', u.id)
      run('INSERT INTO resets (token_hash, user_id, expires_at) VALUES (?,?,?)', sha(t), u.id, new Date(Date.now() + 3600000).toISOString())
      const base = u.role === 'staff' ? `${appUrl()}/staff/` : `${appUrl()}/`
      const url = `${base}#/reset/${t}`
      sendMailSoon({
        to: u.email,
        subject: 'Восстановление пароля',
        text: `Чтобы задать новый пароль, откройте ссылку (действует 1 час): ${url}`,
        html: layout({ title: 'Новый пароль', lines: ['Вы запросили восстановление пароля. Ссылка действует один час.'], cta: { label: 'Задать новый пароль', url } }),
      })
    }
    res.json({ ok: true })
  })

  app.post('/api/auth/reset', (req, res) => {
    if (limited(`reset:${req.ip}`, 10, 3600000)) return fail(res, 429, 'Слишком много попыток')
    const password = typeof req.body.password === 'string' ? req.body.password : ''
    if (password.length < 8) return fail(res, 400, 'Пароль должен быть не короче 8 символов')
    const r = get('SELECT * FROM resets WHERE token_hash = ?', sha(String(req.body.token || '')))
    if (!r || r.expires_at < nowIso()) return fail(res, 410, 'Ссылка недействительна или истекла')
    run('UPDATE users SET password = ? WHERE id = ?', hashPassword(password), r.user_id)
    run('DELETE FROM resets WHERE user_id = ?', r.user_id)
    run('DELETE FROM sessions WHERE user_id = ?', r.user_id)
    res.json({ ok: true })
  })

  // --- профиль аккаунта
  app.patch('/api/me', needUser, (req, res) => {
    const name = str(req.body.name, 80)
    if (!name) return fail(res, 400, 'Укажите имя')
    run('UPDATE users SET name = ? WHERE id = ?', name, req.user.id)
    res.json({ ok: true })
  })

  app.post('/api/me/password', needUser, (req, res) => {
    const u = get('SELECT password FROM users WHERE id = ?', req.user.id)
    if (!checkPassword(String(req.body.current || ''), u.password)) return fail(res, 401, 'Текущий пароль неверный')
    const next = typeof req.body.next === 'string' ? req.body.next : ''
    if (next.length < 8) return fail(res, 400, 'Новый пароль должен быть не короче 8 символов')
    run('UPDATE users SET password = ? WHERE id = ?', hashPassword(next), req.user.id)
    // Остальные сессии закрываем, текущую оставляем.
    const keep = String((req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith('sid='))?.slice(4) || '')
    run('DELETE FROM sessions WHERE user_id = ? AND token != ?', req.user.id, keep)
    res.json({ ok: true })
  })

  // --- команда сотрудников (только администратор)
  const needAdmin = (req, res, next) => (req.user?.role === 'staff' && req.user.is_admin ? next() : fail(res, 403, 'Только для администратора'))

  app.get('/api/staff/team', needStaff, needAdmin, (req, res) => {
    res.json(
      all(
        `SELECT u.id, u.name, u.email, u.is_admin, u.disabled,
           (SELECT COUNT(*) FROM families f WHERE f.staff_id = u.id) families,
           (SELECT COUNT(*) FROM requests r WHERE r.assignee_id = u.id AND r.status != 'done') open_requests
         FROM users u WHERE u.role = 'staff' ORDER BY u.created_at`,
      ).map((u) => ({ id: u.id, name: u.name, email: u.email, isAdmin: !!u.is_admin, disabled: !!u.disabled, families: u.families, openRequests: u.open_requests })),
    )
  })

  app.post('/api/staff/team', needStaff, needAdmin, async (req, res) => {
    const name = str(req.body.name, 80)
    const email = str(req.body.email, 200).toLowerCase()
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'Укажите имя и email')
    if (get('SELECT id FROM users WHERE email = ?', email)) return fail(res, 409, 'Этот email уже занят')
    const temp = randomBytes(9).toString('base64url')
    const id = uuid()
    run('INSERT INTO users (id, email, name, password, role, is_admin, created_at) VALUES (?,?,?,?,?,?,?)', id, email, name, hashPassword(temp), 'staff', req.body.isAdmin ? 1 : 0, nowIso())
    // Сотрудник сам задаёт пароль по ссылке из письма.
    const t = token(24)
    run('INSERT INTO resets (token_hash, user_id, expires_at) VALUES (?,?,?)', sha(t), id, new Date(Date.now() + 7 * 86400000).toISOString())
    const url = `${appUrl()}/staff/#/reset/${t}`
    let emailed = false
    try {
      emailed = (await sendMail({ to: email, subject: 'Вас пригласили в «Близкие»', text: `Задайте пароль: ${url}`, html: layout({ title: 'Рабочее место «Близкие»', lines: [`${req.user.name} открыл(а) вам доступ к рабочему месту сотрудников.`, 'Задайте пароль, ссылка действует 7 дней.'], cta: { label: 'Задать пароль', url } }) })).sent
    } catch (e) {
      console.error('mail:', e.message)
    }
    res.json({ id, emailed, setupUrl: emailed ? undefined : url })
  })

  app.patch('/api/staff/team/:id', needStaff, needAdmin, (req, res) => {
    const u = get("SELECT * FROM users WHERE id = ? AND role = 'staff'", req.params.id)
    if (!u) return fail(res, 404, 'not_found')
    if (u.id === req.user.id) return fail(res, 400, 'Нельзя изменить свою запись')
    if ('disabled' in req.body) {
      const disabled = req.body.disabled ? 1 : 0
      run('UPDATE users SET disabled = ? WHERE id = ?', disabled, u.id)
      if (disabled) {
        run('DELETE FROM sessions WHERE user_id = ?', u.id)
        const other = get("SELECT id FROM users WHERE role = 'staff' AND disabled = 0 AND id != ? ORDER BY created_at LIMIT 1", u.id)
        run('UPDATE families SET staff_id = ? WHERE staff_id = ?', other?.id || null, u.id)
        run('UPDATE requests SET assignee_id = ? WHERE assignee_id = ? AND status != ?', other?.id || null, u.id, 'done')
      }
    }
    if ('isAdmin' in req.body) run('UPDATE users SET is_admin = ? WHERE id = ?', req.body.isAdmin ? 1 : 0, u.id)
    res.json({ ok: true })
  })
}
