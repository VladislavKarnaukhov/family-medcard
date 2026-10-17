// Вымышленные демо-данные: семья из трёх человек, анализы за два года из разных лабораторий.
import { getIndicator, normalizeRow } from './indicators'
import { localISO, pad } from './format'

// Референсы лаборатории в основных единицах: [нижняя, верхняя] для взрослого м / ж / ребёнка.
const REFS = {
  hgb: { m: [130, 160], f: [120, 140], c: [115, 145] },
  rbc: { m: [4.3, 5.7], f: [3.8, 5.1], c: [3.9, 5.3] },
  wbc: { m: [4, 9], f: [4, 9], c: [5, 12] },
  plt: { m: [150, 400], f: [150, 400], c: [150, 400] },
  hct: { m: [39, 49], f: [35, 45], c: [34, 42] },
  esr: { m: [2, 15], f: [2, 20], c: [2, 10] },
  glu: { m: [3.9, 6.1], f: [3.9, 6.1], c: [3.3, 5.6] },
  chol: { m: [0, 5.2], f: [0, 5.2], c: [0, 5.2] },
  ldl: { m: [0, 3], f: [0, 3], c: [0, 3] },
  hdl: { m: [1, null], f: [1.2, null], c: [1, null] },
  tg: { m: [0, 1.7], f: [0, 1.7], c: [0, 1.7] },
  alt: { m: [0, 41], f: [0, 33], c: [0, 35] },
  ast: { m: [0, 40], f: [0, 32], c: [0, 40] },
  crea: { m: [62, 106], f: [44, 80], c: [27, 62] },
  crp: { m: [0, 5], f: [0, 5], c: [0, 5] },
  hba1c: { m: [4, 6], f: [4, 6], c: [4, 6] },
  fer: { m: [30, 400], f: [13, 150], c: [15, 80] },
  fe: { m: [11.6, 31.3], f: [9, 30.4], c: [7, 18] },
  vitd: { m: [30, 100], f: [30, 100], c: [30, 100] },
  tsh: { m: [0.4, 4], f: [0.4, 4], c: [0.4, 4] },
}

const sig = (n) => (n == null ? null : Number(Number(n).toPrecision(3)))

// style 'alt' — лаборатория печатает часть показателей в других единицах.
function makeRows(kind, values, style) {
  return Object.entries(values).map(([key, v]) => {
    const ind = getIndicator(key)
    const [lo, hi] = REFS[key][kind]
    const alt = style === 'alt' ? ind.alt.find((a) => a.factor !== 1) : null
    const f = alt ? alt.factor : 1
    const row = {
      name: `${ind.name}${ind.abbr && /^[A-Za-z]/.test(ind.abbr) ? ` (${ind.abbr})` : ''}`,
      value: alt ? sig(v / f) : v,
      unit: alt ? alt.units[0] : ind.unit,
      refLow: alt ? sig(lo / f) : lo,
      refHigh: alt ? sig(hi == null ? null : hi / f) : hi,
    }
    return row
  })
}

