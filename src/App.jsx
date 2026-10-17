import { useStore } from './lib/store'
import { useRoute } from './components/ui'
import Layout from './components/Layout'
import Dashboard from './screens/Dashboard'
import AddResult from './screens/AddResult'
import Indicators from './screens/Indicators'
import Indicator from './screens/Indicator'
import Vitals from './screens/Vitals'
import Summary from './screens/Summary'
import ProfileForm from './screens/ProfileForm'

export default function App() {
  const state = useStore()
  const route = useRoute()
  const profile = state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0] || null
  const props = { state, profile }

  let screen
  switch (route[0]) {
    case 'profile':
      screen = <ProfileForm {...props} isNew={route[1] === 'new'} />
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
