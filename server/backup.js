// Резервные копии: ежедневно автоматически (пока работает сервер) и вручную: npm run backup [папка].
// В папке копий: blizkie-ГГГГ-ММ-ДД.db (целостная копия базы) и uploads/ (загруженные файлы, докопируются недостающие).
// Восстановление: npm run restore -- <файл.db> (см. scripts/restore.mjs и README).
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, DATA_DIR, UPLOAD_DIR } from './db.js'

const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14)
const NAME = /^blizkie-\d{4}-\d{2}-\d{2}\.db$/

export function backupNow(dir = process.env.BACKUP_DIR || join(DATA_DIR, 'backups')) {
  mkdirSync(join(dir, 'uploads'), { recursive: true })
  const file = join(dir, `blizkie-${new Date().toISOString().slice(0, 10)}.db`)
  if (existsSync(file)) unlinkSync(file)
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  for (const f of readdirSync(UPLOAD_DIR)) {
    const to = join(dir, 'uploads', f)
    if (!existsSync(to)) copyFileSync(join(UPLOAD_DIR, f), to)
  }
  const old = readdirSync(dir).filter((f) => NAME.test(f)).sort().slice(0, -KEEP)
  for (const f of old) unlinkSync(join(dir, f))
  return { file, pruned: old.length }
}

// При старте и далее раз в час проверяем: если копии за сегодня нет, делаем её.
export function startBackups() {
  if (process.env.BACKUP === '0') return
  const dir = process.env.BACKUP_DIR || join(DATA_DIR, 'backups')
  const tick = () => {
    try {
      if (!existsSync(join(dir, `blizkie-${new Date().toISOString().slice(0, 10)}.db`))) console.log('Резервная копия:', backupNow(dir).file)
    } catch (e) {
      console.error('backup:', e.message)
    }
  }
  tick()
  setInterval(tick, 3600000).unref()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = backupNow(process.argv[2])
  console.log('Резервная копия базы:', r.file)
  console.log('Файлы документов докопированы в:', join(process.argv[2] || join(DATA_DIR, 'backups'), 'uploads'))
}
