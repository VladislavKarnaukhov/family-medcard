// Меню: шесть главных разделов на компьютере; на телефоне четыре вкладки и «Ещё». Остальное под «Ещё».
export const PRIMARY = ['today', '', 'meds', 'diary', 'summary', 'dossier']
export const MOBILE_TABS = ['today', '', 'meds', 'dossier']

const key = (i) => i[0].split('/')[0]
const split = (items, keys) => ({ primary: keys.map((k) => items.find((i) => key(i) === k)).filter(Boolean), rest: items.filter((i) => !keys.includes(key(i))) })

export const splitNav = (items) => split(items, PRIMARY)
export const splitMobileNav = (items) => split(items, MOBILE_TABS)

// Порядок профилей: сдвиг на одну позицию вверх (-1) или вниз (+1), края остаются на месте.
export function moveId(ids, id, dir) {
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return ids
  const out = [...ids]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}
