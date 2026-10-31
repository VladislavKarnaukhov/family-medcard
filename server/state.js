// Сбор состояния семьи для клиента с учётом прав доступа.
import { all, get, inList, safeJson, today } from './util.js'
import { careState } from './care.js'
import { DOCS } from '../src/legal/docs.js'
import { conciergeOn } from './util.js'

export function familyAccess(user, familyId) {
  if (!user) return null
  if (user.role === 'staff') return { access: 'staff', profileIds: null }
  const g = get('SELECT * FROM grants WHERE family_id = ? AND user_id = ?', familyId, user.id)
  if (!g) return null
  if (g.expires_at && g.expires_at < today()) return null
  // Общая карта: участники с собственным входом видят результаты друг друга, только если оба разрешили показ.
  let peerIds = []
  if (g.self_profile_id) {
    const mine = get('SELECT share_peers, consent_status FROM profiles WHERE id = ?', g.self_profile_id)
    if (mine?.share_peers && mine.consent_status === 'confirmed') {
      peerIds = all("SELECT id FROM profiles WHERE family_id = ? AND id != ? AND share_peers = 1 AND consent_status IN ('confirmed', 'self')", familyId, g.self_profile_id).map((p) => p.id)
    }
  }
  return { access: g.access, profileIds: safeJson(g.profile_ids), grant: g, peerIds }
}

// Действует ли подписанное согласие владельца семьи на обработку данных о здоровье.
// Состояние согласия владельца: ok | none | outdated (подписана прежняя версия документа) | stopped (отозвано).
export function consentStatus(familyId) {
  const f = get('SELECT processing_stopped FROM families WHERE id = ?', familyId)
  if (!f || f.processing_stopped) return 'stopped'
  const signed = (version) =>
    !!get(
      `SELECT 1 FROM consents c JOIN grants g ON g.user_id = c.user_id AND g.family_id = ? AND g.access = 'owner'
       WHERE c.doc_id = 'consent_health' AND c.method = 'otp' AND c.revoked_at IS NULL ${version ? 'AND c.doc_version = ?' : ''} LIMIT 1`,
      ...(version ? [familyId, version] : [familyId]),
    )
  if (signed(DOCS.consent_health.version)) return 'ok'
  return signed(null) ? 'outdated' : 'none'
}

export const consentOk = (familyId) => consentStatus(familyId) === 'ok'

export const profileAllowed = (a, pid) => a.profileIds == null || a.profileIds.includes(pid)
export const canWrite = (a) => ['owner', 'add', 'staff'].includes(a.access)
export const isOwner = (a) => a.access === 'owner'

