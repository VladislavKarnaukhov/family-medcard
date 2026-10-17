// Резервная копия базы: node server/backup.js [папка]. Файлы документов копируйте отдельно (server/data/uploads).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { db, DATA_DIR } from './db.js'

const dir = process.argv[2] || join(DATA_DIR, 'backups')
mkdirSync(dir, { recursive: true })
const file = join(dir, `blizkie-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
console.log('Резервная копия базы:', file)
console.log('Файлы документов:', join(DATA_DIR, 'uploads'), '(скопируйте папку отдельно)')
