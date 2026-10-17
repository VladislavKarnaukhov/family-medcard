// Справочник показателей: единицы, пересчёт и нейтральные пояснения.
// `alt` — другие единицы; canonicalValue = value * factor.

export const GROUPS = ['Общий анализ крови', 'Биохимия', 'Гормоны и витамины']

export const INDICATORS = [
  {
    key: 'hgb', group: GROUPS[0], name: 'Гемоглобин', abbr: 'Hb', unit: 'г/л',
    alt: [{ units: ['г/дл', 'g/dl'], factor: 10 }],
    aliases: ['гемоглобин', 'hgb', 'hb'],
    about: 'Белок в эритроцитах, который переносит кислород. Анализ показывает его количество в крови.',
  },
  {
    key: 'rbc', group: GROUPS[0], name: 'Эритроциты', abbr: 'RBC', unit: '10¹²/л',
    alt: [{ units: ['млн/мкл', 'м/мкл'], factor: 1 }],
    aliases: ['эритроциты', 'rbc'],
    about: 'Красные клетки крови. Показатель отражает их количество в литре крови.',
  },
  {
    key: 'wbc', group: GROUPS[0], name: 'Лейкоциты', abbr: 'WBC', unit: '10⁹/л',
    alt: [{ units: ['тыс/мкл', 'тыс/мкл.', 'к/мкл'], factor: 1 }],
    aliases: ['лейкоциты', 'wbc'],
    about: 'Белые клетки крови, часть иммунной системы. Показатель отражает их количество в литре крови.',
  },
  {
    key: 'plt', group: GROUPS[0], name: 'Тромбоциты', abbr: 'PLT', unit: '10⁹/л',
    alt: [{ units: ['тыс/мкл', 'к/мкл'], factor: 1 }],
    aliases: ['тромбоциты', 'plt'],
    about: 'Клетки крови, участвующие в свёртывании. Показатель отражает их количество в литре крови.',
  },
  {
    key: 'hct', group: GROUPS[0], name: 'Гематокрит', abbr: 'HCT', unit: '%',
    alt: [], aliases: ['гематокрит', 'hct'],
    about: 'Доля объёма крови, которую занимают клетки крови (в основном эритроциты).',
  },
  {
    key: 'esr', group: GROUPS[0], name: 'Скорость оседания эритроцитов', abbr: 'СОЭ', unit: 'мм/ч',
    alt: [], aliases: ['соэ', 'скорость оседания эритроцитов', 'esr'],
    about: 'Показывает, как быстро эритроциты оседают в пробирке за час. Зависит от многих факторов.',
  },
  {
    key: 'mcv', group: GROUPS[0], name: 'Средний объём эритроцита', abbr: 'MCV', unit: 'фл',
    alt: [], aliases: ['средний объем эритроцита', 'средний объём эритроцита', 'mcv'],
    about: 'Средний размер эритроцитов, выраженный в фемтолитрах.',
  },
  {
    key: 'glu', group: GROUPS[1], name: 'Глюкоза', abbr: 'GLU', unit: 'ммоль/л',
    alt: [{ units: ['мг/дл', 'mg/dl'], factor: 0.0555 }],
    aliases: ['глюкоза', 'сахар', 'glucose', 'glu'],
    about: 'Основной источник энергии для клеток. Показатель отражает уровень сахара в крови на момент забора.',
  },
  {
    key: 'chol', group: GROUPS[1], name: 'Холестерин общий', abbr: 'CHOL', unit: 'ммоль/л',
    alt: [{ units: ['мг/дл', 'mg/dl'], factor: 0.02586 }],
    aliases: ['холестерин общий', 'холестерин', 'cholesterol', 'chol'],
    about: 'Жироподобное вещество, необходимое организму. Общий холестерин — сумма его фракций в крови.',
  },
  {
    key: 'ldl', group: GROUPS[1], name: 'Холестерин ЛПНП', abbr: 'LDL', unit: 'ммоль/л',
    alt: [{ units: ['мг/дл', 'mg/dl'], factor: 0.02586 }],
    aliases: ['холестерин лпнп', 'лпнп', 'ldl', 'холестерин ldl'],
    about: 'Холестерин в составе липопротеинов низкой плотности — одной из фракций холестерина.',
  },
  {
    key: 'hdl', group: GROUPS[1], name: 'Холестерин ЛПВП', abbr: 'HDL', unit: 'ммоль/л',
    alt: [{ units: ['мг/дл', 'mg/dl'], factor: 0.02586 }],
    aliases: ['холестерин лпвп', 'лпвп', 'hdl', 'холестерин hdl'],
    about: 'Холестерин в составе липопротеинов высокой плотности — одной из фракций холестерина.',
  },
  {
    key: 'tg', group: GROUPS[1], name: 'Триглицериды', abbr: 'TG', unit: 'ммоль/л',
    alt: [{ units: ['мг/дл', 'mg/dl'], factor: 0.01129 }],
    aliases: ['триглицериды', 'triglycerides', 'tg'],
    about: 'Жиры крови, один из источников энергии. Уровень зависит в том числе от питания перед забором.',
  },
  {
    key: 'alt', group: GROUPS[1], name: 'Аланинаминотрансфераза', abbr: 'АЛТ', unit: 'Ед/л',
    alt: [{ units: ['ме/л', 'u/l', 'iu/l'], factor: 1 }],
    aliases: ['алт', 'аланинаминотрансфераза', 'alt'],
    about: 'Фермент, который содержится преимущественно в клетках печени. Определяется в крови.',
  },
  {
    key: 'ast', group: GROUPS[1], name: 'Аспартатаминотрансфераза', abbr: 'АСТ', unit: 'Ед/л',
    alt: [{ units: ['ме/л', 'u/l', 'iu/l'], factor: 1 }],
    aliases: ['аст', 'аспартатаминотрансфераза', 'ast'],
    about: 'Фермент, который содержится в клетках печени, сердца и мышц. Определяется в крови.',
  },
  {
    key: 'crea', group: GROUPS[1], name: 'Креатинин', abbr: 'CREA', unit: 'мкмоль/л',
    alt: [{ units: ['мг/дл', 'mg/dl'], factor: 88.4 }],
    aliases: ['креатинин', 'creatinine', 'crea'],
    about: 'Продукт обмена в мышцах, выводится почками. Его количество в крови зависит в том числе от мышечной массы.',
  },
  {
    key: 'crp', group: GROUPS[1], name: 'С-реактивный белок', abbr: 'СРБ', unit: 'мг/л',
    alt: [{ units: ['мг/дл', 'mg/dl'], factor: 10 }],
    aliases: ['с реактивный белок', 'срб', 'crp', 'c reactive protein'],
    about: 'Белок, количество которого в крови меняется при воспалительных процессах разной природы.',
  },
  {
    key: 'hba1c', group: GROUPS[1], name: 'Гликированный гемоглобин', abbr: 'HbA1c', unit: '%',
    alt: [], aliases: ['гликированный гемоглобин', 'гемоглобин гликированный', 'hba1c', 'hb a1c'],
    about: 'Доля гемоглобина, связанного с глюкозой. Отражает средний уровень глюкозы примерно за последние 2–3 месяца.',
  },
  {
    key: 'fer', group: GROUPS[2], name: 'Ферритин', abbr: 'FER', unit: 'мкг/л',
    alt: [{ units: ['нг/мл', 'ng/ml'], factor: 1 }],
    aliases: ['ферритин', 'ferritin'],
    about: 'Белок, в котором организм хранит железо. Определяется в крови.',
  },
  {
    key: 'fe', group: GROUPS[2], name: 'Железо сывороточное', abbr: 'Fe', unit: 'мкмоль/л',
    alt: [{ units: ['мкг/дл', 'ug/dl'], factor: 0.179 }],
    aliases: ['железо сывороточное', 'железо', 'iron'],
    about: 'Количество железа, циркулирующего в крови на момент забора. Заметно меняется в течение суток.',
  },
  {
    key: 'vitd', group: GROUPS[2], name: 'Витамин D (25-OH)', abbr: '25(OH)D', unit: 'нг/мл',
    alt: [{ units: ['нмоль/л', 'nmol/l'], factor: 0.4006 }],
    aliases: ['витамин d', '25 oh', '25 oh d', '25 гидроксивитамин d', 'витамин d 25 oh', '25 он витамин d'],
    about: 'Основная форма витамина D в крови. Отражает его поступление с пищей и образование в коже.',
  },
  {
    key: 'tsh', group: GROUPS[2], name: 'Тиреотропный гормон', abbr: 'ТТГ', unit: 'мЕд/л',
    alt: [{ units: ['мкме/мл', 'miu/l', 'мкме/л', 'μiu/ml', 'uiu/ml'], factor: 1 }],
    aliases: ['ттг', 'тиреотропный гормон', 'tsh'],
    about: 'Гормон гипофиза, который регулирует работу щитовидной железы.',
  },
]

