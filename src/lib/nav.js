// Боковое меню: шесть главных разделов всегда на виду, остальное под «Ещё».
export const PRIMARY = ['today', '', 'meds', 'diary', 'summary', 'dossier']

export function splitNav(items) {
  const key = (i) => i[0].split('/')[0]
  const primary = PRIMARY.map((k) => items.find((i) => key(i) === k)).filter(Boolean)
  const rest = items.filter((i) => !PRIMARY.includes(key(i)))
  return { primary, rest }
}
