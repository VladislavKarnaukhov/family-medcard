// Распознавание бланка вынесено в одну функцию.
//
// Два провайдера:
//  - mock: заглушка с примером бланка (по умолчанию);
//  - server: запрос к серверу, который вызывает Claude (промпт: server/prompts.js). Включается на сервере
//    переменными ANTHROPIC_API_KEY и AI_RECOGNITION=1 и только при явном согласии пользователя на каждую отправку.
//
// Результат одинаковый: { date: 'ГГГГ-ММ-ДД', labName, rows: [{ name, value, unit, refLow, refHigh }], sourceFile, ai }

import { localISO } from './format'
import { ApiError, api } from './api'

const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localISO(d)
}

const row = (name, value, unit, refLow, refHigh) => ({ name, value, unit, refLow, refHigh })

const SAMPLE_BLOOD_COUNT = () => ({
  date: daysAgo(3),
  labName: 'ЛабДиагностика',
  rows: [
    row('Гемоглобин (HGB)', 138, 'г/л', 120, 140),
    row('Эритроциты (RBC)', 4.5, '10¹²/л', 3.8, 5.1),
    row('Лейкоциты (WBC)', 6.7, '10⁹/л', 4, 9),
    row('Тромбоциты (PLT)', 268, '10⁹/л', 150, 400),
    row('Гематокрит (HCT)', 41, '%', 35, 45),
    row('СОЭ', 22, 'мм/ч', 2, 20),
    row('Средний объём эритроцита (MCV)', 89, 'фл', 80, 100),
  ],
})

const SAMPLE_BIOCHEMISTRY = () => ({
  date: daysAgo(3),
  labName: 'МедЛаб Север',
  rows: [
    row('Глюкоза', 98, 'мг/дл', 70, 110),
    row('Холестерин общий', 215, 'мг/дл', 0, 200),
    row('Холестерин ЛПНП', 128, 'мг/дл', 0, 115),
    row('Холестерин ЛПВП', 58, 'мг/дл', 40, null),
    row('Триглицериды', 130, 'мг/дл', 0, 150),
    row('АЛТ', 27, 'Ед/л', 0, 33),
    row('АСТ', 24, 'Ед/л', 0, 32),
    row('Креатинин', 0.9, 'мг/дл', 0.5, 0.9),
    row('Ферритин', 34, 'нг/мл', 13, 150),
    row('Витамин D (25-OH)', 62, 'нмоль/л', 75, 250),
  ],
})

// Заглушка: не читает файл, возвращает пример бланка. Чётные файлы — общий анализ крови, нечётные — биохимия.
const mockProvider = async (file, { index }) => {
  await new Promise((r) => setTimeout(r, 900))
  return { ...(index % 2 === 0 ? SAMPLE_BLOOD_COUNT() : SAMPLE_BIOCHEMISTRY()), ai: false }
}

const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }

// Реальное распознавание на сервере. Строки с низкой уверенностью получают пометку в названии, чтобы их проверили.
const serverProvider = async (file, { profileId }) => {
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
    rows: data.rows.map((r) => ({ ...r, name: r.confidence === 'low' ? `${r.name} (проверьте)` : r.name })),
    warnings: data.warnings,
    ai: true,
  }
}

export const PROVIDERS = { mock: mockProvider, server: serverProvider }

export async function getFeatures() {
  try {
    return await api('GET', '/api/features')
  } catch {
    return { aiRecognition: false }
  }
}

// opts.ai — пользователь дал согласие на отправку бланка ИИ-сервису; opts.profileId нужен серверу для проверки прав.
export async function recognize(files, opts = {}) {
  const provider = opts.ai ? PROVIDERS.server : PROVIDERS.mock
  const out = []
  for (let i = 0; i < files.length; i++) {
    const r = await provider(files[i], { index: i, profileId: opts.profileId })
    out.push({ ...r, sourceFile: files[i].name })
  }
  return out
}
