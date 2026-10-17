import { useState } from 'react'
import { Button, Card, Field, go } from '../components/ui'
import { actions } from '../lib/store'
import { DocLink } from './Legal'

export const BASIS = {
  self: 'Это мои данные',
  adult: 'Данные взрослого члена семьи, он согласен',
  guardian_child: 'Данные ребёнка, я законный представитель',
  guardian_ward: 'Данные подопечного, я опекун или попечитель',
}
const ATTEST = {
  adult: ['consent_adult', 'Подтверждаю, что этот человек дееспособен, знает о ведении его досье и согласен на обработку данных о его здоровье.'],
  guardian_child: ['consent_guardian', 'Подтверждаю, что я родитель, усыновитель или опекун этого ребёнка, и от его имени даю согласие на обработку данных о его здоровье.'],
  guardian_ward: ['consent_guardian', 'Подтверждаю, что я опекун или попечитель этого человека, и от его имени даю согласие на обработку данных о его здоровье.'],
}

export const CONSENT_LABEL = { self: 'Свои данные', attested: 'Согласие заявлено владельцем', confirmed: 'Согласие подтверждено самим человеком' }

function SubjectLink({ profile }) {
  const [link, setLink] = useState('')
  const [err, setErr] = useState('')
  if (profile.basis !== 'adult' || profile.consentStatus === 'confirmed') return null
  return (
    <Card className="space-y-2">
      <p className="font-medium">Пусть человек подтвердит согласие сам</p>
      <p className="text-sm text-muted">Отправьте ему ссылку: он прочитает документ и подпишет его кодом на своей почте. Так согласие запишется от него лично, а не только с ваших слов.</p>
      {link ? (
        <p className="break-all rounded-xl bg-paper p-3 text-sm select-all">{link}</p>
      ) : (
        <Button
          variant="soft"
          className="w-full"
          onClick={async () => {
            try {
              setLink(await actions.subjectLink(profile.id))
            } catch (e) {
              setErr(e.message)
            }
          }}
        >
          Создать ссылку
        </Button>
      )}
      {err && <p role="alert" className="text-alert">{err}</p>}
    </Card>
  )
}

export default function ProfileForm({ profile, isNew }) {
  const editing = isNew ? null : profile
  const [f, setF] = useState({
    name: editing?.name ?? '',
    birthYear: editing?.birthYear ?? '',
    sex: editing?.sex ?? '',
    notes: editing?.notes ?? '',
    basis: editing?.basis ?? '',
    attest: false,
  })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const year = f.birthYear === '' ? null : Number(f.birthYear)
  const yearBad = year != null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear())
  const minor = year != null && year > new Date().getFullYear() - 18
  const basisBad = isNew && (!f.basis || (minor && f.basis !== 'guardian_child'))
  const attestNeeded = isNew && f.basis && f.basis !== 'self'
  const valid = f.name.trim() && !yearBad && !basisBad && (!attestNeeded || f.attest)

  if (!isNew && !profile) return <p className="py-6 text-muted">Профиль не найден.</p>

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-2xl font-semibold">{editing ? `Профиль: ${editing.name}` : 'Новый профиль'}</h1>
      {editing && <p className="text-sm text-muted">{BASIS[editing.basis]} · {CONSENT_LABEL[editing.consentStatus]}</p>}
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
        <Field label="Хронические заболевания и лекарства" hint="Свободный текст — попадёт в сводку для врача. Это сведения о здоровье.">
          <textarea value={f.notes} onChange={set('notes')} placeholder="Что и в какой дозировке принимает, что уже диагностировано врачом" />
        </Field>
      </Card>

      {isNew && (
        <Card className="space-y-3">
          <Field label="Чьи это данные" hint={minor && f.basis !== 'guardian_child' ? 'По году рождения это несовершеннолетний: данные вносит законный представитель.' : undefined}>
            <select value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value, attest: false })}>
              <option value="">Выберите…</option>
              {Object.entries(BASIS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          {attestNeeded && (
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={f.attest} onChange={(e) => setF({ ...f, attest: e.target.checked })} className="!mt-1 !h-6 !min-h-0 !w-6 shrink-0" />
              <span className="text-sm">
                {ATTEST[f.basis][1]} <DocLink id={ATTEST[f.basis][0]}>Документ</DocLink>
              </span>
            </label>
          )}
          <p className="text-sm text-muted">Вносить данные другого человека можно только с его согласием или как законному представителю.</p>
        </Card>
      )}

      {err && <p role="alert" className="rounded-xl bg-alert-soft p-3 text-alert">{err}</p>}
      <Button
        big
        disabled={!valid}
        onClick={async () => {
          try {
            await actions.saveProfile({ id: editing?.id, ...f, birthYear: year })
            go('')
          } catch (e) {
            setErr(e.message)
          }
        }}
      >
        Сохранить
      </Button>
      {editing && <SubjectLink profile={editing} />}
      {editing && (
        <Button
          variant="danger"
          className="w-full"
          onClick={async () => {
            if (confirm(`Удалить профиль «${editing.name}» вместе с анализами и замерами?`)) {
              await actions.deleteProfile(editing.id)
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
