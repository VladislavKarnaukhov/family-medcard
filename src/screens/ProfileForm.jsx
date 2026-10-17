import { useState } from 'react'
import { Button, Card, Field, go } from '../components/ui'
import { actions } from '../lib/store'

export default function ProfileForm({ profile, isNew }) {
  const editing = isNew ? null : profile
  const [f, setF] = useState({
    name: editing?.name ?? '',
    birthYear: editing?.birthYear ?? '',
    sex: editing?.sex ?? '',
    notes: editing?.notes ?? '',
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const year = f.birthYear === '' ? null : Number(f.birthYear)
  const yearBad = year != null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear())
  const valid = f.name.trim() && !yearBad

  if (!isNew && !profile) return <p className="py-6 text-muted">Профиль не найден.</p>

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-2xl font-semibold">{editing ? `Профиль: ${editing.name}` : 'Новый профиль'}</h1>
      <Card className="space-y-4">
        <Field label="Имя">
          <input value={f.name} onChange={set('name')} placeholder="Например, Мама" autoFocus={isNew} />
        </Field>
        <Field label="Год рождения" hint={yearBad ? 'Проверьте год рождения' : undefined}>
          <input inputMode="numeric" value={f.birthYear} onChange={set('birthYear')} placeholder="1960" />
        </Field>
        <Field label="Пол">
          <select value={f.sex} onChange={set('sex')}>
            <option value="">Не указан</option>
            <option value="f">Женский</option>
            <option value="m">Мужской</option>
          </select>
        </Field>
        <Field label="Хронические заболевания и лекарства" hint="Свободный текст — попадёт в сводку для врача.">
          <textarea value={f.notes} onChange={set('notes')} placeholder="Что и в какой дозировке принимает, что уже диагностировано врачом" />
        </Field>
      </Card>
      <Button
        big
        disabled={!valid}
        onClick={() => {
          actions.saveProfile({ id: editing?.id, ...f, birthYear: year })
          go('')
        }}
      >
        Сохранить
      </Button>
      {editing && (
        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            if (confirm(`Удалить профиль «${editing.name}» вместе с анализами и замерами?`)) {
              actions.deleteProfile(editing.id)
              go('')
            }
          }}
        >
          Удалить профиль
        </Button>
      )}
    </div>
  )
}
