// Разбор текста бланка анализов (после распознавания на устройстве) в строки «показатель, значение, единица, референс».
// Только факты из бланка: значения и диапазоны берутся из текста, ничего не достраивается. Сомнительные строки помечаются low.
import { INDICATORS, unitKey } from './indicators.js'

const LABS = [
  [/инвитро|invitro/i, 'Инвитро'],
  [/гемотест|hemotest/i, 'Гемотест'],
  [/\bкдл\b|\bkdl\b/i, 'KDL'],
  [/хеликс|helix/i, 'Хеликс'],
  [/ситилаб|citilab/i, 'Ситилаб'],
  [/\bцмд\b|\bcmd\b/i, 'ЦМД'],
  [/литех|litech/i, 'Литех'],
]

const EXTRA_UNITS = ['%', 'фл', 'пг', 'г/дл', 'мм/ч', 'г/л', 'ммоль/л', 'мкмоль/л', 'ед/л', 'ме/л', 'мг/л', 'нг/мл', 'мкг/л', 'пмоль/л', 'ммоль/л', 'мкме/мл', 'мме/л', 'мед/л', 'пг/кл', 'г/дл']
const knownUnits = new Set([...INDICATORS.flatMap((i) => [i.unit, ...i.alt.flatMap((a) => a.units)]), ...EXTRA_UNITS].map(unitKey))

const unitByKey = new Map([...INDICATORS.flatMap((i) => [i.unit, ...i.alt.flatMap((a) => a.units)]), ...EXTRA_UNITS].map((u) => [unitKey(u), u]))

// Латинские двойники кириллицы в единицах («10*12/n» вместо «10*12/л»): перебираем варианты и берём только известную единицу.
const LOOK = { n: ['л', 'п'], r: ['г'], k: ['к'], m: ['м'], a: ['а'], e: ['е'], o: ['о'], c: ['с'], p: ['р'], x: ['х'], y: ['у'], t: ['т'], u: ['и'], l: ['л'], i: ['і'] }
function repairUnit(s) {
  let outs = ['']
  for (const ch of s) {
    const opts = LOOK[ch.toLowerCase()] || [ch]
    outs = outs.flatMap((o) => opts.map((x) => o + x)).slice(0, 64)
  }
  for (const o of outs) if (knownUnits.has(unitKey(o))) return unitByKey.get(unitKey(o))
  return null
}

const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е')
const NUM = '\\d+(?:[.,]\\d+)?'
const toNum = (s) => Number(String(s).replace(',', '.'))
const DASH = '[-–—−]'

// Типичные ошибки распознавания внутри чисел: буква O вместо нуля.
function fixDigits(line) {
  let fixed = false
  const out = line.replace(/(?<![A-Za-zА-Яа-я])[\dOoОо]*\d[\dOoОо]*(?:[.,][\dOoОо]+)?(?![A-Za-zА-Яа-я])|(?<![A-Za-zА-Яа-я])[\dOoОо]+[.,]\d+(?![A-Za-zА-Яа-я])/g, (t) => {
    const r = t.replace(/[OoОо]/g, '0')
    if (r !== t) fixed = true
    return r
  })
  return { line: out, fixed }
}

function findDate(text) {
  const lines = text.split('\n')
  const iso = (m) => {
    const [, d, mo, y] = m
    const yy = y.length === 2 ? `20${y}` : y
    if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31 || Number(yy) < 2000 || Number(yy) > 2100) return null
    return `${yy}-${mo}-${d}`
  }
  const re = /\b(\d{2})[./-](\d{2})[./-](\d{4}|\d{2})\b/
  for (const l of lines) {
    if (/забор|взят|выполнен|дата\s+исслед|получен/i.test(l)) {
      const m = l.match(re)
      if (m && iso(m)) return iso(m)
    }
  }
  for (const l of lines) {
    const m = l.match(re)
    if (m && iso(m)) return iso(m)
  }
  return null
}

