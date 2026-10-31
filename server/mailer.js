// Отправка писем через SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM).
// Без SMTP письма не уходят. В режиме разработки они пишутся в server/data/outbox.log (права 600, коды и токены замаскированы),
// в production без SMTP сервер не запускается.
import nodemailer from 'nodemailer'
import { appendFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './db.js'

export const mailEnabled = () => !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS
export const isProd = () => process.env.NODE_ENV === 'production'
// Сервер без почты в production бесполезен (коды подписи и сброс пароля не дойдут), поэтому не стартуем молча.
export function assertMailConfigured() {
  if (isProd() && !mailEnabled()) {
    console.error('Ошибка запуска: в production нужна настроенная почта. Задайте SMTP_HOST, SMTP_USER, SMTP_PASS (и MAIL_FROM) в .env или в окружении. См. .env.example.')
    process.exit(1)
  }
}

// В журнал разработки не попадают рабочие секреты: 6-значные коды и токены в ссылках.
export const maskSecrets = (t) =>
  String(t)
    .replace(/\b\d{6}\b/g, '******')
    .replace(/([?&#/=])([A-Za-z0-9_-]{16,})/g, (_, d, tk) => `${d}${tk.slice(0, 3)}…`)

export const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')

let transport
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 587
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
    })
  }
  return transport
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Письмо в стиле продукта: индиго-шапка, один призыв к действию.
export function layout({ title, lines, cta, footer }) {
  const body = lines.map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#26332f">${esc(l)}</p>`).join('')
  const button = cta
    ? `<p style="margin:22px 0 6px"><a href="${esc(cta.url)}" style="display:inline-block;background:#1b6b58;color:#fff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:10px">${esc(cta.label)}</a></p><p style="margin:0;font-size:13px;color:#5b6180;word-break:break-all">${esc(cta.url)}</p>`
    : ''
  return `<!doctype html><html lang="ru"><body style="margin:0;background:#f8f5ef;font-family:Arial,Helvetica,sans-serif"><div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#1b6b58;color:#fff;padding:18px 24px;border-radius:14px 14px 0 0;font-size:20px;font-weight:700">Близкие</div><div style="background:#fff;padding:26px 24px;border-radius:0 0 14px 14px"><h1 style="margin:0 0 16px;font-size:21px;color:#26332f">${esc(title)}</h1>${body}${button}<p style="margin:26px 0 0;font-size:12px;color:#8a8577">${esc(footer || 'Сервис не заменяет консультацию врача. Если вы не ожидали это письмо, просто проигнорируйте его.')}</p></div></div></body></html>`
}

export async function sendMail({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || 'Близкие <no-reply@localhost>'
  if (!mailEnabled()) {
    if (!isProd()) {
      const file = join(DATA_DIR, 'outbox.log')
      appendFileSync(file, `${new Date().toISOString()} to=${to} subject=${subject}\n${maskSecrets(text)}\n---\n`, { mode: 0o600 })
      chmodSync(file, 0o600)
    }
    return { sent: false }
  }
  await getTransport().sendMail({ from, to, subject, text, html })
  return { sent: true }
}

// Фоновая отправка: ошибка не ломает запрос, но попадает в журнал сервера.
export function sendMailSoon(msg) {
  sendMail(msg).catch((e) => console.error('mail:', e.message))
}
