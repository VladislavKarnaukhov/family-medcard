// Распознавание бланка через ИИ вынесено в одну функцию и выключено по умолчанию.
//
// Включение на сервере: ANTHROPIC_API_KEY и AI_RECOGNITION=1 (промпт: server/prompts.js). Бланк уходит стороннему
// сервису за границу, поэтому клиент даёт отдельное согласие на каждую отправку (consent_ai).
// Без ИИ показатели вносит человек: сам клиент рядом с бланком либо помощник.
//
// Результат: { date: 'ГГГГ-ММ-ДД', labName, rows: [{ name, value, unit, refLow, refHigh }], warnings, sourceFile, ai }

import { localISO } from './format'
import { ApiError, api } from './api'

const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }

async function recognizeFile(file, { profileId }) {
  const type = file.type || MIME_BY_EXT[file.name.split('.').pop().toLowerCase()] || 'application/octet-stream'
  const res = await fetch(`/api/recognize?profileId=${encodeURIComponent(profileId)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-app': '1', 'x-consent-ai': '1', 'content-type': type },
    body: file,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(data?.error || 'Не удалось распознать бланк', res.status)
  if (!data.isLabForm) throw new ApiError(data.warnings?.[0] || 'Это не похоже на бланк анализа', 422)
  return {
    date: data.date || localISO(),
    labName: data.labName || '',
    // Строки с низкой уверенностью получают пометку в названии, чтобы их проверили.
    rows: data.rows.map((r) => ({ ...r, name: r.confidence === 'low' ? `${r.name} (проверьте)` : r.name })),
    warnings: data.warnings,
    ai: true,
  }
}

export async function getFeatures() {
  try {
    return await api('GET', '/api/features')
  } catch {
    return { aiRecognition: false }
  }
}

// Только с согласием пользователя на отправку бланка ИИ-сервису; profileId нужен серверу для проверки прав.
export async function recognize(files, { profileId }) {
  const out = []
  for (const file of files) out.push({ ...(await recognizeFile(file, { profileId })), sourceFile: file.name })
  return out
}
