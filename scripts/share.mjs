// Запускает сайт и открывает его в интернет через бесплатный туннель Cloudflare (без регистрации и карты).
// Использование: npm run share            (сборка, сервер, туннель)
//                npm run share -- --no-tunnel   (только сборка и сервер на :3000)
// Адрес туннеля меняется при каждом запуске. Сайт работает, пока запущена эта команда.
import nodemailer from 'nodemailer'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createConnection } from 'node:net'

const PORT = Number(process.env.PORT) || 3000
const noTunnel = process.argv.includes('--no-tunnel')
const children = []
const stop = (code = 0) => {
  for (const c of children) c.kill('SIGTERM')
  process.exit(code)
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

const portBusy = () =>
  new Promise((resolve) => {
    const s = createConnection({ port: PORT, host: '127.0.0.1' })
    s.on('connect', () => (s.destroy(), resolve(true)))
    s.on('error', () => resolve(false))
  })

const say = (t) => console.log(`\n${t}`)

if (await portBusy()) {
  console.error(`Порт ${PORT} уже занят (возможно, сервер уже запущен). Остановите его и повторите.`)
  process.exit(1)
}

if (!noTunnel && spawnSync('cloudflared', ['--version'], { stdio: 'ignore' }).status !== 0) {
  console.error('Не найден cloudflared. Установите его одной командой:\n\n  brew install cloudflared\n\nи запустите снова. Без туннеля: npm run share -- --no-tunnel')
  process.exit(1)
}

say('Собираю приложение…')
const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' })
if (build.status !== 0) process.exit(build.status || 1)

// Туннель стартует первым, чтобы знать публичный адрес для ссылок в письмах.
let publicUrl = null
if (!noTunnel) {
  say('Открываю туннель…')
  const t = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--protocol', process.env.TUNNEL_PROTOCOL || 'http2', '--url', `http://127.0.0.1:${PORT}`], { stdio: ['ignore', 'ignore', 'pipe'] })
  children.push(t)
  t.on('exit', () => {
    console.error('Туннель остановился.')
    stop(1)
  })
  let log = ''
  const waitFor = (re, ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), ms)
      const check = () => {
        const m = re.exec(log)
        if (m) (clearTimeout(timer), resolve(m[0]))
      }
      t.stderr.on('data', (d) => ((log += d), check()))
      check()
    })
  publicUrl = await waitFor(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/, 40000)
  // Адрес выдаётся сразу, но работает только после соединения с сетью Cloudflare.
  const connected = publicUrl && (await waitFor(/Registered tunnel connection/, 40000))
  if (!publicUrl || !connected) {
    console.error('Туннель не смог соединиться с Cloudflare. Последние строки журнала:\n' + log.split('\n').slice(-8).join('\n'))
    console.error('\nПроверьте интернет или попробуйте другой протокол: TUNNEL_PROTOCOL=quic npm run share')
    stop(1)
  }
}

const envText = existsSync('.env') ? readFileSync('.env', 'utf8') : ''
const envVar = (k) => new RegExp(`^${k}=(.*)$`, 'm').exec(envText)?.[1]?.trim().replace(/^["']|["']$/g, '')
// Настоящая проверка входа на почтовый сервер: открытого порта мало (сервис может не пускать IP или ключ).
const smtpCheck = async () => {
  const port = Number(envVar('SMTP_PORT')) || 587
  const t = nodemailer.createTransport({ host: envVar('SMTP_HOST'), port, secure: port === 465, auth: { user: envVar('SMTP_USER'), pass: envVar('SMTP_PASS') }, connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 30000 })
  try {
    await t.verify()
    return ''
  } catch (e) {
    return /Unauthorized IP/i.test(e.message) ? 'Почтовый сервис не пускает этот IP (Brevo: Security, Authorized IPs).' : e.message
  }
}

const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', TRUST_PROXY: '1' }
if (publicUrl) env.APP_URL = publicUrl

// Почта: если сервер SMTP из этой сети недоступен, письма не уйдут, а клиент не сможет подписать согласие.
// Тогда запускаем без почты: код подтверждения показывается на экране (только для тестовых данных).
let smtp = !!envVar('SMTP_HOST')
let mailNote = ''
const smtpProblem = smtp ? await smtpCheck() : ''
if (smtp && smtpProblem) {
  smtp = false
  Object.assign(env, { SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' })
  mailNote = `Почта не работает (${smtpProblem}). Письма не уйдут, коды подтверждения показываются на экране. Проверка: npm run mail:test`
}
// Строгий режим включаем, только если почта работает: иначе коды подтверждения негде показать.
if (smtp) env.NODE_ENV = 'production'

const server = spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.js'], { stdio: 'inherit', env })
children.push(server)
server.on('exit', (c) => stop(c || 0))

// Чтобы Mac не засыпал, пока сайт открыт.
if (process.platform === 'darwin') children.push(spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' }))

await new Promise((r) => setTimeout(r, 1500))
const base = publicUrl || `http://localhost:${PORT}`
say(`Сайт открыт:\n  Клиенты:     ${base}/\n  Сотрудники:  ${base}/staff/`)
if (!smtp) say(`${mailNote || 'Почта не настроена: коды подтверждения показываются на экране.'} Выставляйте только тестовые данные.`)
say('Остановить: Ctrl+C. Данные лежат в server/data.')
