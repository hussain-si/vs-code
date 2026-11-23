import { useEffect, useState } from 'react'
import { isConfigured, supabase } from './lib/supabase'
import AuthScreen from './components/AuthScreen'
import SetupScreen from './components/SetupScreen'
import Workbench from './components/Workbench'

export default function App() {
  return isConfigured ? <AuthGate /> : <SetupScreen />
}

function AuthGate() {
  const [session, setSession] = useState(undefined) // undefined = still checking

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => alive && setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  if (session === undefined) {
    return (
      <div className="splash">
        <img src="/favicon.svg" alt="" />
      </div>
    )
  }
  if (!session) return <AuthScreen />
  return <Workbench key={session.user.id} session={session} />
}
