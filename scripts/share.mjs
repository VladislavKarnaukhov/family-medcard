// Запускает сайт и открывает его в интернет через бесплатный туннель Cloudflare (без регистрации и карты).
// Использование: npm run share            (сборка, сервер, туннель)
//                npm run share -- --no-tunnel   (только сборка и сервер на :3000)
// Адрес туннеля меняется при каждом запуске. Сайт работает, пока запущена эта команда.
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
  const t = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], { stdio: ['ignore', 'ignore', 'pipe'] })
  children.push(t)
  t.on('exit', () => {
    console.error('Туннель остановился.')
    stop(1)
  })
  publicUrl = await new Promise((resolve) => {
    let buf = ''
    const timer = setTimeout(() => resolve(null), 40000)
    t.stderr.on('data', (d) => {
      buf += d
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf)
      if (m) (clearTimeout(timer), resolve(m[0]))
    })
  })
  if (!publicUrl) {
    console.error('Не удалось получить адрес туннеля за 40 секунд. Проверьте интернет и повторите.')
    stop(1)
  }
}

const smtp = existsSync('.env') && /^SMTP_HOST=.+/m.test(readFileSync('.env', 'utf8'))
const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', TRUST_PROXY: '1' }
if (publicUrl) env.APP_URL = publicUrl
// Строгий режим включаем, только если настроена почта: иначе коды подтверждения негде показать.
if (smtp) env.NODE_ENV = 'production'

const server = spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.js'], { stdio: 'inherit', env })
children.push(server)
server.on('exit', (c) => stop(c || 0))

// Чтобы Mac не засыпал, пока сайт открыт.
if (process.platform === 'darwin') children.push(spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' }))

await new Promise((r) => setTimeout(r, 1500))
const base = publicUrl || `http://localhost:${PORT}`
say(`Сайт открыт:\n  Клиенты:     ${base}/\n  Сотрудники:  ${base}/staff/`)
if (!smtp) say('Почта не настроена: коды подтверждения показываются на экране. Выставляйте только тестовые данные.')
say('Остановить: Ctrl+C. Данные лежат в server/data.')
