// Проверка почты: npm run mail:test [адрес]. Проверяет вход на SMTP-сервер и отправляет тестовое письмо.
import nodemailer from 'nodemailer'

const to = process.argv[2] || process.env.ADMIN_EMAIL
const need = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !process.env[k])
if (need.length) {
  console.error('Не заданы переменные в .env: ' + need.join(', '))
  process.exit(1)
}
if (!to) {
  console.error('Укажите адрес: npm run mail:test you@example.com (или задайте ADMIN_EMAIL)')
  process.exit(1)
}
const port = Number(process.env.SMTP_PORT) || 587
const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 60000,
  greetingTimeout: 60000,
  socketTimeout: 90000,
})
const hint = (e) =>
  /Unauthorized IP/i.test(e.message) ? 'Сервер почты не пускает этот IP. В Brevo: Security, Authorized IPs, добавьте адрес или отключите ограничение.'
  : /sender|from/i.test(e.message) ? 'Адрес отправителя не подтверждён у почтового сервиса. Подтвердите его в разделе Senders или укажите другой в MAIL_FROM.'
  : e.code === 'EAUTH' ? 'Неверный логин или SMTP-ключ.'
  : e.code === 'ETIMEDOUT' || e.code === 'ESOCKET' ? 'Порт закрыт или соединение блокируется сетью. Для Brevo попробуйте SMTP_PORT=2525.'
  : ''
try {
  await t.verify()
  console.log(`Вход на ${process.env.SMTP_HOST}:${port} выполнен`)
  const r = await t.sendMail({ from: process.env.MAIL_FROM, to, subject: 'Проверка почты «Близкие»', text: 'Если вы видите это письмо, отправка настроена.' })
  console.log('Отправлено на', to, '-', r.response)
} catch (e) {
  console.error('Ошибка:', e.message)
  if (hint(e)) console.error(hint(e))
  process.exit(1)
}
