// Смоук-тест: поднимает сервер на временной базе и проходит основной сценарий через HTTP.
// Запуск: npm test (нужна сборка: npm run build).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const dir = mkdtempSync(join(tmpdir(), 'blizkie-'))
const port = 4100 + Math.floor(Math.random() * 500)
const base = `http://127.0.0.1:${port}`
const start = () => spawn(process.execPath, ['server/index.js'], { env: { ...process.env, DATA_DIR: dir, PORT: String(port), NODE_ENV: 'test', SMTP_HOST: '' }, stdio: 'ignore' })
let srv = start()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let cookie = ''
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'x-app': '1', 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined })
  const set = r.headers.get('set-cookie')
  if (set) cookie = set.split(';')[0]
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, json, text }
}

let failed = 0
const step = async (name, fn) => {
  try { await fn(); console.log('ok  ', name) } catch (e) { failed++; console.log('FAIL', name, '-', e.message) }
}

try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/healthz')).ok) break } catch {} await wait(200) }
  await step('healthz', async () => assert.equal((await call('GET', '/healthz')).json.ok, true))
  await step('client app is served', async () => assert.match((await call('GET', '/')).text, /Близкие/))
  await step('staff app is served', async () => assert.equal((await call('GET', '/staff/')).status, 200))
  await step('api requires auth', async () => assert.equal((await call('GET', '/api/me')).status, 401))
  await step('csrf header required', async () => assert.equal((await fetch(base + '/api/auth/login', { method: 'POST' })).status, 400))
  await step('register needs consents', async () => assert.equal((await call('POST', '/api/auth/register', { name: 'Тест', email: 't@example.test', password: 'long-enough-1' })).status, 400))
  await step('register', async () => {
    const r = await call('POST', '/api/auth/register', { name: 'Тест', email: 't@example.test', password: 'long-enough-1', consents: { terms: true, consent_pd: true } })
    assert.equal(r.status, 200)
  })
  await step('me after register', async () => assert.equal((await call('GET', '/api/me')).json.user.email, 't@example.test'))
  await step('writes blocked until health consent', async () => {
    const me = (await call('GET', '/api/me')).json
    const fid = me.families[0].id
    const st = await call('GET', `/api/families/${fid}/state`)
    assert.equal(st.status, 200)
    const r = await call('POST', `/api/families/${fid}/profiles`, { name: 'Мама', basis: 'self', birthYear: 1958, sex: 'f' })
    assert.ok(r.status >= 400 && r.status < 500, 'status ' + r.status)
    assert.ok(!st.json.profiles?.length)
  })
  await step('health consent by code unlocks writes', async () => {
    const start = await call('POST', '/api/consents/health/start', {})
    assert.ok(start.json.devCode, 'dev code expected without SMTP')
    assert.equal((await call('POST', '/api/consents/health/sign', { agree: true, code: start.json.devCode })).status, 200)
  })
  let fid, pid
  await step('create profile', async () => {
    fid = (await call('GET', '/api/me')).json.families[0].id
    const r = await call('POST', `/api/families/${fid}/profiles`, { name: 'Я', basis: 'self', birthYear: 1985, sex: 'm' })
    assert.equal(r.status, 200)
    pid = r.json.id
  })
  await step('self-measured result without file', async () => {
    const r = await call('POST', `/api/profiles/${pid}/lab-results`, { date: '2026-10-18', labName: 'Измерено самостоятельно', rows: [{ name: 'Глюкоза', value: 5.4, unit: 'ммоль/л' }] })
    assert.equal(r.status, 200)
    const st = (await call('GET', `/api/families/${fid}/state`)).json
    assert.equal(st.labResults.length, 1)
    assert.equal(st.measurements.length, 1)
  })
  await step('uploaded file stored', async () => {
    const d = await call('POST', `/api/profiles/${pid}/documents`, { type: 'analysis', title: 'Бланк теста', date: '2026-10-18' })
    assert.equal(d.status, 200)
    const up = await fetch(`${base}/api/documents/${d.json.id}/file`, { method: 'PUT', headers: { 'x-app': '1', cookie, 'content-type': 'application/pdf', 'x-filename': 'test.pdf' }, body: Buffer.from('%PDF-1.4\n%test\n') })
    assert.equal(up.status, 200)
    const get = await fetch(`${base}/api/documents/${d.json.id}/file`, { headers: { cookie } })
    assert.equal(get.status, 200)
    assert.match(await get.text(), /^%PDF-/)
  })
  await step('data survives server restart', async () => {
    srv.kill('SIGTERM')
    await wait(500)
    srv = start()
    for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/healthz')).ok) break } catch {} await wait(200) }
    const st = (await call('GET', `/api/families/${fid}/state`)).json
    assert.equal(st.labResults.length, 1)
    assert.equal(st.documents.length, 1)
  })
  await step('admin sees the file in the queue and in all files', async () => {
    const creds = readFileSync(join(dir, 'staff-credentials.txt'), 'utf8')
    const m = /\(администратор\): (\S+) \/ (\S+)/.exec(creds)
    const client = cookie
    cookie = ''
    assert.equal((await call('POST', '/api/auth/login', { email: m[1], password: m[2] })).status, 200)
    const queue = (await call('GET', '/api/staff/documents')).json
    assert.ok(queue.some((x) => x.title === 'Бланк теста' && x.fileUrl), 'file in queue')
    const all = (await call('GET', '/api/staff/documents?all=1')).json
    assert.ok(all.some((x) => x.title === 'Бланк теста'), 'file in all files')
    cookie = client
  })

  // ---------- уход за близким ----------
  const owner = cookie
  const asUser = async (jar, fn) => {
    const keep = cookie
    cookie = jar
    try { return await fn() } finally { cookie = keep }
  }
  const register = async (name, email, inviteToken) => {
    cookie = ''
    const r = await call('POST', '/api/auth/register', { name, email, password: 'long-enough-1', consents: { terms: true, consent_pd: true }, inviteToken })
    assert.equal(r.status, 200, 'register ' + email + ' ' + r.status)
    const jar = cookie
    cookie = owner
    return jar
  }
  process.env.DATA_DIR = dir
  const { tick } = await import('../server/scheduler.js')
  const { db } = await import('../server/db.js')
  const { tzNow, addDays } = await import('../server/timeutil.js')
  const count = (t, where = '1=1') => db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE ${where}`).get().c
  let momId, medId, intakeAt, momJar, viewerJar, emergencyToken
  const today = tzNow('Europe/Moscow').date

  await step('mom profile and a medication', async () => {
    const r = await call('POST', `/api/families/${fid}/profiles`, { name: 'Мама', basis: 'adult', attest: true, birthYear: 1950, sex: 'f' })
    assert.equal(r.status, 200)
    momId = r.json.id
    assert.equal((await call('PUT', `/api/profiles/${momId}`, { name: 'Мама', birthYear: 1950, sex: 'f', notes: 'Гипертония', allergies: 'Пенициллин', emergencyContacts: [{ name: 'Ольга', relation: 'дочь', phone: '+7 900 000-00-00' }] })).status, 200)
    const m = await call('POST', `/api/profiles/${momId}/medications`, { name: 'Тестовое лекарство', dose: '1 таблетка', times: ['00:00'], startDate: addDays(today, -3) })
    assert.equal(m.status, 200, JSON.stringify(m.json))
    medId = m.json.id
    db.prepare("UPDATE medications SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(medId)
    const st = (await call('GET', `/api/families/${fid}/state`)).json
    assert.equal(st.medications.length, 1)
    assert.equal(st.profiles.find((p) => p.id === momId).allergies, 'Пенициллин')
    intakeAt = `${addDays(today, -1)}T00:00`
  })

  await step('unmarked intake notifies the owner once, restart-safe', async () => {
    tick()
    tick()
    const n = count('notifications', "kind = 'unmarked_intake'")
    assert.ok(n >= 1, 'notification created')
    assert.equal(count('intakes', "status = 'unmarked' AND scheduled_at = '" + intakeAt + "'"), 1)
    const before = count('notifications')
    tick()
    assert.equal(count('notifications'), before, 'no duplicates')
    const list = (await call('GET', '/api/notifications')).json
    assert.ok(list.some((x) => x.kind === 'unmarked_intake'))
    assert.ok(list.every((x) => !/Тестовое/.test(x.title)), 'no medication name in notification text')
  })

  await step('self invite: mom registers, simple mode, own consent', async () => {
    const inv = await call('POST', `/api/families/${fid}/invites`, { preset: 'self', profileId: momId, consentConfirmed: true })
    assert.equal(inv.status, 200, JSON.stringify(inv.json))
    assert.equal((await call('POST', `/api/families/${fid}/invites`, { preset: 'self', profileId: momId, consentConfirmed: true })).status, 409)
    momJar = await register('Мама Тестова', 'mom@example.test', inv.json.token)
    await asUser(momJar, async () => {
      const me = (await call('GET', '/api/me')).json
      assert.equal(me.families[0].selfProfileId, momId)
      assert.equal(me.user.simpleMode, true)
      const start = await call('POST', `/api/profiles/${momId}/self-consent/start`, {})
      assert.ok(start.json.devCode)
      assert.equal((await call('POST', `/api/profiles/${momId}/self-consent/sign`, { agree: true, code: start.json.devCode })).status, 200)
    })
    assert.equal(db.prepare('SELECT consent_status s FROM profiles WHERE id = ?').get(momId).s, 'confirmed')
  })

  await step('mom sees only her profile, no chat/requests/circle; own access log', async () => {
    await asUser(momJar, async () => {
      const st = (await call('GET', `/api/families/${(await call('GET', '/api/me')).json.families[0].id}/state`)).json
      assert.equal(st.profiles.length, 1)
      assert.equal(st.messages.length, 0)
      assert.equal(st.requests.length, 0)
      assert.equal(st.members.length, 0)
      assert.ok(st.accessLog.every((l) => l.profileId === momId))
      assert.equal((await call('POST', `/api/families/${fid}/invites`, { preset: 'caregiver', consentConfirmed: true })).status, 403)
      assert.equal((await call('POST', `/api/families/${fid}/messages`, { text: 'x' })).status >= 400, true)
    })
  })

  await step('mom marks an intake herself; marked_by_self is set by the server', async () => {
    await asUser(momJar, async () => {
      const r = await call('POST', `/api/medications/${medId}/intakes`, { scheduledAt: intakeAt, status: 'taken', bySelf: false })
      assert.equal(r.status, 200, JSON.stringify(r.json))
      assert.equal(r.json.bySelf, true)
      const again = await call('POST', `/api/medications/${medId}/intakes`, { scheduledAt: intakeAt, status: 'taken' })
      assert.equal(again.status, 200)
      assert.equal(count('intakes', "medication_id = '" + medId + "' AND scheduled_at = '" + intakeAt + "'"), 1, 'no duplicate')
      assert.equal((await call('POST', `/api/medications/${medId}/intakes`, { scheduledAt: `${today}T03:33`, status: 'taken' })).status, 400)
    })
    const st = (await call('GET', `/api/families/${fid}/state`)).json
    assert.ok(st.intakes.some((i) => i.scheduledAt === intakeAt && i.bySelf && i.status === 'taken'))
  })

  await step('caregiver marks intakes and writes the diary but cannot create or edit medications', async () => {
    const inv = await call('POST', `/api/families/${fid}/invites`, { preset: 'caregiver', profileIds: [momId], consentConfirmed: true })
    assert.equal(inv.status, 200, JSON.stringify(inv.json))
    const careJar = await register('Сиделка Тестова', 'nurse@example.test', inv.json.token)
    await asUser(careJar, async () => {
      const st = (await call('GET', `/api/families/${fid}/state`)).json
      assert.equal(st.me.caregiver, true)
      const add = await call('POST', `/api/profiles/${momId}/medications`, { name: 'Новое', times: ['10:00'] })
      assert.equal(add.status, 403)
      assert.equal(add.json.code, 'caregiver_readonly_meds')
      assert.equal((await call('PUT', `/api/medications/${medId}`, { name: 'Подмена', times: ['09:00'] })).status, 403)
      assert.equal((await call('POST', `/api/medications/${medId}/intakes`, { scheduledAt: intakeAt, status: 'taken' })).status, 200)
      assert.equal((await call('POST', `/api/profiles/${momId}/care-notes`, { kind: 'wellbeing', mood: 'good' })).status, 200)
    })
    assert.equal(count('medications', "name IN ('Новое', 'Подмена')"), 0)
    const ownerAdd = await call('POST', `/api/profiles/${momId}/medications`, { name: 'От владельца', times: ['12:00'] })
    assert.equal(ownerAdd.status, 200)
    await call('DELETE', `/api/medications/${ownerAdd.json.id}`)
  })

  await step('adherence summary for 7 and 30 days: only closed slots after the medication was added', async () => {
    db.prepare('UPDATE medications SET created_at = ? WHERE id = ?').run(`${addDays(today, -10)}T00:00:00.000Z`, medId)
    const st = (await call('GET', `/api/families/${fid}/state`)).json
    const a = st.adherence[momId]
    assert.equal(a.d7.planned, 4, 'start_date is three days ago, slot 00:00 every day through today')
    assert.equal(a.d7.taken + a.d7.skipped + a.d7.unmarked, a.d7.planned)
    assert.ok(a.d7.taken >= 1)
    assert.equal(a.d7.percent, Math.round(((a.d7.taken + a.d7.skipped) / a.d7.planned) * 100))
    assert.equal(a.d30.planned, a.d7.planned)
    assert.equal(a.d7.missed.length, a.d7.unmarked)
  })

  await step('events are recorded without content, metrics script reports the funnel, deletion wipes events', async () => {
    const names = db.prepare('SELECT DISTINCT name FROM events').all().map((r) => r.name)
    for (const n of ['signup', 'consent_health', 'profile_created', 'medication_created', 'invite_created', 'invite_accepted', 'intake_marked', 'care_note_created']) assert.ok(names.includes(n), 'event ' + n)
    assert.equal((await call('POST', '/api/events', { name: 'summary_viewed', familyId: fid })).status, 200)
    assert.equal((await call('POST', '/api/events', { name: 'anything', familyId: fid })).status, 400)
    assert.equal(count('events', "name = 'summary_viewed'"), 1)
    const r = spawnSync(process.execPath, ['scripts/metrics.mjs', '--json'], { env: { ...process.env, DATA_DIR: dir }, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const m = JSON.parse(r.stdout)
    assert.ok(m.funnel['Регистрация владельца'] >= 1 && m.funnel['Отмечен приём или запись в дневнике'] >= 1 && m.funnel['Открыта сводка для врача'] >= 1)
    assert.equal(m.target.families, 10)
  })

  await step('daily backup exists, restore into an empty folder recovers users and files', async () => {
    const day = new Date().toISOString().slice(0, 10)
    assert.ok(existsSync(join(dir, 'backups', `blizkie-${day}.db`)), 'startup backup')
    const { backupNow } = await import('../server/backup.js')
    const r = backupNow()
    assert.ok(existsSync(r.file))
    const d3 = mkdtempSync(join(tmpdir(), 'blizkie-restore-'))
    try {
      const run = spawnSync(process.execPath, ['scripts/restore.mjs', r.file], { env: { ...process.env, DATA_DIR: d3 }, encoding: 'utf8' })
      assert.equal(run.status, 0, run.stderr)
      assert.match(run.stdout, /целостность ok/)
      const { DatabaseSync } = await import('node:sqlite')
      const h = new DatabaseSync(join(d3, 'blizkie.db'))
      assert.ok(h.prepare('SELECT COUNT(*) c FROM users').get().c >= 1)
      h.close()
      assert.equal(spawnSync(process.execPath, ['scripts/restore.mjs', r.file], { env: { ...process.env, DATA_DIR: d3 }, encoding: 'utf8' }).status, 1, 'refuses to overwrite without --force')
    } finally { rmSync(d3, { recursive: true, force: true }) }
  })

  await step('state carries 90 days of diary notes and intakes for the diary screen', async () => {
    const old = `${addDays(today, -60)}T09:00`
    db.prepare("INSERT INTO care_notes (id, profile_id, at, kind, text, author_id, author_name, author_role, by_self, created_at) VALUES ('old-note', ?, ?, 'other', 'давняя запись', 'x', 'Тест', 'owner', 0, ?)").run(momId, old, old)
    const st = (await call('GET', `/api/families/${fid}/state`)).json
    assert.ok(st.careNotes.some((n) => n.id === 'old-note'))
    assert.ok(!st.careNotes.some((n) => n.at < `${addDays(today, -90)}T00:00`))
    db.prepare("DELETE FROM care_notes WHERE id = 'old-note'").run()
  })

  await step('intake reminder emails: at most one per 15 minutes per person, in-app reminders for every slot (M-48)', async () => {
    db.prepare("UPDATE users SET email_intake = 1 WHERE email = 'mom@example.test'").run()
    const ids = []
    for (const [name, time] of [['Лимит А', '14:50'], ['Лимит Б', '14:55']]) {
      const r = await call('POST', `/api/profiles/${momId}/medications`, { name, times: [time], startDate: addDays(today, -2) })
      assert.equal(r.status, 200, JSON.stringify(r.json))
      db.prepare('UPDATE medications SET created_at = ? WHERE id = ?').run(`${addDays(today, -2)}T00:00:00.000Z`, r.json.id)
      ids.push(r.json.id)
    }
    const mails = () => (readFileSync(join(dir, 'outbox.log'), 'utf8').match(/subject=Время принять лекарство/g) || []).length
    const before = mails()
    tick(new Date(`${today}T12:00:00Z`))
    assert.equal(mails() - before, 1, 'one email for two slots')
    assert.equal(db.prepare("SELECT COUNT(*) c FROM notifications WHERE kind = 'intake_due' AND ref_id LIKE ?").get(`${momId}|${today}T14:5%`).c, 2, 'both in-app reminders exist')
    for (const id of ids) db.prepare('DELETE FROM medications WHERE id = ?').run(id)
  })

  await step('first mark of an intake is written to the access log with who marked it (M-09)', async () => {
    const row = db.prepare("SELECT who, action FROM access_log WHERE action LIKE 'Отмечен приём:%' AND who LIKE 'Мама%' LIMIT 1").get()
    assert.ok(row, 'log row by mom')
    assert.match(row.action, /Тестовое лекарство/)
  })

  await step('fall note notifies the owner; bad mood only if allowed', async () => {
    const before = count('notifications', "kind = 'fall'")
    await asUser(momJar, async () => {
      assert.equal((await call('POST', `/api/profiles/${momId}/care-notes`, { kind: 'fall', text: 'Упала в коридоре', needsDoctor: 'unknown' })).status, 200)
      assert.equal((await call('POST', `/api/profiles/${momId}/care-notes`, { kind: 'wellbeing', mood: 'bad' })).status, 200)
    })
    assert.ok(count('notifications', "kind = 'fall'") > before)
    assert.equal(count('notifications', "kind = 'wellbeing_bad'"), 0, 'off by default')
    await asUser(momJar, async () => assert.equal((await call('PUT', `/api/profiles/${momId}/notify-bad-mood`, { on: true })).status, 200))
    await asUser(momJar, async () => call('POST', `/api/profiles/${momId}/care-notes`, { kind: 'wellbeing', mood: 'bad' }))
    assert.equal(count('notifications', "kind = 'wellbeing_bad'"), 1)
  })

  await step('shared card: two people see each other results only when both allowed', async () => {
    const dadId = (await call('POST', `/api/families/${fid}/profiles`, { name: 'Папа', basis: 'adult', attest: true, birthYear: 1950, sex: 'm' })).json.id
    const inv = await call('POST', `/api/families/${fid}/invites`, { preset: 'self', profileId: dadId, consentConfirmed: true })
    const dadJar = await register('Папа Тестов', 'dad@example.test', inv.json.token)
    await asUser(dadJar, async () => {
      const s1 = await call('POST', `/api/profiles/${dadId}/self-consent/start`, {})
      assert.equal((await call('POST', `/api/profiles/${dadId}/self-consent/sign`, { agree: true, code: s1.json.devCode })).status, 200)
    })
    assert.equal((await call('POST', `/api/profiles/${momId}/lab-results`, { date: '2026-10-20', labName: 'Тест', rows: [{ name: 'Глюкоза', value: 6.1, unit: 'ммоль/л' }] })).status, 200)
    const famOf = async () => (await call('GET', '/api/me')).json.families[0].id
    const dadState = () => asUser(dadJar, async () => (await call('GET', `/api/families/${await famOf()}/state`)).json)
    let st = await dadState()
    assert.deepEqual(st.profiles.map((p) => p.name), ['Папа'], 'nothing shared yet')
    // мама разрешает показ, папа ещё нет: папа ничего не видит
    await asUser(momJar, async () => {
      assert.equal((await call('PUT', `/api/profiles/${momId}/share-peers`, { on: true })).status, 400, 'needs consent')
      assert.equal((await call('PUT', `/api/profiles/${momId}/share-peers`, { on: true, consentConfirmed: true })).status, 200)
    })
    st = await dadState()
    assert.deepEqual(st.profiles.map((p) => p.name), ['Папа'], 'mutual only')
    // папа тоже разрешает: теперь видят друг друга
    await asUser(dadJar, async () => assert.equal((await call('PUT', `/api/profiles/${dadId}/share-peers`, { on: true, consentConfirmed: true })).status, 200))
    st = await dadState()
    const peer = st.profiles.find((p) => p.id === momId)
    assert.ok(peer && peer.peer, 'mom visible to dad')
    assert.equal(st.labResults.filter((l) => l.profileId === momId).length, 1, 'results visible')
    assert.equal(st.medications.filter((m) => m.profileId === momId).length, 0, 'no medications')
    assert.equal(st.careNotes.filter((n) => n.profileId === momId).length, 0, 'no diary')
    assert.equal(st.documents.filter((d) => d.profileId === momId).length, 0, 'no documents')
    assert.equal(peer.notes, '')
    // читать можно, писать в чужой профиль нельзя
    await asUser(dadJar, async () => {
      assert.ok((await call('POST', `/api/profiles/${momId}/lab-results`, { date: '2026-10-21', labName: 'X', rows: [{ name: 'Глюкоза', value: 5, unit: 'ммоль/л' }] })).status >= 400)
      assert.ok((await call('POST', `/api/profiles/${momId}/care-notes`, { kind: 'other', text: 'x' })).status >= 400)
    })
    assert.ok(count('access_log', "action = 'Участник общей карты открыл(а) результаты'") >= 1, 'view is logged')
    // выключение у мамы скрывает её результаты у папы
    await asUser(momJar, async () => assert.equal((await call('PUT', `/api/profiles/${momId}/share-peers`, { on: false })).status, 200))
    st = await dadState()
    assert.deepEqual(st.profiles.map((p) => p.name), ['Папа'])
    await asUser(momJar, async () => call('PUT', `/api/profiles/${momId}/share-peers`, { on: false }))
  })

  await step('view-only relative cannot mark or write (403 on the server)', async () => {
    const inv = await call('POST', `/api/families/${fid}/invites`, { access: 'view', role: 'Брат', profileIds: [momId], consentConfirmed: true })
    viewerJar = await register('Брат Тестов', 'bro@example.test', inv.json.token)
    await asUser(viewerJar, async () => {
      assert.equal((await call('POST', `/api/medications/${medId}/intakes`, { scheduledAt: intakeAt, status: 'taken' })).status, 403)
      assert.equal((await call('POST', `/api/profiles/${momId}/care-notes`, { kind: 'other', text: 'x' })).status, 403)
      assert.equal((await call('POST', `/api/profiles/${momId}/medications`, { name: 'x' })).status, 403)
      const me = (await call('GET', '/api/me')).json
      const st = (await call('GET', `/api/families/${me.families[0].id}/state`)).json
      assert.ok(st.medications.length >= 1, 'can read')
    })
  })

  await step('mark can be undone: closed slot returns to «unmarked», repeat is harmless, can be marked again (M-04)', async () => {
    const before = db.prepare('SELECT status FROM intakes WHERE medication_id = ? AND scheduled_at = ?').get(medId, intakeAt)
    assert.equal(before.status, 'taken')
    const r = await call('POST', `/api/medications/${medId}/intakes`, { scheduledAt: intakeAt, status: 'unmarked' })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal(r.json.undone, true)
    const row = db.prepare('SELECT status, marked_by_id, marked_at FROM intakes WHERE medication_id = ? AND scheduled_at = ?').get(medId, intakeAt)
    assert.equal(row.status, 'unmarked')
    assert.equal(row.marked_by_id, null)
    assert.equal((await call('POST', `/api/medications/${medId}/intakes`, { scheduledAt: intakeAt, status: 'unmarked' })).status, 200)
    assert.ok(count('access_log', "action LIKE 'Отметка приёма снята%'") >= 1)
    await asUser(viewerJar, async () => assert.equal((await call('POST', `/api/medications/${medId}/intakes`, { scheduledAt: intakeAt, status: 'unmarked' })).status, 403))
    assert.equal((await call('POST', `/api/medications/${medId}/intakes`, { scheduledAt: intakeAt, status: 'taken' })).status, 200)
  })

  await step('banner picks due slots first, else today\'s unmarked ones (M-08)', async () => {
    const { bannerRows } = await import('../src/lib/care.js')
    const r = (state) => ({ state })
    assert.deepEqual(bannerRows([r('later'), r('due'), r('unmarked')]).kind, 'due')
    const late = bannerRows([r('taken'), r('unmarked'), r('later')])
    assert.equal(late.kind, 'late')
    assert.equal(late.rows.length, 1)
    assert.equal(bannerRows([r('taken'), r('skipped'), r('later')]).rows.length, 0)
  })

  await step('first-steps checklist is gone from the dashboard', async () => {
    assert.ok(!/FirstSteps|firstSteps/.test(readFileSync('src/screens/Dashboard.jsx', 'utf8') + readFileSync('src/lib/care.js', 'utf8')))
  })

  await step('blood test panels: ready rows, empty rows skipped on save, at least one value required', async () => {
    const { BLOOD_PANELS, panelDraft, draftBad, draftRows } = await import('../src/lib/draft.js')
    assert.deepEqual(BLOOD_PANELS, ['Общий анализ крови', 'Биохимия', 'Гормоны и витамины'])
    const d = panelDraft('Общий анализ крови', '2026-10-30')
    assert.ok(d.rows.length >= 7 && d.rows.every((r) => r.optional && r.value === '' && r.unit && r.refLow === ''), 'rows ready, no reference ranges invented')
    assert.ok(d.rows.some((r) => r.name === 'Гемоглобин' && r.unit === 'г/л'))
    assert.equal(draftBad({ ...d, labName: 'Инвитро' }), true, 'nothing filled')
    d.labName = 'Инвитро'
    d.rows[0].value = '132'
    d.rows[1].value = 'abc'
    assert.equal(draftBad(d), true, 'a typed non-number is still an error')
    d.rows[1].value = '4,6'
    assert.equal(draftBad(d), false)
    const out = draftRows(d)
    assert.equal(out.length, 2, 'unfilled rows are skipped')
    assert.deepEqual(out.map((r) => r.value), [132, 4.6])
    // сохранение через API: показатели попадают в историю
    const saved = await call('POST', `/api/profiles/${momId}/lab-results`, { date: '2026-10-30', labName: 'Инвитро', rows: out })
    assert.equal(saved.status, 200, JSON.stringify(saved.json))
    const st = (await call('GET', `/api/families/${fid}/state`)).json
    assert.ok(st.measurements.some((m) => m.name === 'Гемоглобин' && m.value === 132))
  })

  await step('lab text parser: names, values, units, references, OCR slips flagged, noise skipped', async () => {
    const { parseLabText } = await import('../src/lib/labparse.js')
    const text = [
      'ИНВИТРО', 'Дата взятия биоматериала: 28.10.2026', 'Исследование  Результат  Единицы  Референсные значения',
      'Гемоглобин (Hb)  132  г/л  117 - 155', 'Эритроциты (RBC)  4,52  10^12/л  3,8 - 5,1', 'Лейкоциты (WBC) 6.1 х10^9/л 4.0 - 9.0',
      'Тромбоциты 2O5 10 9/л 150 - 400', 'СОЭ 12 мм/ч 2 - 20', 'Глюкоза | 5,4 | ммоль/л | 4,1 - 5,9', 'Холестерин общий 6,3 ммоль/л до 5,2',
      'Холестерин ЛПНП 3,9 ммоль/л < 3,4', 'Гликированный гемоглобин 5,6 % 4,0 - 6,0', 'Кальций общий 2,31 ммоль/л 2,15 - 2,55',
      'Креатинин 1O1 мкмоль/л 59 - 104', 'Страница 1 из 2', 'Врач Иванов 12.03.1980',
    ].join('\n')
    const r = parseLabText(text)
    assert.equal(r.date, '2026-10-28')
    assert.equal(r.labName, 'Инвитро')
    assert.equal(r.rows.length, 11)
    const by = (n) => r.rows.find((x) => x.name === n)
    assert.deepEqual([by('Гемоглобин').value, by('Гемоглобин').unit, by('Гемоглобин').refLow, by('Гемоглобин').refHigh], [132, 'г/л', 117, 155])
    assert.equal(by('Эритроциты').value, 4.52, 'decimal comma')
    assert.equal(by('Лейкоциты').unit, '10^9/л', 'leading «х» before the exponent is dropped')
    assert.equal(by('Гликированный гемоглобин').value, 5.6, 'longest alias wins over plain hemoglobin')
    assert.equal(by('Гемоглобин').value, 132)
    assert.deepEqual([by('Холестерин общий').refLow, by('Холестерин общий').refHigh], [null, 5.2], '«до 5,2»')
    assert.equal(by('Холестерин ЛПНП').refHigh, 3.4, '«< 3,4»')
    assert.equal(by('Тромбоциты').value, 205)
    assert.equal(by('Тромбоциты').confidence, 'low', 'letter O fixed in a number is flagged')
    assert.equal(by('Креатинин').value, 101)
    assert.equal(by('Креатинин').confidence, 'low')
    assert.equal(by('Кальций общий').confidence, 'high', 'not in the reference list but cleanly read: kept, name stays as written')
    assert.equal(by('Гемоглобин').confidence, 'high')
    assert.ok(!r.rows.some((x) => /Врач|Страница/.test(x.name)), 'noise lines are skipped')
    assert.equal(parseLabText('просто текст без показателей').rows.length, 0)
    assert.equal(parseLabText('Гемоглобин 1320 г/л 117 - 155').rows[0].confidence, 'low', 'implausible value is flagged, not fixed')
  })

  await step('parser on an OCR-like hospital form: wrapped names, flags, lookalike units, lost decimal point (values are synthetic)', async () => {
    const { parseLabText } = await import('../src/lib/labparse.js')
    const text = `Дата взятия образца: 05.03.2025      09:10
