import { useSyncExternalStore } from 'react'
import { normalizeRow } from './indicators'
import { buildDemo } from './demo'

const KEY = 'family-medcard-v1'

const EMPTY = {
  profiles: [], // Profile: id, name, birthYear, sex, notes
  labResults: [], // LabResult: id, profileId, date, labName, sourceFile
  measurements: [], // Measurement: id, labResultId, name, value, unit, refLow, refHigh, normalizedValue, normalizedUnit (+ indicatorKey)
  vitals: [], // VitalSign: id, profileId, datetime, systolic, diastolic, pulse
  activeProfileId: null,
  questions: {}, // profileId -> «Мои вопросы врачу»
}

const load = () => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY
  } catch {
    return EMPTY
  }
}

let state = load()
const subs = new Set()

function commit(next) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* хранилище недоступно — работаем в памяти */
  }
  subs.forEach((f) => f())
}

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)

export const useStore = () =>
  useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => state,
  )

export const actions = {
  saveProfile(p) {
    const id = p.id || uid()
    const profile = { id, name: p.name.trim(), birthYear: p.birthYear || null, sex: p.sex || '', notes: p.notes || '' }
    const exists = state.profiles.some((x) => x.id === id)
    commit({
      ...state,
      profiles: exists ? state.profiles.map((x) => (x.id === id ? profile : x)) : [...state.profiles, profile],
      activeProfileId: exists ? state.activeProfileId : id,
    })
    return id
  },

  deleteProfile(id) {
    const results = state.labResults.filter((r) => r.profileId === id).map((r) => r.id)
    const profiles = state.profiles.filter((p) => p.id !== id)
    commit({
      ...state,
      profiles,
      labResults: state.labResults.filter((r) => r.profileId !== id),
      measurements: state.measurements.filter((m) => !results.includes(m.labResultId)),
      vitals: state.vitals.filter((v) => v.profileId !== id),
      activeProfileId: state.activeProfileId === id ? profiles[0]?.id ?? null : state.activeProfileId,
    })
  },

  setActive(id) {
    commit({ ...state, activeProfileId: id })
  },

  // drafts: [{ date, labName, sourceFile, rows: [{ name, value, unit, refLow, refHigh }] }]
  saveLabResults(profileId, drafts) {
    const labResults = [...state.labResults]
    const measurements = [...state.measurements]
    for (const d of drafts) {
      const id = uid()
      labResults.push({ id, profileId, date: d.date, labName: d.labName.trim(), sourceFile: d.sourceFile || '' })
      for (const r of d.rows) {
        measurements.push({
          id: uid(),
          labResultId: id,
          name: r.name.trim(),
          value: r.value,
          unit: (r.unit || '').trim(),
          refLow: r.refLow ?? null,
          refHigh: r.refHigh ?? null,
          ...normalizeRow(r),
        })
      }
    }
    commit({ ...state, labResults, measurements })
  },

  deleteLabResult(id) {
    commit({
      ...state,
      labResults: state.labResults.filter((r) => r.id !== id),
      measurements: state.measurements.filter((m) => m.labResultId !== id),
    })
  },

  addVital(v) {
    commit({ ...state, vitals: [...state.vitals, { id: uid(), ...v }] })
  },

  deleteVital(id) {
    commit({ ...state, vitals: state.vitals.filter((v) => v.id !== id) })
  },

  setQuestions(profileId, text) {
    commit({ ...state, questions: { ...state.questions, [profileId]: text } })
  },

  loadDemo() {
    commit({ ...EMPTY, ...buildDemo(), questions: {} })
  },

  clearAll() {
    commit(EMPTY)
  },
}
