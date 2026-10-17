// Распознавание бланка вынесено в одну функцию.
// Чтобы подключить настоящий ИИ, добавьте провайдер в PROVIDERS и укажите его в ACTIVE_PROVIDER.
//
// Контракт провайдера: async (file: File, ctx: { index: number }) =>
//   { date: 'YYYY-MM-DD', labName: string,
//     rows: [{ name, value, unit, refLow, refHigh }] }

import { localISO } from './format'

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

// Заглушка: не читает файл, возвращает пример бланка.
// Чётные файлы — общий анализ крови, нечётные — биохимия.
const mockProvider = async (file, { index }) => {
  await new Promise((r) => setTimeout(r, 900))
  return index % 2 === 0 ? SAMPLE_BLOOD_COUNT() : SAMPLE_BIOCHEMISTRY()
}

export const PROVIDERS = {
  mock: mockProvider,
  // claude: async (file) => { /* отправить файл на ваш сервер, который вызывает ИИ */ },
}

export const ACTIVE_PROVIDER = 'mock'
export const IS_MOCK = ACTIVE_PROVIDER === 'mock'

export async function recognize(files) {
  const provider = PROVIDERS[ACTIVE_PROVIDER]
  const out = []
  for (let i = 0; i < files.length; i++) {
    const r = await provider(files[i], { index: i })
    out.push({ ...r, sourceFile: files[i].name })
  }
  return out
}
