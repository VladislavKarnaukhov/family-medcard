// Второй фактор для сотрудников: после пароля нужен код из письма. Сотрудники видят данные всех семей,
// поэтому одного пароля недостаточно. Отключается только явно: STAFF_2FA=0.
import { createHash, randomInt } from 'node:crypto'
import { get, nowIso, run, uuid } from './util.js'
import { isProd, layout, mailEnabled, sendMail } from './mailer.js'

const sha = (s) => createHash('sha256').update(s).digest('hex')
const TTL_MS = 10 * 60000
const MAX_ATTEMPTS = 5
const RESEND_MS = 15000

export const staff2faOn = () => process.env.STAFF_2FA !== '0'
const mask = (email) => email.replace(/^(.).*(@.*)$/, '$1***$2')

// Пароль уже проверен: создаём вызов и отправляем код. Сессию не выдаём.
export async function issueLoginCode(user, res) {
  const last = get('SELECT created_at FROM login_codes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', user.id)
  if (last && Date.now() - Date.parse(last.created_at) < RESEND_MS) return res.status(429).json({ error: 'Код уже отправлен, подождите несколько секунд' })
  const code = String(randomInt(0, 1000000)).padStart(6, '0')
  const id = uuid()
  let mail
  try {
    mail = await sendMail({
      to: user.email,
      subject: 'Код входа для сотрудников',
      text: `Код входа: ${code}. Он действует 10 минут. Если вы не входили, смените пароль.`,
      html: layout({ title: 'Код входа', lines: [`Код входа: ${code}`, 'Он действует 10 минут. Никому его не сообщайте.', 'Если вы не входили, смените пароль.'] }),
    })
  } catch (e) {
    console.error('mail:', e.message)
    return res.status(502).json({ error: 'Не удалось отправить код на почту. Попробуйте позже.' })
  }
  run('DELETE FROM login_codes WHERE user_id = ?', user.id)
  run('INSERT INTO login_codes (id, user_id, code_hash, expires_at, created_at) VALUES (?,?,?,?,?)', id, user.id, sha(`${id}|${code}`), new Date(Date.now() + TTL_MS).toISOString(), nowIso())
  const dev = !mail.sent && !isProd() && !mailEnabled()
  return res.json({ need2fa: true, challenge: id, to: mask(user.email), ...(dev ? { devCode: code } : {}) })
}

export function mountStaff2fa(app, { fail, startSession, mePayload }) {
  app.post('/api/auth/login/code', (req, res) => {
    const id = String(req.body.challenge || '')
    const c = get('SELECT * FROM login_codes WHERE id = ?', id)
    if (!c || c.expires_at < nowIso()) return fail(res, 401, 'Код истёк. Войдите заново.')
    if (c.attempts >= MAX_ATTEMPTS) {
      run('DELETE FROM login_codes WHERE id = ?', id)
      return fail(res, 429, 'Слишком много неверных кодов. Войдите заново.')
    }
    if (c.code_hash !== sha(`${id}|${String(req.body.code || '').trim()}`)) {
      run('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?', id)
      return fail(res, 401, 'Неверный код')
    }
    run('DELETE FROM login_codes WHERE id = ?', id)
    const u = get('SELECT * FROM users WHERE id = ? AND disabled = 0', c.user_id)
    if (!u) return fail(res, 401, 'Учётная запись недоступна')
    startSession(res, u.id)
    res.json(mePayload(u))
  })
}
