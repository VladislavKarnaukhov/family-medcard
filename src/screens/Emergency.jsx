import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Button, Card, Empty, ErrorText, H, Notice, PageHeader, Spinner, Toggle } from '../components/ui'

import { Footer, Wordmark } from '../components/Layout'
import { api } from '../lib/api'
import { actions, can } from '../lib/store'
import { DocLink } from './Legal'

// Один и тот же вид для предпросмотра владельцу и для публичной страницы.
export function CardView({ c, as: Title = 'h1' }) {
  return (
    <div className="space-y-6">
      <div>
        <Title className="text-[2.25rem] leading-tight">{c.name}</Title>
        {c.birthYear && <p className="mt-1 text-xl text-muted">{c.birthYear} г. р.</p>}
      </div>
      <Block title="Аллергии">{c.allergies || 'Не указаны'}</Block>
      <Block title="Хронические заболевания (со слов)">{c.conditions || 'Не указаны'}</Block>
      <Block title="Принимает сейчас">
        {c.medications.length ? (
          <ul className="space-y-1">
            {c.medications.map((m, i) => (
              <li key={i}>
                <span className="font-semibold">{m.name}</span>
                {m.dose ? `, ${m.dose}` : ''}
                {m.times.length ? ` · ${m.times.join(', ')}` : ' · по необходимости'}
              </li>
            ))}
          </ul>
        ) : (
          'Не указано'
        )}
      </Block>
      <Block title="Кому позвонить">
        {c.contacts.length ? (
          <ul className="space-y-2">
            {c.contacts.map((x, i) => (
              <li key={i}>
                <span className="font-semibold">{x.name}</span>
                {x.relation ? `, ${x.relation}` : ''}
                <a className="mt-0.5 block text-2xl font-semibold text-accent-dark" href={`tel:${x.phone.replace(/[^\d+]/g, '')}`}>{x.phone}</a>
              </li>
            ))}
          </ul>
        ) : (
          'Не указаны'
        )}
      </Block>
    </div>
  )
}

const Block = ({ title, children }) => (
  <section className="border-t border-line pt-4">
    <h2 className="mb-1.5 text-base font-medium text-muted">{title}</h2>
    <div className="whitespace-pre-wrap text-xl">{children}</div>
  </section>
)

// Публичная страница по QR: без входа и без меню.
export function Sos({ token }) {
  const [c, setC] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    api('GET', `/api/emergency/${token}`).then(setC).catch((e) => setErr(e.message))
  }, [token])
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-4 py-5"><Wordmark /></header>
      <main className="mx-auto w-full max-w-[640px] flex-1 px-4 pb-10">
        {err ? <Empty icon="lock">{err}</Empty> : !c ? <div className="py-20 text-center"><Spinner /></div> : <><p className="mb-4 text-sm text-muted">Экстренная карточка</p><CardView c={c} /></>}
      </main>
      <Footer />
    </div>
  )
}

const SIZES = { a6: { name: 'Для холодильника (A6)', css: '@page{size:105mm 148mm;margin:6mm}', qr: 280, w: '93mm' }, card: { name: 'Для кошелька (визитка)', css: '@page{size:85mm 55mm;margin:3mm}', qr: 170, w: '79mm' } }

async function printCard(url, name, size) {
  const s = SIZES[size]
  const png = await QRCode.toDataURL(url, { margin: 1, width: s.qr })
  const w = window.open('', '_blank', 'width=520,height=720')
  if (!w) return false
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  w.document.write(`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Экстренная карточка</title><style>${s.css}body{font-family:system-ui,Arial,sans-serif;margin:0;width:${s.w};text-align:center;color:#26332f}h1{font-size:${size === 'a6' ? '20px' : '12px'};margin:${size === 'a6' ? '6mm 0 4mm' : '1mm 0'}}img{width:${size === 'a6' ? '70mm' : '34mm'};height:auto}p{margin:2mm 0;font-size:${size === 'a6' ? '13px' : '8px'}}small{display:block;color:#67685f;font-size:${size === 'a6' ? '10px' : '6px'}}</style><body><h1>${esc(name)}</h1><img src="${png}" alt="QR-код"><p>Экстренная карточка: отсканируйте камерой телефона</p><small>Сервис не заменяет консультацию врача</small><script>onload=()=>setTimeout(()=>print(),200)</script></body></html>`)
  w.document.close()
  return true
}

