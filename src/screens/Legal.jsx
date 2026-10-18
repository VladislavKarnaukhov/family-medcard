import { Button, Notice } from '../components/ui'
import { Icon } from '../components/icons'
import { DOCS } from '../legal/docs.js'

export const KIND = { agreement: 'Соглашение', policy: 'Политика', consent: 'Согласие', template: 'Шаблон документа' }

export function DocLink({ id, children }) {
  return (
    <a href={`#/legal/${id}`} target="_blank" rel="noreferrer" className="font-medium text-accent-dark underline underline-offset-2 hover:text-accent">
      {children || DOCS[id].title}
    </a>
  )
}

export function Draft() {
  return (
    <Notice tone="alert" className="no-print">
      <strong>Черновик.</strong> Текст подготовлен как основа и не является юридической консультацией. До запуска его должен проверить юрист по персональным данным, а реквизиты в квадратных скобках нужно заполнить.
    </Notice>
  )
}

export default function Legal({ id }) {
  if (!id)
    return (
      <div>
        <h1 className="mb-4 text-[1.75rem]">Юридические документы</h1>
        <Draft />
        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sheet ">
          {Object.values(DOCS).map((d) => (
            <li key={d.id} className="flex items-center gap-4 px-4 py-3.5">
              <Icon name="file" className="text-accent" />
              <div>
                <p className="text-sm text-muted">{KIND[d.kind]}</p>
                <DocLink id={d.id} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    )

  const d = DOCS[id]
  if (!d) return <p className="py-6 text-muted">Документ не найден.</p>
  return (
    <article className="space-y-5">
      <div>
        <p className="text-sm font-medium text-muted">
          {KIND[d.kind]} · версия {d.version}
        </p>
        <h1 className="mt-1 text-[1.75rem] leading-tight">{d.title}</h1>
      </div>
      <Draft />
      {d.sections.map(([h, ps]) => (
        <section key={h}>
          <h2 className="mb-1.5 text-lg">{h}</h2>
          {ps.map((p, i) => (
            <p key={i} className="mb-2.5 max-w-[68ch]">
              {p}
            </p>
          ))}
        </section>
      ))}
      <div className="no-print flex flex-wrap items-center gap-4 pt-2">
        {d.kind === 'template' && (
          <Button icon="printer" onClick={() => window.print()}>
            Распечатать
          </Button>
        )}
        <a href="#/legal" className="font-medium text-accent-dark hover:underline">
          Все документы
        </a>
      </div>
    </article>
  )
}
