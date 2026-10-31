// Кладёт файлы распознавания (воркер, wasm, словари) в public/ocr, чтобы бланки читались на устройстве
// и ничего не загружалось со сторонних адресов. Запускается перед сборкой.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'ocr')
mkdirSync(join(out, 'lang'), { recursive: true })
const nm = join(root, 'node_modules')

const copy = (from, to) => {
  if (!existsSync(from)) throw new Error('нет файла для распознавания: ' + from + ' (выполните npm install)')
  copyFileSync(from, to)
}
copy(join(nm, 'tesseract.js', 'dist', 'worker.min.js'), join(out, 'worker.min.js'))
for (const f of readdirSync(join(nm, 'tesseract.js-core'))) if (/lstm/.test(f) && /\.(js|wasm)$/.test(f)) copy(join(nm, 'tesseract.js-core', f), join(out, f))
for (const l of ['rus', 'eng']) copy(join(nm, '@tesseract.js-data', l, '4.0.0_best_int', `${l}.traineddata.gz`), join(out, 'lang', `${l}.traineddata.gz`))
console.log('Файлы распознавания готовы:', out)
