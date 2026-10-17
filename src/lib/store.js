// Состояние клиентского приложения. Источник данных — сервер; экраны читают тот же объект, что и раньше.
import { useSyncExternalStore } from 'react'
import { api, uploadFile } from './api'
import { normalizeRow } from './indicators'
import { buildDemo } from './demo'

const EMPTY_DATA = {
  family: null,
  me: { access: null },
  assistant: { name: null },
  profiles: [],
  labResults: [],
  measurements: [],
  vitals: [],
  documents: [],
  requests: [],
  messages: [],
  members: [],
  invites: [],
  accessLog: [],
  questions: {},
}

let state = { ...EMPTY_DATA, ready: false, user: null, families: [], familyId: null, activeProfileId: null }
const subs = new Set()

function commit(patch) {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
}

export const useStore = () =>
  useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => state,
  )

const ls = {
  get: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* хранилище недоступно */
    }
  },
}

export const can = (s) => ({
  write: ['owner', 'add'].includes(s.me?.access),
  owner: s.me?.access === 'owner',
})

function pickActive(profiles, familyId, want) {
  const saved = want || ls.get(`blizkie-active:${familyId}`)
  return profiles.find((p) => p.id === saved)?.id ?? profiles[0]?.id ?? null
}

export async function refresh() {
  if (!state.familyId) return
  try {
    const data = await api('GET', `/api/families/${state.familyId}/state`)
    commit({ ...EMPTY_DATA, ...data, activeProfileId: pickActive(data.profiles, state.familyId, state.activeProfileId) })
  } catch (e) {
    if (e.status === 401) commit({ user: null, familyId: null, families: [] })
    else if (e.status === 404) await init()
  }
}

function applyMe(me) {
  const saved = ls.get('blizkie-family')
  const familyId = me.families.find((f) => f.id === saved)?.id ?? me.families[0]?.id ?? null
  commit({ user: me.user, families: me.families, familyId })
}

export async function init() {
  try {
    applyMe(await api('GET', '/api/me'))
    await refresh()
  } catch {
    commit({ user: null, familyId: null, families: [], ...EMPTY_DATA })
  } finally {
    commit({ ready: true })
  }
}

let timer
export function startPolling() {
  clearInterval(timer)
  timer = setInterval(() => {
    if (!document.hidden && state.user) refresh()
  }, 6000)
  window.addEventListener('focus', refresh)
}

const act = (fn) => async (...args) => {
  const r = await fn(...args)
  await refresh()
  return r
}

let qTimer
export const actions = {
  async login(email, password) {
    applyMe(await api('POST', '/api/auth/login', { email, password }))
    await refresh()
  },

  async register(data) {
    applyMe(await api('POST', '/api/auth/register', data))
    await refresh()
  },

  async logout() {
    await api('POST', '/api/auth/logout', {})
    commit({ ...EMPTY_DATA, user: null, families: [], familyId: null, activeProfileId: null })
  },

  async acceptInvite(token) {
    const r = await api('POST', `/api/invites/${token}/accept`, {})
    commit({ user: r.user, families: r.families, familyId: r.familyId })
    ls.set('blizkie-family', r.familyId)
    await refresh()
  },

  async setFamily(id) {
    ls.set('blizkie-family', id)
    commit({ familyId: id, activeProfileId: null })
    await refresh()
  },

  setActive(id) {
    ls.set(`blizkie-active:${state.familyId}`, id)
    commit({ activeProfileId: id })
  },

  saveProfile: async (p) => {
    const body = { name: p.name, birthYear: p.birthYear, sex: p.sex, notes: p.notes }
    let id = p.id
    if (id) await api('PUT', `/api/profiles/${id}`, body)
    else id = (await api('POST', `/api/families/${state.familyId}/profiles`, body)).id
    if (!p.id) {
      ls.set(`blizkie-active:${state.familyId}`, id)
      state = { ...state, activeProfileId: id }
    }
    await refresh()
    return id
  },

  deleteProfile: act((id) => api('DELETE', `/api/profiles/${id}`)),

  // drafts: [{ date, labName, sourceFile, file?, rows: [{ name, value, unit, refLow, refHigh }] }]
  async saveLabResults(profileId, drafts) {
    for (const d of drafts) {
      const rows = d.rows.map((r) => ({ ...r, ...normalizeRow(r) }))
      const { id } = await api('POST', `/api/profiles/${profileId}/lab-results`, { date: d.date, labName: d.labName, sourceFile: d.sourceFile, rows })
      if (d.file) {
        const doc = await api('POST', `/api/profiles/${profileId}/documents`, { type: 'analysis', title: `Анализы, ${d.labName}`, date: d.date, labResultId: id })
        await uploadFile(doc.id, d.file)
      }
    }
    await refresh()
  },

  deleteLabResult: act((id) => api('DELETE', `/api/lab-results/${id}`)),

  addVital: act((v) => api('POST', `/api/profiles/${v.profileId}/vitals`, v)),
  deleteVital: act((id) => api('DELETE', `/api/vitals/${id}`)),

  setQuestions(profileId, text) {
    commit({ questions: { ...state.questions, [profileId]: text } })
    clearTimeout(qTimer)
    qTimer = setTimeout(() => api('PUT', `/api/profiles/${profileId}/questions`, { text }).catch(() => {}), 600)
  },

  // d: { profileId, type, title, date, note?, file? }
  async addDocument(d) {
    const { id } = await api('POST', `/api/profiles/${d.profileId}/documents`, { type: d.type, title: d.title, date: d.date, note: d.note })
    if (d.file) await uploadFile(id, d.file)
    await refresh()
  },

  deleteDocument: act((id) => api('DELETE', `/api/documents/${id}`)),

  sendMessage: act((text) => api('POST', `/api/families/${state.familyId}/messages`, { text })),
  createRequest: act((profileId, title) => api('POST', `/api/families/${state.familyId}/requests`, { profileId, title })),

  async inviteMember(m) {
    const { token } = await api('POST', `/api/families/${state.familyId}/invites`, m)
    await refresh()
    return `${location.origin}/#/invite/${token}`
  },
  revokeInvite: act((token) => api('DELETE', `/api/invites/${token}`)),
  removeMember: act((id) => api('DELETE', `/api/families/${state.familyId}/members/${id}`)),

  async createShareLink(profileId, days) {
    const { token } = await api('POST', `/api/profiles/${profileId}/share`, { days })
    await refresh()
    return `${location.origin}/#/share/${token}`
  },

  async loadDemo() {
    const b = buildDemo()
    const bundle = { profiles: b.profiles, labResults: b.labResults, measurements: b.measurements, vitals: b.vitals, documents: b.documents, requests: b.requests, messages: b.messages }
    const r = await api('POST', `/api/families/${state.familyId}/demo-import`, { bundle })
    if (r.activeProfileId) ls.set(`blizkie-active:${state.familyId}`, r.activeProfileId)
    commit({ activeProfileId: r.activeProfileId })
    await refresh()
  },

  clearAll: act(() => api('DELETE', `/api/families/${state.familyId}/data`)),
}
