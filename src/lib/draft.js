// Черновик анализа в форме (строки как текст) и перевод в данные для сервера.
import { parseNum } from './format'

const toText = (n) => (n == null ? '' : String(n).replace('.', ','))

export const SELF_LAB = 'Измерено самостоятельно'

export const emptyRow = () => ({ name: '', value: '', unit: '', refLow: '', refHigh: '' })

export const emptyDraft = (date) => ({ sourceFile: '', date, labName: '', rows: [emptyRow()] })

// Из результата распознавания или из сохранённого анализа.
export const toDraft = (r) => ({
  sourceFile: r.sourceFile || '',
  date: r.date,
  labName: r.labName || '',
  rows: r.rows.map((x) => ({ name: x.name, value: toText(x.value), unit: x.unit || '', refLow: toText(x.refLow), refHigh: toText(x.refHigh) })),
})

export const rowBad = (r) => !r.name.trim() || parseNum(r.value) == null
export const draftBad = (d) => !d.date || !d.labName.trim() || !d.rows.length || d.rows.some(rowBad)

export const draftRows = (d) =>
  d.rows.map((r) => ({
    name: r.name,
    value: parseNum(r.value),
    unit: r.unit,
    refLow: r.refLow.trim() === '' ? null : parseNum(r.refLow),
    refHigh: r.refHigh.trim() === '' ? null : parseNum(r.refHigh),
  }))
