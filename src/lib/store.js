import { useSyncExternalStore } from 'react'
import { normalizeRow } from './indicators'
import { buildDemo } from './demo'
import { nowISO, plusDaysISO } from './format'

const KEY = 'family-medcard-v1'

const EMPTY = {
  profiles: [], // Profile: id, name, birthYear, sex, notes
  labResults: [], // LabResult: id, profileId, date, labName, sourceFile
  measurements: [], // Measurement: id, labResultId, name, value, unit, refLow, refHigh, normalizedValue, normalizedUnit (+ indicatorKey)
  vitals: [], // VitalSign: id, profileId, datetime, systolic, diastolic, pulse
  activeProfileId: null,
  questions: {}, // profileId -> «Мои вопросы врачу»
  // Консьерж-слой
  documents: [], // id, profileId, type, title, date, status ('ready' | 'requested' | 'processing'), addedBy, note
  requests: [], // id, profileId, title, status ('accepted' | 'working' | 'done'), createdAt, due
  messages: [], // id, from ('client' | 'assistant'), text, at
  members: [], // id, name, role, access ('view' | 'add'), profileIds, expires
  accessLog: [], // id, at, who, action, profileId
}

export const ASSISTANT = { name: 'Анна', title: 'Ваш помощник по здоровью' }

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

  addDocument(d) {
    commit({ ...state, documents: [...state.documents, { id: uid(), status: 'processing', addedBy: 'client', ...d }] })
  },

  deleteDocument(id) {
    commit({ ...state, documents: state.documents.filter((d) => d.id !== id) })
  },

  // Ответы помощника в демо имитируются.
  sendMessage(text) {
    commit({ ...state, messages: [...state.messages, { id: uid(), from: 'client', text, at: nowISO() }] })
    setTimeout(() => {
      commit({
        ...state,
        messages: [
          ...state.messages,
          { id: uid(), from: 'assistant', at: nowISO(), text: 'Спасибо, увидела ваше сообщение и вернусь с ответом в течение рабочего дня.' },
        ],
      })
    }, 1500)
  },

  createRequest(profileId, title) {
    const name = state.profiles.find((p) => p.id === profileId)?.name
    const request = { id: uid(), profileId, title, status: 'accepted', createdAt: nowISO(), due: plusDaysISO(1) }
    commit({
      ...state,
      requests: [request, ...state.requests],
      messages: [...state.messages, { id: uid(), from: 'client', at: nowISO(), text: `${title}${name ? ` — ${name}` : ''}` }],
    })
    setTimeout(() => {
      commit({
        ...state,
        requests: state.requests.map((r) => (r.id === request.id ? { ...r, status: 'working' } : r)),
        messages: [
          ...state.messages,
          { id: uid(), from: 'assistant', at: nowISO(), text: 'Приняла и беру в работу. Сообщу результат здесь; если понадобится уточнение, напишу.' },
        ],
      })
    }, 1500)
  },

  addMember(m) {
    const member = { id: uid(), expires: null, ...m }
    commit({
      ...state,
      members: [...state.members, member],
      accessLog: [{ id: uid(), at: nowISO(), who: 'Вы', action: `Открыт доступ: ${member.name} (${member.role})`, profileId: member.profileIds[0] }, ...state.accessLog],
    })
  },

  removeMember(id) {
    const m = state.members.find((x) => x.id === id)
    commit({
      ...state,
      members: state.members.filter((x) => x.id !== id),
      accessLog: [{ id: uid(), at: nowISO(), who: 'Вы', action: `Доступ закрыт: ${m?.name}`, profileId: m?.profileIds[0] }, ...state.accessLog],
    })
  },

  createShareLink(profileId, days) {
    const token = Math.random().toString(36).slice(2, 10)
    commit({
      ...state,
      accessLog: [{ id: uid(), at: nowISO(), who: 'Вы', action: `Создана ссылка для врача на ${days} дн.`, profileId }, ...state.accessLog],
    })
    return `https://medcard.example/share/${token}`
  },

  loadDemo() {
    commit({ ...EMPTY, ...buildDemo(), questions: {} })
  },

  clearAll() {
    commit(EMPTY)
  },
}
