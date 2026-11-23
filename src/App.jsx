import { isConfigured } from './lib/supabase'
import SetupScreen from './components/SetupScreen'
import Workbench from './components/Workbench'

export default function App() {
  return isConfigured ? <Workbench /> : <SetupScreen />
}
