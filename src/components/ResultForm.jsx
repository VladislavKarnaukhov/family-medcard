import { useEffect, useMemo } from 'react'
import { Button, Card, Field, Toggle } from './ui'
import { Icon } from './icons'
import { findIndicator } from '../lib/indicators'
import { SELF_LAB, emptyRow, rowBad } from '../lib/draft'

// Просмотр бланка (фото или PDF) рядом с формой. file — File, либо url + name для файла с сервера.
export function Preview({ file, url, name, className = '' }) {
  const local = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => local && URL.revokeObjectURL(local), [local])
  const src = local || url
  const label = file?.name || name || ''
  if (!src) return null
  const pdf = file ? file.type === 'application/pdf' || /\.pdf$/i.test(file.name) : /\.pdf$/i.test(label)
  return (
    <div className={`overflow-hidden rounded-2xl border border-line bg-white  ${className}`}>
      {pdf ? (
        <object data={src} type="application/pdf" className="h-[70vh] w-full">
          <p className="p-4 text-muted">Просмотр PDF недоступен в этом браузере: {label}</p>
        </object>
      ) : (
        <img src={src} alt={`Бланк: ${label}`} className="max-h-[75vh] w-full object-contain" />
      )}
    </div>
  )
}

const COLS = 'lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_2.5rem]'

function Row({ row, onChange, onDelete }) {
  const set = (k) => (e) => onChange({ ...row, [k]: e.target.value })
  const known = row.name.trim() === '' || findIndicator(row.name)
  const bad = row.value.trim() !== '' && rowBad({ ...row, name: 'x' })
  const cell = 'lg:!min-h-12 lg:!px-2.5 lg:!py-1.5 lg:placeholder:!text-transparent'
  return (
    <li className={`tabular-nums grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-line bg-white p-3 lg:items-start lg:gap-2 lg:border-0 lg:bg-transparent lg:p-0 ${COLS}`}>
      <div className="col-span-2 lg:col-span-1">
        <Field label={<span className="lg:sr-only">Показатель</span>}>
          <input value={row.name} onChange={set('name')} className={cell} placeholder="Название как на бланке" />
        </Field>
        {!known && <p className="mt-1 text-xs text-muted">Нет в справочнике: график построится по названию.</p>}
        {row.low && <p className="mt-1 text-xs text-accent-dark">Проверьте по бланку{row.source ? `: «${row.source}»` : ''}</p>}
      </div>
      <Field label={<span className="lg:sr-only">Значение</span>}>
        <input inputMode="decimal" value={row.value} onChange={set('value')} aria-invalid={bad} className={`${cell} ${bad ? '!border-alert' : row.low ? '!border-accent-mid' : ''}`} placeholder="Значение" />
      </Field>
      <Field label={<span className="lg:sr-only">Единица</span>}>
        <input value={row.unit} onChange={set('unit')} className={cell} placeholder="Единица" />
      </Field>
      <Field label={<span className="lg:sr-only">Диапазон лаборатории от</span>}>
        <input inputMode="decimal" value={row.refLow} onChange={set('refLow')} className={cell} placeholder="Диапазон от" />
      </Field>
      <Field label={<span className="lg:sr-only">Диапазон лаборатории до</span>}>
        <input inputMode="decimal" value={row.refHigh} onChange={set('refHigh')} className={cell} placeholder="Диапазон до" />
      </Field>
      <div className="col-span-2 flex justify-end lg:col-span-1 lg:mt-1.5 lg:justify-center">
        <button type="button" onClick={onDelete} aria-label="Убрать строку" className="flex h-12 w-12 items-center justify-center rounded-lg text-muted hover:bg-alert-soft hover:text-alert">
          <Icon name="trash" size={18} />
        </button>
      </div>
    </li>
  )
}

// Форма анализа: дата, лаборатория и таблица показателей.
export function ResultForm({ draft, onChange }) {
  const patch = (p) => onChange({ ...draft, ...p })
  return (
    <div className="space-y-5">
      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label="Дата анализа">
          <input type="date" value={draft.date} onChange={(e) => patch({ date: e.target.value })} />
        </Field>
        {draft.labName === SELF_LAB ? (
          <Field label="Источник">
            <input value="Измерено самостоятельно" readOnly />
          </Field>
        ) : (
          <Field label="Лаборатория">
            <input value={draft.labName} onChange={(e) => patch({ labName: e.target.value })} placeholder="Как на бланке" />
          </Field>
        )}
        <div className="sm:col-span-2">
          <Toggle checked={draft.labName === SELF_LAB} onChange={(on) => patch({ labName: on ? SELF_LAB : '' })}>
            Измерял(а) сам(а) или бланка нет. Диапазон лаборатории можно не указывать.
          </Toggle>
        </div>
      </Card>

      <div>
        <div className={`mb-2 hidden gap-2 px-0 text-sm font-medium text-muted lg:grid ${COLS}`} aria-hidden>
          <span>Показатель</span>
          <span>Значение</span>
          <span>Единица</span>
          <span>Диапазон от</span>
          <span>Диапазон до</span>
          <span />
        </div>
        <ul className="space-y-3 lg:space-y-2">
          {draft.rows.map((r, i) => (
            <Row key={i} row={r} onChange={(x) => patch({ rows: draft.rows.map((y, j) => (j === i ? x : y)) })} onDelete={() => patch({ rows: draft.rows.filter((_, j) => j !== i) })} />
          ))}
        </ul>
        <Button variant="soft" icon="plus" className="mt-4" onClick={() => patch({ rows: [...draft.rows, emptyRow()] })}>
          Добавить строку
        </Button>
      </div>
    </div>
  )
}
