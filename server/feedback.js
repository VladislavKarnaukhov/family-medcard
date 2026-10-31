// «Написать нам» и опрос на 14-й день: сообщения читает администратор (письмо и список в /api/staff/feedback).
import { all, get, nowIso, run, str, track, uuid } from './util.js'
import { appUrl, layout, sendMailSoon } from './mailer.js'

const SURVEY_AFTER_DAYS = 14
const hits = new Map()
const limited = (key, max, ms) => {
  const list = (hits.get(key) || []).filter((t) => Date.now() - t < ms)
  hits.set(key, [...list, Date.now()])
  return list.length >= max
}

// Опрос показываем владельцу через 14 дней после регистрации, пока он не ответил и не отказался.
export function surveyDue(user) {
  if (user.role === 'staff' || !user.created_at) return false
  if (Date.now() - Date.parse(user.created_at) < SURVEY_AFTER_DAYS * 86400000) return false
  if (!get("SELECT 1 FROM grants WHERE user_id = ? AND access = 'owner'", user.id)) return false
  return !get("SELECT 1 FROM feedback WHERE user_id = ? AND kind IN ('survey', 'survey_dismissed')", user.id)
}

export function mountFeedback(app, { needUser, needStaff, fail }) {
  const familyOf = (userId) => get("SELECT family_id id FROM grants WHERE user_id = ? ORDER BY created_at LIMIT 1", userId)?.id || null

  app.post('/api/feedback', needUser, (req, res) => {
    if (limited(`fb:${req.user.id}`, 5, 3600000)) return fail(res, 429, 'Вы уже написали несколько сообщений. Попробуйте позже.')
    const text = str(req.body.text, 2000)
    if (!text) return fail(res, 400, 'Напишите сообщение')
    run('INSERT INTO feedback (id, user_id, family_id, kind, text, created_at) VALUES (?,?,?,?,?,?)', uuid(), req.user.id, familyOf(req.user.id), 'message', text, nowIso())
    track('feedback_sent', { userId: req.user.id, familyId: familyOf(req.user.id) })
    const to = process.env.ADMIN_EMAIL
    if (to) sendMailSoon({ to, subject: 'Сообщение из «Близких»', text: `От ${req.user.name} (${req.user.email}):\n\n${text}`, html: layout({ title: 'Сообщение от пользователя', lines: [`От ${req.user.name} (${req.user.email})`, text], cta: { label: 'Открыть сервис', url: appUrl() } }) })
    res.json({ ok: true })
  })

  app.post('/api/survey', needUser, (req, res) => {
    if (get("SELECT 1 FROM feedback WHERE user_id = ? AND kind IN ('survey', 'survey_dismissed')", req.user.id)) return fail(res, 409, 'Вы уже ответили')
    const ease = Number(req.body.ease)
    if (!Number.isInteger(ease) || ease < 1 || ease > 5) return fail(res, 400, 'Оцените удобство от 1 до 5')
    const answers = { ease, recommend: req.body.recommend === true ? 'yes' : req.body.recommend === false ? 'no' : null, blocker: str(req.body.blocker, 1000) }
    run('INSERT INTO feedback (id, user_id, family_id, kind, text, answers, created_at) VALUES (?,?,?,?,?,?,?)', uuid(), req.user.id, familyOf(req.user.id), 'survey', answers.blocker, JSON.stringify(answers), nowIso())
    track('survey_answered', { userId: req.user.id, familyId: familyOf(req.user.id) })
    res.json({ ok: true })
  })

  app.post('/api/survey/dismiss', needUser, (req, res) => {
    if (!get("SELECT 1 FROM feedback WHERE user_id = ? AND kind IN ('survey', 'survey_dismissed')", req.user.id))
      run('INSERT INTO feedback (id, user_id, family_id, kind, created_at) VALUES (?,?,?,?,?)', uuid(), req.user.id, familyOf(req.user.id), 'survey_dismissed', nowIso())
    res.json({ ok: true })
  })

  app.get('/api/staff/feedback', needStaff, (req, res) => {
    res.json(all("SELECT f.id, f.kind, f.text, f.answers, f.created_at, u.name, u.email FROM feedback f LEFT JOIN users u ON u.id = f.user_id WHERE f.kind IN ('message', 'survey') ORDER BY f.created_at DESC LIMIT 200").map((r) => ({ id: r.id, kind: r.kind, text: r.text, answers: r.answers ? JSON.parse(r.answers) : null, at: r.created_at, name: r.name, email: r.email })))
  })
}
