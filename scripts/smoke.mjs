// Смоук-тест: поднимает сервер на временной базе и проходит основной сценарий через HTTP.
// Запуск: npm test (нужна сборка: npm run build).
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const dir = mkdtempSync(join(tmpdir(), 'blizkie-'))
const port = 4100 + Math.floor(Math.random() * 500)
const base = `http://127.0.0.1:${port}`
const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, DATA_DIR: dir, PORT: String(port), NODE_ENV: 'test', SMTP_HOST: '' }, stdio: 'ignore' })
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
