// Состояние клиентского приложения. Источник данных — сервер; экраны читают тот же объект, что и раньше.
import { useSyncExternalStore } from 'react'
import { api, uploadFile } from './api'
import { normalizeRow } from './indicators'

const EMPTY_DATA = {
  family: null,
  consent: { ok: false, stopped: false, deleteAfter: null },
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
  medications: [],
  intakes: [],
  careNotes: [],
  appointments: [],
  notifications: [],
  unreadNotifications: 0,
  emergency: {},
  questions: {},
  unread: 0,
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

export const can = (s, profile) => ({
  write: ['owner', 'add'].includes(s.me?.access) && !profile?.peer,
  owner: s.me?.access === 'owner',
  meds: ['owner', 'add'].includes(s.me?.access) && !s.me?.caregiver,
  self: !!s.me?.selfProfileId,
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
    const body = { name: p.name, birthYear: p.birthYear, sex: p.sex, notes: p.notes, basis: p.basis, attest: p.attest, allergies: p.allergies, emergencyContacts: p.emergencyContacts }
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

  // Исправление анализа: rows — те же поля, что при создании.
  updateLabResult: act((id, d) =>
    api('PUT', `/api/lab-results/${id}`, { date: d.date, labName: d.labName, rows: d.rows.map((r) => ({ ...r, ...normalizeRow(r) })) }),
  ),

  async markRead() {
    if (!state.unread || !state.familyId) return
    commit({ unread: 0 })
    await api('POST', `/api/families/${state.familyId}/read`, {}).catch(() => {})
  },

  async updateName(name) {
    await api('PATCH', '/api/me', { name })
    commit({ user: { ...state.user, name } })
  },
  changePassword: (current, next) => api('POST', '/api/me/password', { current, next }),

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
    const { token, emailed } = await api('POST', `/api/families/${state.familyId}/invites`, { ...m, consentConfirmed: true })
    await refresh()
    return { url: `${location.origin}/#/invite/${token}`, emailed }
  },
  revokeInvite: act((token) => api('DELETE', `/api/invites/${token}`)),
  removeMember: act((id) => api('DELETE', `/api/families/${state.familyId}/members/${id}`)),

  sendFeedback: (text) => api('POST', '/api/feedback', { text }),
  async answerSurvey(a) {
    await api('POST', '/api/survey', a)
    commit({ user: { ...state.user, surveyDue: false } })
  },
  async dismissSurvey() {
    await api('POST', '/api/survey/dismiss', {})
    commit({ user: { ...state.user, surveyDue: false } })
  },
  revokeShareLink: act((token) => api('DELETE', `/api/share/${token}`)),

  async createShareLink(profileId, days) {
    const { token } = await api('POST', `/api/profiles/${profileId}/share`, { days, consentConfirmed: true })
    await refresh()
    return `${location.origin}/#/share/${token}`
  },

  // ---------- уход ----------
  saveMed: async (profileId, m) => {
    const body = { name: m.name, form: m.form, dose: m.dose, times: m.times, days: m.days, startDate: m.startDate, endDate: m.endDate || null, prescribedBy: m.prescribedBy, note: m.note }
    const r = m.id ? await api('PUT', `/api/medications/${m.id}`, body) : await api('POST', `/api/profiles/${profileId}/medications`, body)
    await refresh()
    return r
  },
  setMedStatus: act((id, status) => api('PUT', `/api/medications/${id}`, { status })),
  deleteMed: act((id) => api('DELETE', `/api/medications/${id}`)),
  undoIntake: act((medId, scheduledAt) => api('POST', `/api/medications/${medId}/intakes`, { scheduledAt, status: 'unmarked' })),
  markIntake: act((medId, scheduledAt, status, reason = '') => api('POST', `/api/medications/${medId}/intakes`, { scheduledAt, status, reason })),
  addNote: act((profileId, n) => api('POST', `/api/profiles/${profileId}/care-notes`, n)),
  updateNote: act((id, n) => api('PUT', `/api/care-notes/${id}`, n)),
  deleteNote: act((id) => api('DELETE', `/api/care-notes/${id}`)),
  saveVisit: async (profileId, v) => {
    const body = { at: v.at, specialist: v.specialist, address: v.address, purpose: v.purpose, companion: v.companion, bring: v.bring, status: v.status, resultNote: v.resultNote, documentIds: v.documentIds }
    const r = v.id ? await api('PUT', `/api/appointments/${v.id}`, body) : await api('POST', `/api/profiles/${profileId}/appointments`, body)
    await refresh()
    return r
  },
  deleteVisit: act((id) => api('DELETE', `/api/appointments/${id}`)),
  requestVisit: act((id) => api('POST', `/api/appointments/${id}/request`, {})),
  async readNotifications(ids) {
    commit({ notifications: state.notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)), unreadNotifications: ids ? Math.max(0, state.unreadNotifications - ids.length) : 0 })
    await api('POST', '/api/notifications/read', ids ? { ids } : {}).catch(() => {})
  },
  async setEmailEvents(events, intake) {
    await api('PUT', '/api/me/email-events', { events, intake })
    commit({ user: { ...state.user, emailEvents: events, emailIntake: intake } })
  },
  async setEmailIntake(on) {
    await api('PUT', '/api/me/email-events', { events: state.user.emailEvents, intake: on })
    commit({ user: { ...state.user, emailIntake: on } })
  },
  async setSimpleMode(on) {
    await api('PUT', '/api/me/simple-mode', { on })
    commit({ user: { ...state.user, simpleMode: on } })
  },
  track: (name) => api('POST', '/api/events', { name, familyId: state.familyId }).catch(() => {}),
  setSharePeers: act((profileId, on) => api('PUT', `/api/profiles/${profileId}/share-peers`, { on, consentConfirmed: on })),
  setNotifyBadMood: act((profileId, on) => api('PUT', `/api/profiles/${profileId}/notify-bad-mood`, { on })),
  setTimezone: act((timezone) => api('PUT', `/api/families/${state.familyId}/timezone`, { timezone })),
  async createEmergency(profileId, contactsConfirmed) {
    const r = await api('POST', `/api/profiles/${profileId}/emergency`, { consentConfirmed: true, contactsConfirmed })
    await refresh()
    return r
  },
  revokeEmergency: act((profileId) => api('DELETE', `/api/profiles/${profileId}/emergency`)),

  async deleteAccount(password) {
    await api('DELETE', '/api/me/account', { password })
    commit({ ...EMPTY_DATA, user: null, families: [], familyId: null, activeProfileId: null })
  },

  async subjectLink(profileId) {
    const { token } = await api('POST', `/api/profiles/${profileId}/subject-link`, {})
    return `${location.origin}/#/consent/${token}`
  },
}
