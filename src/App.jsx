import { useEffect } from 'react'
import { actions, can, init, startPolling, useStore } from './lib/store'
import { Spinner, useRoute } from './components/ui'
import Layout from './components/Layout'
import AuthScreen, { AuthShell, InviteScreen, ResetScreen } from './screens/Auth'
import ShareView from './screens/ShareView'
import Dashboard from './screens/Dashboard'
import AddResult from './screens/AddResult'
import EditResult from './screens/EditResult'
import Indicators from './screens/Indicators'
import Indicator from './screens/Indicator'
import Vitals from './screens/Vitals'
import Summary from './screens/Summary'
import ProfileForm from './screens/ProfileForm'
import Assistant from './screens/Assistant'
import Dossier from './screens/Dossier'
import Circle from './screens/Circle'
import Legal from './screens/Legal'
import ConsentGate from './screens/ConsentGate'
import Privacy, { Stopped } from './screens/Privacy'
import SubjectConsent from './screens/SubjectConsent'
import Today, { DueBanner, TodayContent } from './screens/Today'
import { MedForm, MedsList } from './screens/Meds'
import { VisitForm, VisitsList } from './screens/Visits'
import CareNote from './screens/CareNote'
import Notifications from './screens/Notifications'
import Emergency, { Sos } from './screens/Emergency'
import SimpleShell from './components/SimpleShell'
import { hasMeds } from './lib/care'

const Loading = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Spinner />
  </div>
)

export default function App() {
  const state = useStore()
  const route = useRoute()

  useEffect(() => {
    init().then(startPolling)
  }, [])

  // Публичные страницы без входа
  if (route[0] === 'share')
    return (
      <Layout bare>
        <ShareView token={route[1]} />
      </Layout>
    )
  if (route[0] === 'legal')
    return (
      <Layout bare state={state}>
        <Legal id={route[1]} />
      </Layout>
    )
  if (route[0] === 'sos') return <Sos token={route[1]} />
  if (route[0] === 'consent') return <SubjectConsent token={route[1]} />
  if (route[0] === 'reset') return <ResetScreen token={route[1]} />

  if (!state.ready) return <Loading />
  if (route[0] === 'invite') return <InviteScreen token={route[1]} user={state.user} />
  if (!state.user) return <AuthScreen />

  if (state.user.role === 'staff')
    return (
      <AuthShell>
        <h1 className="mb-2 text-[1.75rem]">Это учётная запись сотрудника</h1>
        <p className="mb-4 text-muted">
          Рабочее место сотрудников находится по адресу{' '}
          <a className="font-medium text-accent-dark underline" href="/staff/">
            /staff/
          </a>
          .
        </p>
        <button className="min-h-11 font-medium text-accent-dark hover:underline" onClick={actions.logout}>
          Выйти
        </button>
      </AuthShell>
    )
  if (!state.familyId)
    return (
      <AuthShell>
        <h1 className="mb-2 text-[1.75rem]">Нет доступа к семье</h1>
        <p className="mb-4 text-muted">Срок доступа мог истечь. Попросите владельца создать новое приглашение.</p>
        <button className="min-h-11 font-medium text-accent-dark hover:underline" onClick={actions.logout}>
          Выйти
        </button>
      </AuthShell>
    )

  const profile = state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0] || null
  const props = { state, profile }
  const { owner } = can(state)

  if (route[0] === 'privacy' && !state.user.simpleMode)
    return (
      <Layout route={route} state={state}>
        <Privacy state={state} />
      </Layout>
    )
  if (owner && state.consent.stopped)
    return (
      <Layout bare>
        <Stopped state={state} />
      </Layout>
    )
  if (owner && !state.consent.ok) return <ConsentGate />

  const profileById = (id) => state.profiles.find((p) => p.id === id) || profile
  const carePage = () => {
    const p = profileById(route[1])
    switch (route[0]) {
      case 'meds':
        return route[2] ? <MedForm state={state} profile={p} id={route[2]} /> : <MedsList state={state} profile={p} />
      case 'visits':
        return route[2] ? <VisitForm state={state} profile={p} id={route[2]} /> : <VisitsList state={state} profile={p} />
      case 'care':
        return <CareNote state={state} profile={p} kind0={route[3]} />
      default:
        return null
    }
  }

  // Простой режим: «Сегодня» своего профиля, без меню и лишних экранов.
  if (state.user.simpleMode && profile) {
    const mine = state.profiles.find((p) => p.id === state.me?.selfProfileId) || profile
    const allowed = ['meds', 'visits', 'care', 'notifications', 'privacy']
    return (
      <>
        <DueBanner state={state} />
        <SimpleShell state={state} route={route}>
          {route[0] === 'notifications' ? (
            <Notifications state={state} />
          ) : route[0] === 'privacy' ? (
            <Privacy state={state} />
          ) : allowed.includes(route[0]) ? (
            carePage()
          ) : (
            <TodayContent state={state} profile={mine} simple />
          )}
        </SimpleShell>
      </>
    )
  }

  let screen
  switch (route[0]) {
    case 'today':
      screen = <Today {...props} />
      break
    case 'meds':
    case 'visits':
    case 'care':
      screen = carePage()
      break
    case 'notifications':
      screen = <Notifications state={state} />
      break
    case 'emergency':
      screen = <Emergency state={state} profile={profileById(route[1])} />
      break
    case 'profile':
      screen = owner ? <ProfileForm {...props} isNew={route[1] === 'new'} /> : <Dashboard {...props} />
      break
    case 'add':
      screen = <AddResult {...props} />
      break
    case 'edit':
      screen = <EditResult state={state} id={route[1]} />
      break
    case 'indicators':
      screen = <Indicators {...props} />
      break
    case 'indicator':
      screen = <Indicator {...props} keyName={decodeURIComponent(route[1] || '')} />
      break
    case 'assistant':
      screen = owner ? <Assistant {...props} /> : <Dashboard {...props} />
      break
    case 'dossier':
      screen = <Dossier {...props} />
      break
    case 'circle':
      screen = owner ? <Circle {...props} /> : <Dashboard {...props} />
      break
    case 'vitals':
      screen = <Vitals {...props} />
      break
    case 'summary':
      screen = <Summary {...props} />
      break
    default:
      screen = <Dashboard {...props} />
  }

  const startToday = !route[0] && state.me?.access !== 'owner' && hasMeds(state)
  return (
    <>
      <DueBanner state={state} />
      <Layout route={route} state={state}>
        {startToday ? <Today {...props} /> : screen}
      </Layout>
    </>
  )
}
