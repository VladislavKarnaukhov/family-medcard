// Распознавание бланка через Claude. По умолчанию выключено.
// Включение: ANTHROPIC_API_KEY=... AI_RECOGNITION=1 npm run server
//
// Важно по закону: бланк с данными о здоровье уходит стороннему сервису за пределы РФ.
// Это трансграничная передача (ст. 12 152-ФЗ) и отдельное согласие пользователя; до включения нужно
// пройти юридическую проверку (см. docs/legal/RESEARCH.md). Запрос без явного согласия сервер отклоняет.
import { FORBIDDEN, RECOGNIZE_SYSTEM, RECOGNIZE_TOOL, RECOGNIZE_USER } from './prompts.js'

export const aiEnabled = () => process.env.AI_RECOGNITION === '1' && !!process.env.ANTHROPIC_API_KEY

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// Ответ модели — недоверенные данные: проверяем форму и отбрасываем лишнее.
export function sanitize(input) {
  const out = { isLabForm: input?.isLabForm === true, date: null, labName: null, rows: [], warnings: [] }
  if (typeof input?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) out.date = input.date
  const lab = text(input?.labName, 120)
  out.labName = lab && !FORBIDDEN.test(lab) ? lab : null
  let skipped = 0
  for (const r of Array.isArray(input?.rows) ? input.rows.slice(0, 150) : []) {
    const value = num(r?.value)
    const name = text(r?.name, 160)
    if (value == null || !name) {
      skipped++
      continue
    }
    const note = text(r?.note, 200)
    out.rows.push({
      name,
      value,
      unit: text(r?.unit, 30),
      refLow: num(r?.refLow),
      refHigh: num(r?.refHigh),
      confidence: r?.confidence === 'low' ? 'low' : 'high',
      note: note && !FORBIDDEN.test(note) ? note : '',
    })
  }
  if (skipped) out.warnings.push(`Пропущено строк с нечитаемым значением: ${skipped}`)
  for (const w of Array.isArray(input?.warnings) ? input.warnings.slice(0, 30) : []) {
    const t = text(w, 200)
    if (t && !FORBIDDEN.test(t)) out.warnings.push(t)
  }
  return out
}

export async function recognizeWithClaude(buffer, mime) {
  const block =
    mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: mime, data: buffer.toString('base64') } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data: buffer.toString('base64') } }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: RECOGNIZE_SYSTEM,
      tools: [RECOGNIZE_TOOL],
      tool_choice: { type: 'tool', name: RECOGNIZE_TOOL.name },
      messages: [{ role: 'user', content: [block, { type: 'text', text: RECOGNIZE_USER }] }],
    }),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`Сервис распознавания ответил ${res.status}`)
  const data = await res.json()
  const call = data.content?.find((c) => c.type === 'tool_use' && c.name === RECOGNIZE_TOOL.name)
  if (!call) throw new Error('Сервис распознавания не вернул результат')
  return sanitize(call.input)
}
