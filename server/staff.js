// Рабочее место сотрудников: очередь обращений, документы, поручения, запросы по данным.
// Доступ только у сотрудников (needStaff); вход двухфакторный (server/staff2fa.js).
import { all, get, log, nowIso, run, ruDate, str, uuid } from './util.js'
import { buildState, consentOk } from './state.js'
import { appUrl, layout, sendMailSoon } from './mailer.js'
import { notify } from './notify.js'

// Письмо администраторам о новом файле от клиента: без содержимого, не чаще раза в 10 минут.
let staffNotifiedAt = 0
export function notifyStaffFile(clientName) {
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

export function mountStaff(app, { needStaff, fail }) {
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
}