export function buildState(familyId, a) {
  const staff = a.access === 'staff'
  const owner = a.access === 'owner'
  const family = get('SELECT * FROM families WHERE id = ?', familyId)
  const everyone = all('SELECT * FROM profiles WHERE family_id = ? ORDER BY sort_order, rowid', familyId)
  const profiles = everyone.filter((p) => profileAllowed(a, p.id))
  const peers = everyone.filter((p) => !profileAllowed(a, p.id) && a.peerIds?.includes(p.id))
  const pids = profiles.map((p) => p.id)
  const inP = inList(pids)
  const seenIds = [...pids, ...peers.map((p) => p.id)]
  const inSeen = inList(seenIds)
  const careGrants = all('SELECT self_profile_id, role_label, profile_ids FROM grants WHERE family_id = ?', familyId)

  const labRows = all(`SELECT * FROM lab_results WHERE profile_id IN ${inSeen} ORDER BY date`, ...seenIds)
  const lids = labRows.map((l) => l.id)

  const state = {
    family: { id: family.id, name: family.name, timezone: family.timezone },
    me: { access: a.access, selfProfileId: a.grant?.self_profile_id || null, caregiver: !a.grant?.self_profile_id && a.access === 'add' && /сиделк/i.test(a.grant?.role_label || '') },
    concierge: conciergeOn(),
    assistant: { name: family.staff_id ? get('SELECT name FROM users WHERE id = ?', family.staff_id)?.name : null },
    consent: { ok: consentOk(familyId), outdated: consentStatus(familyId) === 'outdated', stopped: !!family.processing_stopped, deleteAfter: family.delete_after },
    profiles: [...profiles, ...peers].map((p) => ({ peer: peers.includes(p), sharePeers: !!p.share_peers, id: p.id, name: p.name, birthYear: p.birth_year, birthDate: p.birth_date || null, sex: p.sex, notes: peers.includes(p) ? '' : p.notes, basis: p.basis, consentStatus: p.consent_status, allergies: peers.includes(p) ? '' : p.allergies, notifyBadMood: !!p.notify_bad_mood, hasSelfUser: careGrants.some((g) => g.self_profile_id === p.id), hasCaregiver: careGrants.some((g) => /сиделк/i.test(g.role_label) && profileAllowed({ profileIds: safeJson(g.profile_ids) }, p.id)), ...(a.access === 'share' ? {} : { emergencyContacts: peers.includes(p) ? [] : safeJson(p.emergency_contacts) || [] }) })),
    questions: Object.fromEntries(profiles.map((p) => [p.id, p.questions])),
    labResults: labRows.map((l) => ({ id: l.id, profileId: l.profile_id, date: l.date, labName: l.lab_name, sourceFile: l.source_file })),
    measurements: all(`SELECT * FROM measurements WHERE lab_result_id IN ${inList(lids)}`, ...lids).map((m) => ({
      id: m.id,
      labResultId: m.lab_result_id,
      name: m.name,
      value: m.value,
      unit: m.unit,
      refLow: m.ref_low,
      refHigh: m.ref_high,
      normalizedValue: m.normalized_value,
      normalizedUnit: m.normalized_unit,
      indicatorKey: m.indicator_key,
    })),
    vitals: all(`SELECT * FROM vitals WHERE profile_id IN ${inSeen} ORDER BY datetime`, ...seenIds).map((v) => ({
      id: v.id,
      profileId: v.profile_id,
      datetime: v.datetime,
      systolic: v.systolic,
      diastolic: v.diastolic,
      pulse: v.pulse,
    })),
    documents: all(`SELECT * FROM documents WHERE profile_id IN ${inP} ORDER BY date DESC`, ...pids).map((d) => ({
      id: d.id,
      profileId: d.profile_id,
      type: d.type,
      title: d.title,
      date: d.date,
      status: d.status,
      addedBy: d.added_by_kind,
      labResultId: d.lab_result_id,
      fileUrl: d.file_path ? `/api/documents/${d.id}/file` : null,
      fileName: d.file_name,
      note: d.note,
    })),
    ...careState(profiles, a, family),
    emergency: {},
    shareLinks: [],
    requests: [],
    messages: [],
    members: [],
    accessLog: [],
  }

  if (owner || staff) {
    state.requests = all('SELECT r.*, (SELECT name FROM users WHERE id = r.assignee_id) assignee FROM requests r WHERE family_id = ? ORDER BY created_at DESC', familyId).map((r) => ({
      id: r.id,
      profileId: r.profile_id,
      title: r.title,
      status: r.status,
      createdAt: r.created_at,
      due: r.due,
      assignee: r.assignee,
    }))
    state.unread = !conciergeOn() ? 0 : get("SELECT COUNT(*) c FROM messages WHERE family_id = ? AND author_kind = 'staff' AND internal = 0 AND created_at > ?", familyId, family.client_read_at || '').c
    state.messages = all(`SELECT * FROM messages WHERE family_id = ? ${staff ? '' : 'AND internal = 0'} ORDER BY created_at`, familyId).map((m) => ({
      id: m.id,
      from: m.author_kind === 'staff' ? 'assistant' : 'client',
      author: m.author_name,
      text: m.text,
      at: m.created_at,
      internal: !!m.internal,
    }))
  }

  if (owner) {
    const allIds = all('SELECT id FROM profiles WHERE family_id = ?', familyId).map((p) => p.id)
    state.members = all(
      'SELECT g.*, u.name, u.email FROM grants g JOIN users u ON u.id = g.user_id WHERE g.family_id = ? ORDER BY g.created_at',
      familyId,
    ).map((g) => ({
      id: g.id,
      userId: g.user_id,
      name: g.name,
      email: g.email,
      role: g.role_label,
      access: g.access,
      profileIds: safeJson(g.profile_ids) ?? allIds,
      expires: g.expires_at,
    }))
    state.invites = all('SELECT * FROM invites WHERE family_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY expires_at', familyId, new Date().toISOString()).map((i) => ({
      token: i.token,
      role: i.role_label,
      access: i.access,
      profileIds: safeJson(i.profile_ids) ?? allIds,
      accessDays: i.access_days,
      expiresAt: i.expires_at,
    }))
    state.accessLog = all('SELECT * FROM access_log WHERE family_id = ? ORDER BY at DESC LIMIT 60', familyId).map((l) => ({
      id: l.id,
      at: l.at,
      who: l.who,
      action: l.action,
      profileId: l.profile_id,
    }))
    state.shareLinks = all('SELECT token, profile_id, expires_at, created_at FROM share_links WHERE family_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC', familyId, new Date().toISOString()).map((l) => ({ token: l.token, profileId: l.profile_id, expiresAt: l.expires_at, createdAt: l.created_at }))
    for (const l of all('SELECT * FROM emergency_links WHERE family_id = ? AND revoked_at IS NULL', familyId)) state.emergency[l.profile_id] = { token: l.token, createdAt: l.created_at }
  }

  // Сам человек видит журнал просмотров только своего профиля (право субъекта данных). Переписку и поручения ему не отдаём.
  if (a.grant?.self_profile_id) {
    state.accessLog = all('SELECT * FROM access_log WHERE family_id = ? AND profile_id = ? ORDER BY at DESC LIMIT 60', familyId, a.grant.self_profile_id).map((l) => ({ id: l.id, at: l.at, who: l.who, action: l.action, profileId: l.profile_id }))
  }

  return state
}