const FAMILY = [
  {
    name: 'Я', birthYear: 1987, sex: 'm', kind: 'm',
    notes: 'Хронических заболеваний нет. Лекарства постоянно не принимаю.',
    results: [
      ['2024-12-03', 'ЛабДиагностика', 'si', { hgb: 148, rbc: 4.9, wbc: 6.4, plt: 238, hct: 44, esr: 7, glu: 5.2, chol: 5.6, ldl: 3.4, hdl: 1.3, tg: 1.4, alt: 28, ast: 25 }],
      ['2025-06-18', 'МедЛаб Север', 'alt', { hgb: 146, glu: 5.5, chol: 5.4, ldl: 3.2, hdl: 1.35, tg: 1.5, vitd: 24, fer: 85, tsh: 2.1 }],
      ['2025-12-10', 'ЛабДиагностика', 'si', { hgb: 152, wbc: 5.9, plt: 251, glu: 5.8, chol: 5.8, ldl: 3.6, hdl: 1.25, tg: 1.8, alt: 36, ast: 31, vitd: 29, tsh: 2.4, crp: 1.2 }],
      ['2026-09-05', 'Городская клиника №5', 'si', { hgb: 150, rbc: 5.0, wbc: 6.0, plt: 244, glu: 5.6, chol: 5.2, ldl: 3.1, hdl: 1.4, tg: 1.3, hba1c: 5.4, vitd: 36, fer: 92, tsh: 2.0 }],
    ],
  },
  {
    name: 'Мама', birthYear: 1958, sex: 'f', kind: 'f',
    notes: 'Артериальная гипертензия (со слов). Эналаприл 5 мг утром. Измеряет давление раз в день.',
    results: [
      ['2024-11-12', 'ЛабДиагностика', 'si', { hgb: 126, rbc: 4.3, wbc: 6.8, plt: 262, hct: 38, esr: 16, glu: 5.9, chol: 6.1, ldl: 3.9, hdl: 1.5, tg: 1.6, alt: 24, ast: 26, crea: 72 }],
      ['2025-05-20', 'Городская клиника №5', 'si', { hgb: 122, wbc: 7.2, esr: 18, glu: 6.3, chol: 6.0, ldl: 3.8, hdl: 1.45, tg: 1.9, crea: 76, hba1c: 5.9, fer: 28 }],
      ['2026-01-14', 'МедЛаб Север', 'alt', { hgb: 119, rbc: 4.2, wbc: 6.5, plt: 255, glu: 6.4, chol: 5.8, ldl: 3.6, hdl: 1.5, tg: 1.7, crea: 79, fe: 11, fer: 22, vitd: 20, tsh: 3.1 }],
      ['2026-09-22', 'ЛабДиагностика', 'si', { hgb: 124, wbc: 6.9, plt: 270, esr: 15, glu: 6.0, chol: 5.6, ldl: 3.5, hdl: 1.55, tg: 1.6, alt: 27, ast: 25, crea: 77, hba1c: 5.8, fer: 34, vitd: 27, tsh: 2.9 }],
    ],
  },
  {
    name: 'Сын', birthYear: 2016, sex: 'm', kind: 'c',
    notes: 'Хронических заболеваний нет. Принимает витамин D по назначению педиатра (со слов родителей).',
    results: [
      ['2024-11-25', 'Городская клиника №5', 'si', { hgb: 128, rbc: 4.5, wbc: 7.8, plt: 310, hct: 37, esr: 6, glu: 4.6, alt: 18, ast: 28 }],
      ['2025-04-08', 'МедЛаб Север', 'alt', { hgb: 126, rbc: 4.4, wbc: 9.4, plt: 330, hct: 36, esr: 9, fer: 38, vitd: 22 }],
      ['2026-02-17', 'ЛабДиагностика', 'si', { hgb: 131, wbc: 8.1, plt: 295, glu: 4.8, fer: 41, vitd: 26, crp: 2 }],
      ['2026-09-29', 'Городская клиника №5', 'si', { hgb: 133, rbc: 4.6, wbc: 7.2, plt: 288, hct: 38, esr: 5, glu: 4.9, vitd: 31, fer: 44 }],
    ],
  },
]

// Детерминированный генератор, чтобы демо выглядело одинаково.
function rng(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let n = 0
const id = (p) => `${p}-${++n}`

export function buildDemo() {
  n = 0
  const profiles = []
  const labResults = []
  const measurements = []
  const vitals = []

  for (const f of FAMILY) {
    const pid = id('p')
    profiles.push({ id: pid, name: f.name, birthYear: f.birthYear, sex: f.sex, notes: f.notes })
    for (const [date, labName, style, values] of f.results) {
      const rid = id('r')
      labResults.push({ id: rid, profileId: pid, date, labName, sourceFile: `blank-${date}.jpg` })
      for (const row of makeRows(f.kind, values, style)) {
        measurements.push({ id: id('m'), labResultId: rid, ...row, ...normalizeRow(row) })
      }
    }
    if (f.name === 'Мама') {
      const rand = rng(42)
      const now = new Date()
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const evening = i % 3 === 0
        const trend = (29 - i) * -0.25
        vitals.push({
          id: id('v'),
          profileId: pid,
          datetime: `${localISO(d)}T${evening ? '20' : '08'}:${pad(Math.floor(rand() * 40) + 5)}`,
          systolic: Math.round(139 + trend + (rand() - 0.5) * 22),
          diastolic: Math.round(85 + trend / 3 + (rand() - 0.5) * 12),
          pulse: Math.round(71 + (rand() - 0.5) * 16),
        })
      }
    }
  }

  return { profiles, labResults, measurements, vitals, activeProfileId: profiles[1].id }
}
