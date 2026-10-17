import { Button } from '../components/ui'
import { DOCS } from '../legal/docs.js'

export const KIND = { agreement: 'Соглашение', policy: 'Политика', consent: 'Согласие', template: 'Шаблон документа' }

export function DocLink({ id, children }) {
  return (
    <a href={`#/legal/${id}`} target="_blank" rel="noreferrer" className="text-accent-dark underline underline-offset-2">
      {children || DOCS[id].title}
    </a>
  )
}

export function Draft() {
  return (
    <p className="no-print rounded-xl bg-alert-soft p-3 text-sm">
      <strong>Черновик.</strong> Текст подготовлен для прототипа и не является юридической консультацией. До запуска его должен проверить юрист по персональным данным, а реквизиты в квадратных скобках нужно заполнить.
    </p>
  )
}

export default function Legal({ id }) {
  if (!id)
    return (
      <div className="py-4">
        <h1 className="mb-3 text-2xl font-semibold">Юридические документы</h1>
        <Draft />
        <ul className="mt-4 space-y-2">
          {Object.values(DOCS).map((d) => (
            <li key={d.id} className="rounded-2xl border border-line bg-card p-4">
              <div className="text-sm text-muted">{KIND[d.kind]}</div>
              <DocLink id={d.id} />
            </li>
          ))}
        </ul>
      </div>
    )

  const d = DOCS[id]
  if (!d) return <p className="py-6 text-muted">Документ не найден.</p>
  return (
    <article className="space-y-4 py-4">
      <div>
        <div className="text-sm text-muted">{KIND[d.kind]} · версия {d.version}</div>
        <h1 className="text-2xl font-semibold leading-tight">{d.title}</h1>
      </div>
      <Draft />
      {d.sections.map(([h, ps]) => (
        <section key={h}>
          <h2 className="mb-1 text-lg font-semibold">{h}</h2>
          {ps.map((p, i) => (
            <p key={i} className="mb-2">
              {p}
            </p>
          ))}
        </section>
      ))}
      <div className="no-print flex gap-3 pt-2">
        {d.kind === 'template' && <Button onClick={() => window.print()}>Распечатать</Button>}
        <a href="#/legal" className="flex min-h-12 items-center text-accent-dark underline underline-offset-2">
          Все документы
        </a>
      </div>
    </article>
  )
}
