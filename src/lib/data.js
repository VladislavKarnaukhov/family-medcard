// Выборки из хранилища.
import { INDICATORS, getIndicator, convert } from './indicators'
import { status, toDate } from './format'

export function seriesFor(state, profileId, key) {
  const results = new Map(state.labResults.filter((r) => r.profileId === profileId).map((r) => [r.id, r]))
  const ind = getIndicator(key)
  return state.measurements
    .filter((m) => m.indicatorKey === key && results.has(m.labResultId))
    .map((m) => {
      const r = results.get(m.labResultId)
      const lo = ind ? convert(ind, m.refLow, m.unit).value : m.refLow
      const hi = ind ? convert(ind, m.refHigh, m.unit).value : m.refHigh
      const value = m.normalizedValue
      return {
        id: m.id,
        t: toDate(r.date).getTime(),
        date: r.date,
        lab: r.labName,
        name: m.name,
        value,
        unit: m.normalizedUnit,
        refLow: lo ?? null,
        refHigh: hi ?? null,
        origValue: m.value,
        origUnit: m.unit,
        converted: m.normalizedUnit !== m.unit || m.normalizedValue !== m.value,
        status: status(value, lo, hi),
      }
    })
    .sort((a, b) => a.t - b.t)
}

export function indicatorKeys(state, profileId) {
  const ids = new Set(state.labResults.filter((r) => r.profileId === profileId).map((r) => r.id))
  const keys = new Set(state.measurements.filter((m) => ids.has(m.labResultId)).map((m) => m.indicatorKey))
  const known = INDICATORS.filter((i) => keys.has(i.key)).map((i) => i.key)
  const custom = [...keys].filter((k) => !getIndicator(k)).sort()
  return [...known, ...custom]
}

export function labelFor(state, key, series) {
  return getIndicator(key)?.name || series?.[series.length - 1]?.name || key.replace('custom:', '')
}

export function latestPoints(state, profileId, sinceT = 0) {
  return indicatorKeys(state, profileId)
    .map((key) => {
      const s = seriesFor(state, profileId, key).filter((p) => p.t >= sinceT)
      return s.length ? { key, label: labelFor(state, key, s), series: s, last: s[s.length - 1] } : null
    })
    .filter(Boolean)
}

export const isOut = (p) => p.status === 'low' || p.status === 'high'
