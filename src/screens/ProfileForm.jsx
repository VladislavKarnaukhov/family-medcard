import { useState } from 'react'
import { Button, Card, ErrorText, Field, PageHeader, Toggle, go } from '../components/ui'
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
    <Card className="space-y-3">
      <p className="font-semibold">Пусть человек подтвердит согласие сам</p>
      <p className="text-[0.95rem] text-muted">Отправьте ему ссылку: он прочитает документ и подпишет его кодом на своей почте. Так согласие запишется от него лично, а не только с ваших слов.</p>
      {link ? (
        <p className="select-all break-all rounded-xl bg-paper px-3 py-2 text-sm">{link}</p>
      ) : (
        <Button
          variant="soft"
          icon="link"
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
      <ErrorText>{err}</ErrorText>
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
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const year = f.birthYear === '' ? null : Number(f.birthYear)
  const yearBad = year != null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear())
  const minor = year != null && year > new Date().getFullYear() - 18
  const basisBad = isNew && (!f.basis || (minor && f.basis !== 'guardian_child'))
  const attestNeeded = isNew && f.basis && f.basis !== 'self'
  const valid = f.name.trim() && !yearBad && !basisBad && (!attestNeeded || f.attest)

  if (!isNew && !profile) return <p className="py-6 text-muted">Профиль не найден.</p>

  return (
    <div className="mx-auto max-w-[680px]">
      <PageHeader title={editing ? `Профиль: ${editing.name}` : 'Новый профиль'} subtitle={editing ? `${BASIS[editing.basis]} · ${CONSENT_LABEL[editing.consentStatus]}` : 'Человек, за здоровьем которого вы следите: свой, мамы, ребёнка.'} back={{ href: '#/', label: 'Главная' }} />
      <div className="space-y-6">
        <Card className="space-y-5">
          <Field label="Имя">
            <input value={f.name} onChange={set('name')} placeholder="Например, Мама" autoFocus={isNew} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
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
          </div>
          <Field label="Хронические заболевания и лекарства" hint="Свободный текст: попадёт в сводку для врача. Это сведения о здоровье.">
            <textarea value={f.notes} onChange={set('notes')} placeholder="Что и в какой дозировке принимает, что уже диагностировано врачом" />
          </Field>
        </Card>

        {isNew && (
          <Card className="space-y-4">
            <Field label="Чьи это данные" hint={minor && f.basis !== 'guardian_child' ? 'По году рождения это несовершеннолетний: данные вносит законный представитель.' : 'Вносить данные другого человека можно только с его согласием или как законному представителю.'}>
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
              <div className="rounded-xl bg-paper p-4">
                <Toggle checked={f.attest} onChange={(v) => setF({ ...f, attest: v })}>
                  {ATTEST[f.basis][1]} <DocLink id={ATTEST[f.basis][0]}>Документ</DocLink>
                </Toggle>
              </div>
            )}
          </Card>
        )}

        <ErrorText>{err}</ErrorText>
        <div className="flex flex-wrap gap-3">
          <Button
            icon="check"
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await actions.saveProfile({ id: editing?.id, ...f, birthYear: year })
                go('')
              } catch (e) {
                setErr(e.message)
                setBusy(false)
              }
            }}
          >
            Сохранить
          </Button>
          <Button variant="ghost" onClick={() => go('')}>
            Отмена
          </Button>
        </div>

        {editing && <SubjectLink profile={editing} />}
        {editing && (
          <div className="stitch-border rounded-2xl p-5">
            <p className="mb-3 text-[0.95rem] text-muted">Удаление профиля уберёт его анализы, замеры и документы без возможности восстановления.</p>
            <Button
              variant="danger"
              icon="trash"
              onClick={async () => {
                if (confirm(`Удалить профиль «${editing.name}» вместе с анализами и замерами?`)) {
                  await actions.deleteProfile(editing.id)
                  go('')
                }
              }}
            >
              Удалить профиль
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
