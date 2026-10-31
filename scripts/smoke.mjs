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
