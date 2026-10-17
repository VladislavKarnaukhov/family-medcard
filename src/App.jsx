import { useEffect } from 'react'
import { actions, can, init, startPolling, useStore } from './lib/store'
import { useRoute } from './components/ui'
import Layout from './components/Layout'
import AuthScreen, { InviteScreen } from './screens/Auth'
import ShareView from './screens/ShareView'
import Dashboard from './screens/Dashboard'
import AddResult from './screens/AddResult'
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

const Note = ({ title, children }) => (
  <div className="space-y-3 py-8">
    <h1 className="text-2xl font-semibold">{title}</h1>
    <p className="text-muted">{children}</p>
  </div>
)

export default function App() {
  const state = useStore()
  const route = useRoute()

  useEffect(() => {
    init().then(startPolling)
  }, [])

  if (route[0] === 'share')
    return (
      <Layout bare>
        <ShareView token={route[1]} />
      </Layout>
    )
  if (route[0] === 'legal')
    return (
      <Layout bare>
        <Legal id={route[1]} />
      </Layout>
    )
  if (route[0] === 'consent')
    return (
      <Layout bare>
        <SubjectConsent token={route[1]} />
      </Layout>
    )
  if (!state.ready) return <Layout bare><p className="py-8 text-muted">Загрузка…</p></Layout>
  if (route[0] === 'invite')
    return (
      <Layout bare>
        <InviteScreen token={route[1]} user={state.user} />
      </Layout>
    )
  if (!state.user)
    return (
      <Layout bare>
        <AuthScreen />
      </Layout>
    )
  if (state.user.role === 'staff')
    return (
      <Layout bare>
        <Note title="Это учётная запись сотрудника">
          Рабочее место сотрудников находится по адресу <a className="text-accent-dark underline" href="/staff/">/staff/</a>.
        </Note>
        <button className="min-h-12 text-accent-dark underline" onClick={actions.logout}>Выйти</button>
      </Layout>
    )
  if (!state.familyId)
    return (
      <Layout bare state={state}>
        <Note title="Нет доступа к семье">Срок доступа мог истечь. Попросите владельца создать новое приглашение.</Note>
        <button className="min-h-12 text-accent-dark underline" onClick={actions.logout}>Выйти</button>
      </Layout>
    )

  const profile = state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0] || null
  const props = { state, profile }
  const { owner } = can(state)

  if (route[0] === 'privacy')
    return (
      <Layout route={route} state={state}>
        <Privacy state={state} />
      </Layout>
    )
  if (owner && state.consent.stopped) return <Layout bare><Stopped state={state} /></Layout>
  if (owner && !state.consent.ok) return <Layout bare><ConsentGate /></Layout>

  let screen
  switch (route[0]) {
    case 'profile':
      screen = owner ? <ProfileForm {...props} isNew={route[1] === 'new'} /> : <Dashboard {...props} />
      break
    case 'add':
      screen = <AddResult {...props} />
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

  return (
    <Layout route={route} state={state}>
      {screen}
    </Layout>
  )
}
