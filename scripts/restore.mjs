// Восстановление из резервной копии: npm run restore -- <blizkie-ДАТА.db> [--force]
// Сервер должен быть остановлен. Целевой каталог: DATA_DIR или server/data. Файлы берутся из папки uploads рядом с копией.
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(process.env.DATA_DIR || join(here, '..', 'server', 'data'))
const src = process.argv.slice(2).find((a) => !a.startsWith('--'))
const force = process.argv.includes('--force')
const die = (m) => (console.error('Ошибка:', m), process.exit(1))

if (!src || !existsSync(src)) die('укажите файл копии: npm run restore -- путь/к/blizkie-ГГГГ-ММ-ДД.db')
const check = new DatabaseSync(resolve(src), { readOnly: true })
const integrity = check.prepare('PRAGMA integrity_check').get().integrity_check
const users = check.prepare('SELECT COUNT(*) c FROM users').get().c
check.close()
if (integrity !== 'ok') die('копия повреждена: ' + integrity)

mkdirSync(target, { recursive: true })
const dbFile = join(target, 'blizkie.db')
if (existsSync(dbFile)) {
  if (!force) die(`в ${target} уже есть база. Остановите сервер и добавьте --force: текущая база будет сохранена рядом.`)
  renameSync(dbFile, `${dbFile}.before-restore-${Date.now()}`)
}
for (const ext of ['-wal', '-shm']) rmSync(dbFile + ext, { force: true })
copyFileSync(resolve(src), dbFile)

const upSrc = join(dirname(resolve(src)), 'uploads')
let files = 0
if (existsSync(upSrc)) {
  mkdirSync(join(target, 'uploads'), { recursive: true })
  for (const f of readdirSync(upSrc)) {
    const to = join(target, 'uploads', f)
    if (!existsSync(to)) (copyFileSync(join(upSrc, f), to), files++)
  }
}
console.log(`Восстановлено в ${target}: целостность ok, пользователей ${users}, файлов докопировано ${files}. Запустите сервер.`)
