// Журнал ошибок сервера: DATA_DIR/errors.log, по строке JSON. Без тела запроса, заголовков и параметров адреса.
import { appendFileSync, chmodSync, existsSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './db.js'

const MAX = 5 * 1024 * 1024

export function logError(err, req) {
  console.error(err)
  try {
    const file = join(DATA_DIR, 'errors.log')
    if (existsSync(file) && statSync(file).size > MAX) renameSync(file, `${file}.1`)
    const line = { at: new Date().toISOString(), method: req?.method, path: req?.path, message: String(err?.message || err).slice(0, 300), stack: String(err?.stack || '').split('\n').slice(1, 4).map((s) => s.trim()) }
    appendFileSync(file, JSON.stringify(line) + '\n', { mode: 0o600 })
    chmodSync(file, 0o600)
  } catch {
    /* журнал недоступен: ошибка уже в консоли */
  }
}
