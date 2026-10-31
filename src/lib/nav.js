// Меню: шесть главных разделов на компьютере; на телефоне четыре вкладки и «Ещё». Остальное под «Ещё».
export const PRIMARY = ['today', '', 'meds', 'diary', 'summary', 'dossier']
export const MOBILE_TABS = ['today', '', 'meds', 'dossier']

const key = (i) => i[0].split('/')[0]
const split = (items, keys) => ({ primary: keys.map((k) => items.find((i) => key(i) === k)).filter(Boolean), rest: items.filter((i) => !keys.includes(key(i))) })

export const splitNav = (items) => split(items, PRIMARY)
export const splitMobileNav = (items) => split(items, MOBILE_TABS)

// Куда встанет перетаскиваемая строка: сколько остальных строк выше указателя (по серединам строк).
export const dropIndex = (otherMids, y) => otherMids.filter((m) => m < y).length

// Переставить id на позицию to (0-based), остальные сохраняют порядок.
export function moveTo(ids, id, to) {
  const i = ids.indexOf(id)
  if (i < 0) return ids
  const rest = ids.filter((x) => x !== id)
  const t = Math.max(0, Math.min(rest.length, to))
  const out = [...rest.slice(0, t), id, ...rest.slice(t)]
  return out.every((x, k) => x === ids[k]) ? ids : out
}

// Порядок профилей: сдвиг на одну позицию вверх (-1) или вниз (+1), края остаются на месте.
export function moveId(ids, id, dir) {
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return ids
  const out = [...ids]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}