function matchIndicator(line) {
  const l = norm(line)
  let best = null
  for (const ind of INDICATORS) {
    for (const a of [...ind.aliases, norm(ind.name)]) {
      const parts = norm(a).split(/[^a-zа-я0-9]+/).filter(Boolean)
      if (!parts.length) continue
      const re = new RegExp('(?<![a-zа-я0-9])' + parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-zа-я0-9]*') + '(?![a-zа-я0-9])')
      const m = re.exec(l)
      const okPos = m && (m.index <= 2 || l[m.index - 1] === '(' || /\(\s*$/.test(l.slice(0, m.index)))
      if (okPos && (!best || m[0].length > best.len)) best = { ind, len: m[0].length, end: m.index + m[0].length, start: m.index }
    }
  }
  return best
}

function takeUnit(rest) {
  const s = rest.replace(/^\s+/, '').replace(/^[xх×]\s*(?=\d)/i, '')
  const lead = rest.length - rest.replace(/^\s+/, '').length
  const skip = rest.replace(/^\s+/, '').length - s.length
  for (let n = Math.min(14, s.length); n >= 1; n--) {
    const cand = s.slice(0, n)
    if (knownUnits.has(unitKey(cand))) return { unit: cand.trim(), rest: s.slice(n), known: true, consumed: lead + skip + n }
  }
  const g = s.match(/^[a-zA-Zа-яА-ЯμµЁё%0-9^*⁰¹²³⁴⁵⁶⁷⁸⁹]+\/[a-zA-Zа-яА-ЯμµЁё0-9^*⁰¹²³⁴⁵⁶⁷⁸⁹]+/)
  if (g) {
    const fixed = repairUnit(g[0])
    if (fixed) return { unit: fixed, rest: s.slice(g[0].length), known: true, repaired: true }
    return { unit: g[0], rest: s.slice(g[0].length), known: false }
  }
  return { unit: '', rest: s, known: false }
}

function takeRef(rest) {
  const r = rest.replace(/\s+/g, ' ')
  const range = r.match(new RegExp(`(${NUM})\\s*${DASH}\\s*(${NUM})`))
  if (range && toNum(range[1]) <= toNum(range[2])) return { refLow: toNum(range[1]), refHigh: toNum(range[2]) }
  const upTo = r.match(new RegExp(`(?:<=?|до|менее|не более)\\s*(${NUM})`, 'i'))
  if (upTo) return { refLow: null, refHigh: toNum(upTo[1]) }
  const from = r.match(new RegExp(`(?:>=?|более|от|не менее)\\s*(${NUM})`, 'i'))
  if (from) return { refLow: toNum(from[1]), refHigh: null }
  return { refLow: null, refHigh: null }
}

export function parseLabText(text) {
  const raw = String(text || '').replace(/[|_¦]/g, ' ').replace(/\t/g, ' ')
  const lab = LABS.find(([re]) => re.test(raw))
  const out = { date: findDate(raw), labName: lab ? lab[1] : null, rows: [], skipped: 0 }
  const seen = new Set()
  const lines = raw.split('\n')
  for (let li = 0; li < lines.length; li++) {
    const trimmed = lines[li].trim()
    if (trimmed.length < 4 || !/\d/.test(trimmed) || !/[a-zA-Zа-яА-Я]{2}/.test(trimmed)) continue
    const { line, fixed } = fixDigits(trimmed)
    const VAL = new RegExp(`^\\s*[:=]?\\s*([<>]?)\\s*(${NUM})`)
    let name = null
    let rest = ''
    let vm = null
    let known = false
    const found = matchIndicator(line)
    if (found) {
      const after = line.slice(found.end).replace(/^\s*\)/, '').replace(/^\s*\([^)]*\)/, '')
      const m = after.match(VAL)
      if (m) {
        name = found.ind.name
        rest = after
        vm = m
        known = true
      }
    }
    if (!known) {
      const m = line.match(/^\s*([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё ,.()\-%/]{2,70}?)\s+(?=[<>]?\d)/)
      if (!m) continue
      name = m[1].replace(/\s+/g, ' ').trim()
      rest = line.slice(m[0].length)
      vm = rest.match(VAL)
      if (!vm) {
        out.skipped++
        continue
      }
      // Название перенесено на следующую строку: «…гемоглобина в» / «эритроците (MCH)».
      const next = (lines[li + 1] || '').trim()
      if (next && !/\d{2}/.test(next) && /^[а-яa-z(]/.test(next) && next.length < 60) name = `${name} ${next}`.replace(/\s+/g, ' ')
    }
    let valueText = vm[2]
    let lostPoint = false
    // «08» вместо «0.8»: потерянная десятичная точка.
    if (/^0\d$/.test(valueText)) {
      valueText = `0.${valueText[1]}`
      lostPoint = true
    }
    const value = toNum(valueText)
    const afterValue = rest.slice(vm[0].length).replace(/^\s*\(\s*[НHнhLlЛ↑↓*]\s*\)/, '')
    const u = takeUnit(afterValue)
    if (!known && !u.unit) {
      out.skipped++
      continue
    }
    const ref = takeRef(u.rest)
    let low = fixed || lostPoint || (!!u.unit && !u.known) || !!vm[1]
    // Потерянная или лишняя запятая: значение вне референса, а сдвинутое на порядок попадает в него.
    if (ref.refLow != null && ref.refHigh != null && (value < ref.refLow || value > ref.refHigh)) {
      if ([10, 100, 0.1, 0.01].some((k) => value * k >= ref.refLow && value * k <= ref.refHigh)) low = true
    }
    if (ref.refHigh != null && value > ref.refHigh * 20) low = true
    if (ref.refLow != null && ref.refLow > 0 && value < ref.refLow / 20) low = true
    // Нереальный референс: проценты не бывают больше 100, верхняя граница не бывает в 12 раз выше нижней.
    if (ref.refHigh != null && u.unit === '%' && ref.refHigh > 100) low = true
    if (ref.refLow != null && ref.refLow > 0 && ref.refHigh != null && ref.refHigh / ref.refLow > 12) low = true
    // После единицы остались цифры, а референс не разобран: вероятно, потеряно тире.
    if (ref.refLow == null && ref.refHigh == null && /\d/.test(u.rest)) low = true
    const key = `${name}|${value}`
    if (seen.has(key)) continue
    seen.add(key)
    out.rows.push({ name, value, unit: u.unit, refLow: ref.refLow, refHigh: ref.refHigh, confidence: low ? 'low' : 'high', source: trimmed.slice(0, 160) })
  }
  return out
}
