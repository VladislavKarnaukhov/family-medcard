import { Component, useEffect, useState } from 'react'

// Если экран упал, человек видит спокойное сообщение и может перезагрузить страницу, а не белый экран.
export class ErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e) {
    console.error('ui:', e)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto flex min-h-screen max-w-[440px] flex-col items-start justify-center px-6">
        <h1 className="mb-3 text-[1.75rem]">Что-то пошло не так</h1>
        <p className="mb-6 text-muted">Ваши записи сохранены. Обновите страницу, и всё продолжится с того же места.</p>
        <button className="press min-h-12 rounded-full bg-accent px-6 font-medium text-white" onClick={() => window.location.reload()}>
          Обновить страницу
        </button>
      </main>
    )
  }
}

// Нет связи: предупреждаем сразу, чтобы человек не думал, что отметка сохранилась.
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  if (online) return null
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-50 bg-alert-soft px-4 py-3 text-center text-[0.95rem] text-alert">
      Нет связи. Пока она не вернётся, новые записи не сохранятся.
    </div>
  )
}
