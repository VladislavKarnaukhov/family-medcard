// Создаёт учётные записи сотрудников при первом запуске.
// Пароли генерируются случайно и записываются в server/data/staff-credentials.txt (файл вне git).
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { DATA_DIR } from './db.js'
import { get, hashPassword, nowIso, run, uuid } from './util.js'

const STAFF = [
  ['Анна', 'anna@blizkie.test'],
  ['Михаил', 'mikhail@blizkie.test'],
]

export function ensureStaff() {
  if (get("SELECT id FROM users WHERE role = 'staff' LIMIT 1")) return
  const lines = ['Учётные записи сотрудников (вход: /staff/)', '']
  for (const [name, email] of STAFF) {
    const password = randomBytes(9).toString('base64url')
    run('INSERT INTO users (id, email, name, password, role, created_at) VALUES (?,?,?,?,?,?)', uuid(), email, name, hashPassword(password), 'staff', nowIso())
    lines.push(`${name}: ${email} / ${password}`)
  }
  const path = join(DATA_DIR, 'staff-credentials.txt')
  writeFileSync(path, lines.join('\n') + '\n', { mode: 0o600 })
  console.log(`Созданы учётные записи сотрудников. Данные для входа: ${path}`)
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) ensureStaff()
