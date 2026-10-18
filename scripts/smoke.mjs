// Смоук-тест: поднимает сервер на временной базе и проходит основной сценарий через HTTP.
// Запуск: npm test (нужна сборка: npm run build).
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
