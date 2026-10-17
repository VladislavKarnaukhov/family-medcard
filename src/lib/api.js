// Тонкая обёртка над fetch. Заголовок x-app нужен серверу как защита от CSRF.
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function parse(res) {
  let data = null
  try {
    data = await res.json()
  } catch {
    /* пустой ответ */
  }
  if (!res.ok) throw new ApiError(data?.error || 'Не удалось выполнить запрос', res.status)
  return data
}

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'x-app': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return parse(res)
}

const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', pdf: 'application/pdf' }

export async function uploadFile(documentId, file) {
  const ext = file.name.split('.').pop().toLowerCase()
  const type = file.type || MIME_BY_EXT[ext] || 'application/octet-stream'
  const res = await fetch(`/api/documents/${documentId}/file`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'x-app': '1', 'content-type': type, 'x-filename': encodeURIComponent(file.name) },
    body: file,
  })
  return parse(res)
}
