// Текст из PDF: строки собираются по координатам, колонки разделяются пробелами, чтобы разбор бланка видел столбцы.
// Библиотека pdf.js передаётся снаружи: в браузере обычная сборка, в тестах legacy.
export async function pdfToText(pdfjs, data, { maxPages = 6 } = {}) {
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: false, isEvalSupported: false })
  const doc = await task.promise
  const pages = []
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    const rows = []
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue
      const x = it.transform[4]
      const y = it.transform[5]
      const h = Math.abs(it.transform[3]) || 10
      let row = rows.find((r) => Math.abs(r.y - y) < Math.max(2.5, h * 0.35))
      if (!row) rows.push((row = { y, items: [] }))
      row.items.push({ x, w: it.width || 0, h, s: it.str })
    }
    rows.sort((a, b) => b.y - a.y)
    const lines = rows.map((r) => {
      r.items.sort((a, b) => a.x - b.x)
      let out = ''
      let end = null
      for (const i of r.items) {
        if (end != null) out += i.x - end > i.h * 0.6 ? '   ' : i.x - end > i.h * 0.12 ? ' ' : ''
        out += i.s
        end = i.x + i.w
      }
      return out.trim()
    })
    pages.push(lines.join('\n'))
    page.cleanup()
  }
  await task.destroy()
  return pages.join('\n')
}
