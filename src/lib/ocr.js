// Распознавание текста бланка на устройстве (Tesseract.js). Фото никуда не отправляется:
// воркер, wasm и словари отдаёт наш сервер из /ocr.
const BASE = '/ocr'
let worker = null

// Подготовка снимка: поворот по EXIF, разумный размер, серый тон и растяжение контраста.
export async function prepare(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const target = Math.min(2400, Math.max(1600, bmp.width))
  const k = target / bmp.width
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(bmp, 0, 0, c.width, c.height)
  const img = g.getImageData(0, 0, c.width, c.height)
  const d = img.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
    d[i] = d[i + 1] = d[i + 2] = v
    hist[v]++
  }
  const total = c.width * c.height
  let lo = 0
  let hi = 255
  for (let s = 0; lo < 255 && (s += hist[lo]) < total * 0.02; lo++);
  for (let s = 0; hi > 0 && (s += hist[hi]) < total * 0.02; hi--);
  const span = Math.max(40, hi - lo)
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, Math.round(((d[i] - lo) / span) * 255)))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  g.putImageData(img, 0, 0)
  return c
}

async function getWorker(onProgress) {
  if (worker) return worker
  const { createWorker } = await import('tesseract.js')
  worker = await createWorker(['rus', 'eng'], 1, {
    workerPath: `${BASE}/worker.min.js`,
    corePath: BASE,
    langPath: `${BASE}/lang`,
    gzip: true,
    workerBlobURL: false,
    logger: (m) => onProgress?.(m),
  })
  await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' })
  return worker
}

export async function ocrCanvas(canvas, onProgress) {
  const w = await getWorker(onProgress)
  const { data } = await w.recognize(canvas)
  return data.text
}

export async function ocrImage(file, onProgress) {
  return ocrCanvas(await prepare(file), onProgress)
}

// PDF: сначала текстовый слой (точно и быстро), для сканов страницы рисуются и читаются как фото.
export async function readPdf(file, onProgress) {
  const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`
  const { pdfToText } = await import('./pdftext.js')
  const data = await file.arrayBuffer()
  const text = await pdfToText(pdfjs, data.slice(0))
  if (text.replace(/\s/g, '').length > 80) return { text, scanned: false }
  // Скан без текстового слоя: рисуем страницы и читаем как изображения.
  const task = pdfjs.getDocument({ data: new Uint8Array(data) })
  const doc = await task.promise
  let out = ''
  for (let n = 1; n <= Math.min(doc.numPages, 4); n++) {
    const page = await doc.getPage(n)
    const vp = page.getViewport({ scale: 2200 / page.getViewport({ scale: 1 }).width })
    const c = document.createElement('canvas')
    c.width = Math.round(vp.width)
    c.height = Math.round(vp.height)
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
    out += (await ocrCanvas(c, onProgress)) + '\n'
  }
  await task.destroy()
  return { text: out, scanned: true }
}

export async function stopOcr() {
  if (worker) await worker.terminate()
  worker = null
}