Наименование исследования        Результат     Ед.изм.      Нормальные значения
ГЕМАТОЛОГИЧЕСКИЕ ИССЛЕДОВАНИЯ
Эритроциты        4.21      10*12/n      3.92-5.08
Гемоглобин        128       г/л          119-146
Средний объем эритроцитов (MCV)      90.0      фл      82.9-98.0
Среднее содержание гемоглобина в      29.1      nr/kn      27.0-32.3
эритроците (MCH)
Средняя концентрация Hb в эритроцитах      33.0      г/дл      31.8-34.7
(MCHC)
Нейтрофилы %      50.2      %      42.5-73.2
Базофилы %      08 (Н)      %      0.0-0.7
Моноциты %      6.2      %      4311.0
Лимфоциты %      41.8      %      18.2-474`
    const r = parseLabText(text)
    assert.equal(r.date, '2025-03-05', 'sampling date, not another date')
    const by = (re) => r.rows.find((x) => re.test(x.name))
    assert.equal(r.rows.length, 9)
    assert.equal(by(/^Эритроциты$/).unit, '10¹²/л', 'lookalike «n» repaired to «л»')
    assert.equal(by(/^Эритроциты$/).confidence, 'high')
    assert.equal(by(/MCV|объ.м эритроцита/).name, 'Средний объём эритроцита', 'indicator found by abbreviation in brackets')
    assert.equal(by(/MCH\)/).unit, 'пг/кл', 'rare unit repaired')
    assert.match(by(/MCH\)/).name, /эритроците \(MCH\)$/, 'wrapped name joined')
    const mchc = by(/MCHC/)
    assert.notEqual(mchc.name, 'Гемоглобин', '«Hb» inside a longer name must not turn it into hemoglobin')
    assert.equal(mchc.value, 33)
    assert.equal(by(/^Нейтрофилы %/).confidence, 'high')
    const baso = by(/^Базофилы %/)
    assert.equal(baso.value, 0.8, '«08» read as 0.8')
    assert.equal(baso.confidence, 'low')
    assert.equal(by(/^Моноциты %/).confidence, 'low', 'reference lost its dash')
    assert.equal(by(/^Лимфоциты %/).confidence, 'low', 'implausible reference 18.2-474 %')
  })

  await step('on-device OCR assets are served and CSP allows only the worker and wasm they need', async () => {
    for (const f of ['worker.min.js', 'lang/rus.traineddata.gz', 'lang/eng.traineddata.gz', 'tesseract-core-simd-lstm.wasm']) {
      const r = await fetch(`${base}/ocr/${f}`)
      assert.equal(r.status, 200, f)
    }
    const src = readFileSync('server/index.js', 'utf8')
    const csp = src.match(/Content-Security-Policy', "(default-src 'self'[^"]*)"/)[1]
    assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/)
    assert.match(csp, /worker-src 'self' blob:/)
    assert.ok(!/script-src[^;]*unsafe-inline/.test(csp) && !/https?:\/\//.test(csp), 'no inline scripts, no outside hosts')
  })

  await step('another family cannot see or change this family (isolation)', async () => {
    const stranger = await register('Чужой Тестов', 'stranger@example.test')
    await asUser(stranger, async () => {
      const st = await call('POST', '/api/consents/health/start', {})
      await call('POST', '/api/consents/health/sign', { agree: true, code: st.json.devCode })
      assert.equal((await call('GET', `/api/families/${fid}/state`)).status, 404)
      assert.equal((await call('POST', `/api/medications/${medId}/intakes`, { scheduledAt: intakeAt, status: 'taken' })).status, 404)
      assert.equal((await call('PUT', `/api/medications/${medId}`, { name: 'Чужое', times: ['09:00'] })).status, 404)
      assert.equal((await call('POST', `/api/profiles/${momId}/care-notes`, { kind: 'other', text: 'x' })).status, 404)
      assert.equal((await call('POST', `/api/profiles/${momId}/appointments`, { at: `${addDays(today, 2)}T10:00`, specialist: 'x' })).status, 404)
      assert.equal((await call('POST', `/api/profiles/${momId}/emergency`, {})).status, 404)
      assert.equal((await call('POST', `/api/profiles/${momId}/share`, { days: 7, consentConfirmed: true })).status, 404)
      assert.equal((await call('DELETE', '/api/me/account', { password: 'long-enough-1' })).status, 200)
    })
    assert.equal(count('medications', "name = 'Чужое'"), 0)
  })

  await step('invites are limited per family per day (M-43)', async () => {
    const other = await register('Лимит Тестов', 'limit@example.test')
    await asUser(other, async () => {
      const st = await call('POST', '/api/consents/health/start', {})
      await call('POST', '/api/consents/health/sign', { agree: true, code: st.json.devCode })
      const f2 = (await call('GET', '/api/me')).json.families[0].id
      for (let i = 0; i < 10; i++) assert.equal((await call('POST', `/api/families/${f2}/invites`, { access: 'view', role: 'Брат', consentConfirmed: true })).status, 200, 'invite ' + i)
      const over = await call('POST', `/api/families/${f2}/invites`, { access: 'view', role: 'Брат', consentConfirmed: true })
      assert.equal(over.status, 429)
      assert.equal((await call('DELETE', '/api/me/account', { password: 'long-enough-1' })).status, 200)
    })
  })

  await step('revoking access takes effect on the next request', async () => {
    const gid = db.prepare("SELECT g.id FROM grants g JOIN users u ON u.id = g.user_id WHERE u.email = 'bro@example.test'").get().id
    await asUser(viewerJar, async () => assert.equal((await call('GET', `/api/families/${fid}/state`)).status, 200))
    assert.equal((await call('DELETE', `/api/families/${fid}/members/${gid}`)).status, 200)
    await asUser(viewerJar, async () => {
      assert.equal((await call('GET', `/api/families/${fid}/state`)).status, 404)
      assert.equal((await call('POST', `/api/medications/${medId}/intakes`, { scheduledAt: intakeAt, status: 'taken' })).status, 404)
    })
  })

  await step('self user cannot write until they sign their own consent (M-31)', async () => {
    const auntId = (await call('POST', `/api/families/${fid}/profiles`, { name: 'Тётя', basis: 'adult', attest: true, birthYear: 1952, sex: 'f' })).json.id
    const inv = await call('POST', `/api/families/${fid}/invites`, { preset: 'self', profileId: auntId, consentConfirmed: true })
    const auntJar = await register('Тётя Тестова', 'aunt@example.test', inv.json.token)
    await asUser(auntJar, async () => {
      const w = await call('POST', `/api/profiles/${auntId}/care-notes`, { kind: 'other', text: 'до согласия' })
      assert.equal(w.status, 403)
      assert.equal(w.json.code, 'self_consent_required')
      assert.equal((await call('GET', `/api/families/${fid}/state`)).status, 200, 'reading still works')
      const st = await call('POST', `/api/profiles/${auntId}/self-consent/start`, {})
      assert.equal((await call('POST', `/api/profiles/${auntId}/self-consent/sign`, { agree: true, code: st.json.devCode })).status, 200)
      assert.equal((await call('POST', `/api/profiles/${auntId}/care-notes`, { kind: 'other', text: 'после согласия' })).status, 200)
    })
  })

  await step('appointment and request to the assistant', async () => {
    const at = `${addDays(today, 1)}T12:00`
    const a = await call('POST', `/api/profiles/${momId}/appointments`, { at, specialist: 'Кардиолог', purpose: 'Планово' })
    assert.equal(a.status, 200)
    const r = await call('POST', `/api/appointments/${a.json.id}/request`, {})
    assert.equal(r.status, 200)
    assert.equal(count('requests', "title LIKE 'Подготовить визит%'"), 1)
    tick()
    assert.ok(count('notifications', "kind = 'appointment_soon'") >= 1, 'reminder inside 24h')
  })

  await step('emergency card: only the card fields, revocation gives 410', async () => {
    assert.equal((await call('POST', `/api/profiles/${momId}/emergency`, {})).status, 400, 'needs consent')
    const r = await call('POST', `/api/profiles/${momId}/emergency`, { consentConfirmed: true, contactsConfirmed: true })
    assert.equal(r.status, 200)
    emergencyToken = r.json.token
    const pub = await fetch(`${base}/api/emergency/${emergencyToken}`)
    assert.equal(pub.status, 200)
    const j = await pub.json()
    assert.deepEqual(Object.keys(j).sort(), ['allergies', 'birthYear', 'conditions', 'contacts', 'medications', 'name'])
    assert.equal(j.allergies, 'Пенициллин')
    assert.equal(j.medications[0].name, 'Тестовое лекарство')
    assert.ok(!JSON.stringify(j).match(/labResults|measurements|careNotes|documents|vitals/))
    assert.ok((await call('GET', `/api/families/${fid}/state`)).json.accessLog.some((l) => l.action === 'Открыта экстренная карточка'))
    assert.equal((await call('DELETE', `/api/profiles/${momId}/emergency`)).status, 200)
    assert.equal((await fetch(`${base}/api/emergency/${emergencyToken}`)).status, 410)
  })

  await step('share link for the doctor shows medications and allergies, not the diary', async () => {
    const sh = await call('POST', `/api/profiles/${momId}/share`, { days: 1, consentConfirmed: true })
    const j = await (await fetch(`${base}/api/share/${sh.json.token}`)).json()
    assert.ok(j.medications.length >= 1)
    assert.equal(j.profiles[0].allergies, 'Пенициллин')
    assert.equal(j.careNotes.length, 0)
    assert.equal(j.appointments.length, 0)
    assert.equal(j.profiles[0].emergencyContacts, undefined)
  })

  await step('doctor link can be revoked by the owner only, then gives 410 (M-23)', async () => {
    const t = (await call('POST', `/api/profiles/${momId}/share`, { days: 7, consentConfirmed: true })).json.token
    assert.ok(t)
    const own = (await call('GET', `/api/families/${fid}/state`)).json
    assert.ok(own.shareLinks.some((l) => l.token === t))
    assert.equal((await call('GET', `/api/share/${t}`)).status, 200)
    await asUser(viewerJar, async () => assert.ok([403, 404].includes((await call('DELETE', `/api/share/${t}`)).status)))
    assert.equal((await call('GET', `/api/share/${t}`)).status, 200, 'non-owner cannot revoke')
    assert.equal((await call('DELETE', `/api/share/${t}`)).status, 200)
    assert.equal((await call('GET', `/api/share/${t}`)).status, 410)
    assert.ok(!(await call('GET', `/api/families/${fid}/state`)).json.shareLinks.some((l) => l.token === t))
  })

  await step('after consent revoked, new care writes return 423', async () => {
    const r = await call('POST', '/api/consents/health/revoke', {})
    assert.equal(r.status, 200)
    assert.equal((await call('POST', `/api/profiles/${momId}/medications`, { name: 'Ещё' })).status, 423)
    assert.equal((await call('POST', `/api/profiles/${momId}/care-notes`, { kind: 'other', text: 'x' })).status, 423)
    const start = await call('POST', '/api/consents/health/start', {})
    await call('POST', '/api/consents/health/sign', { agree: true, code: start.json.devCode })
  })

  await step('deleting the owner account removes all care data', async () => {
    assert.ok(count('medications') > 0 && count('notifications') > 0)
    const r = await call('DELETE', '/api/me/account', { password: 'long-enough-1' })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    for (const t of ['medications', 'intakes', 'care_notes', 'appointments', 'notifications', 'emergency_links', 'events']) assert.equal(count(t), 0, t)
    cookie = ''
    await call('POST', '/api/auth/register', { name: 'Тест', email: 't@example.test', password: 'long-enough-1', consents: { terms: true, consent_pd: true } })
    const st = await call('POST', '/api/consents/health/start', {})
    await call('POST', '/api/consents/health/sign', { agree: true, code: st.json.devCode })
  })

  await step('outbox.log: mode 600, codes and tokens masked, none in production', async () => {
    const p = join(dir, 'outbox.log')
    assert.ok(existsSync(p), 'outbox.log should exist in dev')
    assert.equal(statSync(p).mode & 0o777, 0o600)
    const t = readFileSync(p, 'utf8')
    assert.ok(t.includes('Код подтверждения') && t.includes('******'), 'masked code expected')
    assert.ok(!/\b\d{6}\b/.test(t), 'no plain 6-digit codes')
    const d2 = mkdtempSync(join(tmpdir(), 'blizkie-prod-'))
    try {
      const r = spawnSync(process.execPath, ['server/index.js'], { env: { ...process.env, DATA_DIR: d2, PORT: String(port + 700), NODE_ENV: 'production', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' }, encoding: 'utf8', timeout: 15000 })
      assert.equal(r.status, 1)
      assert.match(r.stderr, /нужна настроенная почта/)
    } finally { rmSync(d2, { recursive: true, force: true }) }
  })

  await step('new LEGAL_VERSION blocks writes until the owner signs again', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const h = new DatabaseSync(join(dir, 'blizkie.db'))
    const fid2 = (await call('GET', '/api/me')).json.families[0].id
    h.prepare("UPDATE consents SET doc_version = 'старая-версия' WHERE doc_id = 'consent_health'").run()
    const w = await call('POST', `/api/families/${fid2}/profiles`, { name: 'Папа', basis: 'self', birthYear: 1955, sex: 'm' })
    assert.equal(w.status, 403)
    assert.equal(w.json.code, 'consent_outdated')
    const st = await call('GET', `/api/families/${fid2}/state`)
    assert.equal(st.status, 200)
    assert.equal(st.json.consent.outdated, true)
    const s1 = await call('POST', '/api/consents/health/start', {})
    assert.equal((await call('POST', '/api/consents/health/sign', { agree: true, code: s1.json.devCode })).status, 200)
    const ok = await call('POST', `/api/families/${fid2}/profiles`, { name: 'Папа', basis: 'self', birthYear: 1955, sex: 'm' })
    assert.equal(ok.status, 200)
    h.close()
  })

  await step('email verification: link sets the flag, bad token gives 410, resend is limited (M-45)', async () => {
    await call('POST', '/api/auth/logout', {})
    const reg = await call('POST', '/api/auth/register', { name: 'Почта Тестова', email: 'verify@example.test', password: 'long-enough-1', consents: { terms: true, consent_pd: true } })
    assert.equal(reg.status, 200)
    assert.equal(reg.json.user.emailVerified, false)
    const outbox = readFileSync(join(dir, 'outbox.log'), 'utf8')
    assert.match(outbox, /to=verify@example\.test subject=Подтвердите адрес почты/)
    assert.equal((await call('POST', '/api/auth/verify', { token: 'nope' })).status, 410)
    const { createHash } = await import('node:crypto')
    const uid = db.prepare("SELECT id FROM users WHERE email = 'verify@example.test'").get().id
    assert.equal(db.prepare('SELECT COUNT(*) c FROM email_verifications WHERE user_id = ?').get(uid).c, 1)
    // токен в журнале замаскирован, поэтому подменяем хеш известным значением
    db.prepare('UPDATE email_verifications SET token_hash = ? WHERE user_id = ?').run(createHash('sha256').update('known-token').digest('hex'), uid)
    assert.equal((await call('POST', '/api/auth/verify', { token: 'known-token' })).status, 200)
    assert.equal((await call('GET', '/api/me')).json.user.emailVerified, true)
    assert.equal((await call('POST', '/api/me/resend-verification', {})).json.verified, true)
    assert.equal((await call('POST', '/api/auth/verify', { token: 'known-token' })).status, 410, 'one-time')
    assert.equal((await call('DELETE', '/api/me/account', { password: 'long-enough-1' })).status, 200)
  })

  await step('/health answers, bad JSON is a 400 not a 500, errors go to a private log without bodies (M-47)', async () => {
    const h = await call('GET', '/health')
    assert.equal(h.json.ok, true)
    const bad = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'x-app': '1', 'content-type': 'application/json' }, body: '{oops' })
    assert.equal(bad.status, 400)
    const { logError } = await import('../server/errlog.js')
    const origErr = console.error
    console.error = () => {}
    logError(new Error('проверка журнала'), { method: 'POST', path: '/api/x', body: { password: 'секрет' } })
    console.error = origErr
    const f = join(dir, 'errors.log')
    assert.equal(statSync(f).mode & 0o777, 0o600)
    const t = readFileSync(f, 'utf8')
    assert.match(t, /проверка журнала/)
    assert.ok(!t.includes('секрет'))
  })

  await step('unknown page gives a friendly 404, API 404 stays JSON (M-46)', async () => {
    const page = await call('GET', '/no/such/page')
    assert.equal(page.status, 404)
    assert.match(page.text, /Страница не найдена/)
    const api404 = await call('GET', '/api/no-such-route')
    assert.equal(api404.status, 404)
    assert.equal(api404.json.error, 'not_found')
  })

  await step('feedback message is stored, survey appears on day 14 and is answered once (M-52, M-53)', async () => {
    await call('POST', '/api/auth/logout', {})
    await call('POST', '/api/auth/register', { name: 'Отзыв Тестов', email: 'fb@example.test', password: 'long-enough-1', consents: { terms: true, consent_pd: true } })
    assert.equal((await call('POST', '/api/feedback', { text: '' })).status, 400)
    assert.equal((await call('POST', '/api/feedback', { text: 'Не нашла, где менять время приёма' })).status, 200)
    assert.equal((await call('GET', '/api/me')).json.user.surveyDue, false, 'not before day 14')
    db.prepare("UPDATE users SET created_at = ? WHERE email = 'fb@example.test'").run(`${addDays(today, -15)}T00:00:00.000Z`)
    assert.equal((await call('GET', '/api/me')).json.user.surveyDue, true, 'due after 14 days')
    assert.equal((await call('POST', '/api/survey', { ease: 9 })).status, 400)
    assert.equal((await call('POST', '/api/survey', { ease: 4, recommend: true, blocker: 'Забываю открыть' })).status, 200)
    assert.equal((await call('POST', '/api/survey', { ease: 5 })).status, 409, 'once')
    assert.equal((await call('GET', '/api/me')).json.user.surveyDue, false)
    assert.equal(count('feedback', "kind = 'message'"), 1)
    assert.equal(count('events', "name = 'feedback_sent'"), 1)
    assert.equal((await call('DELETE', '/api/me/account', { password: 'long-enough-1' })).status, 200)
    assert.equal(count('feedback', "kind IN ('message','survey')"), 0, 'removed with the account')
  })

  await step('wrong password rejected', async () => {
    cookie = ''
    assert.equal((await call('POST', '/api/auth/login', { email: 't@example.test', password: 'nope-nope-1' })).status, 401)
  })
  await step('login', async () => assert.equal((await call('POST', '/api/auth/login', { email: 't@example.test', password: 'long-enough-1' })).status, 200))
  await step('logout', async () => {
    await call('POST', '/api/auth/logout', {})
    assert.equal((await call('GET', '/api/me')).status, 401)
  })
} finally {
  srv.kill('SIGTERM')
  await wait(300)
  rmSync(dir, { recursive: true, force: true })
}
console.log(failed ? `\nПровалено: ${failed}` : '\nВсе проверки пройдены')
process.exit(failed ? 1 : 0)