export default function Emergency({ state, profile }) {
  const { owner } = can(state)
  const [ok1, setOk1] = useState(false)
  const [ok2, setOk2] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState('')
  const link = profile ? state.emergency[profile.id] : null
  const url = link ? `${location.origin}/#/sos/${link.token}` : ''
  useEffect(() => {
    if (url) QRCode.toDataURL(url, { margin: 1, width: 220 }).then(setQr)
    else setQr('')
  }, [url])
  if (!profile) return <Empty>Сначала создайте профиль.</Empty>
  if (!owner) return <Empty icon="lock">Карточку создаёт владелец.</Empty>
  const card = {
    name: profile.name,
    birthYear: profile.birthYear,
    allergies: profile.allergies,
    conditions: profile.notes,
    medications: state.medications.filter((m) => m.profileId === profile.id && m.status === 'active').map((m) => ({ name: m.name, dose: m.dose, times: m.times })),
    contacts: profile.emergencyContacts || [],
  }
  const run = async (fn) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  const hasContacts = card.contacts.length > 0
  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title="Экстренная карточка" subtitle="Страница для скорой по QR-коду: открывается без входа. Покажите её фельдшеру или оставьте на холодильнике." back={{ href: '#/', label: 'Главная' }} />

      <H>Что увидит любой, у кого будет ссылка</H>
      <Card className="max-w-[560px]"><CardView c={card} as="h2" /></Card>
      <p className="mt-3 text-sm text-muted">Аллергии, заболевания и контакты редактируются в <a className="font-medium text-accent-dark underline" href="#/profile">профиле</a>. Лекарства берутся из раздела «Лекарства».</p>

      {link ? (
        <>
          <H>Ссылка и печать</H>
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center gap-5">
              {qr && <img src={qr} alt="QR-код экстренной карточки" width="150" height="150" className="rounded-lg" />}
              <p className="min-w-0 flex-1 select-all break-all text-sm text-muted">{url}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(SIZES).map(([k, s]) => (
                <Button key={k} variant="soft" icon="printer" onClick={() => printCard(url, profile.name, k)}>{s.name}</Button>
              ))}
            </div>
            <p className="text-sm text-muted">Ссылка без срока. Каждое открытие записывается в журнал. Если карточка потерялась, отзовите ссылку и создайте новую.</p>
            <ErrorText>{err}</ErrorText>
            <Button variant="danger" disabled={busy} onClick={() => confirm('Отозвать ссылку? Старый QR-код перестанет работать.') && run(() => actions.revokeEmergency(profile.id))}>Отозвать ссылку</Button>
          </Card>
        </>
      ) : (
        <>
          <H>Открыть карточку по ссылке</H>
          <Card className="space-y-4">
            <Notice>Любой, у кого окажется распечатка или QR-код, увидит эти сведения без входа. Храните карточку там, где её найдут только те, кому она нужна.</Notice>
            <Toggle checked={ok1} onChange={setOk1}>
              Подтверждаю, что человек, чьи данные открываются (или его законный представитель), согласен на показ этих сведений по постоянной ссылке. <DocLink id="consent_emergency">Документ</DocLink>
            </Toggle>
            {hasContacts && (
              <Toggle checked={ok2} onChange={setOk2}>
                Люди, чьи телефоны указаны в карточке, согласны на то, что их имя и телефон будут видны по ссылке.
              </Toggle>
            )}
            <ErrorText>{err}</ErrorText>
            <Button icon="link" disabled={busy || !ok1 || (hasContacts && !ok2)} onClick={() => run(() => actions.createEmergency(profile.id, ok2))}>Создать карточку и QR-код</Button>
          </Card>
        </>
      )}
    </div>
  )
}