const byKey = Object.fromEntries(INDICATORS.map((i) => [i.key, i]))

const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' }
export const unitKey = (u) =>
  String(u || '')
    .toLowerCase()
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => SUP[c])
    .replace(/[\s×x*^.]/g, '')
    .replace('μ', 'мк')

const tokens = (s) => ' ' + String(s || '').toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').trim() + ' '

export function getIndicator(key) {
  return byKey[key] || null
}

export function findIndicator(name) {
  const t = tokens(name)
  let best = null
  let bestLen = 0
  for (const ind of INDICATORS) {
    for (const a of ind.aliases) {
      const at = tokens(a)
      if (t.includes(at) && at.length > bestLen) {
        best = ind
        bestLen = at.length
      }
    }
  }
  return best
}

const round = (n) => Number(Number(n).toPrecision(4))

// Приводит значение к основной единице показателя.
export function convert(ind, value, unit) {
  if (!ind || value == null || !Number.isFinite(value)) return { value, unit, converted: false }
  if (!unit || unitKey(unit) === unitKey(ind.unit)) return { value, unit: ind.unit, converted: false }
  for (const a of ind.alt) {
    if (a.units.some((u) => unitKey(u) === unitKey(unit))) {
      return { value: round(value * a.factor), unit: ind.unit, converted: a.factor !== 1 || unitKey(unit) !== unitKey(ind.unit) }
    }
  }
  return { value, unit, converted: false }
}

export const customKey = (name) => 'custom:' + tokens(name).trim()

// Поля Measurement, вычисляемые по введённым данным.
export function normalizeRow({ name, value, unit }) {
  const ind = findIndicator(name)
  if (!ind) return { indicatorKey: customKey(name), normalizedValue: value, normalizedUnit: unit }
  const c = convert(ind, value, unit)
  return { indicatorKey: ind.key, normalizedValue: c.value, normalizedUnit: c.unit }
}
