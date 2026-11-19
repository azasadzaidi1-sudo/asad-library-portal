import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import CompleteProfile from './components/CompleteProfile'
import Header from './components/Header'
import Catalogue from './components/Catalogue'

// The app has three screens, chosen by who is visiting:
//   not signed in          -> Login
//   signed in, no name yet -> CompleteProfile (first visit after an invite)
//   signed in with a name  -> the catalogue
export default function App() {
  // undefined = still checking, null = signed out, object = signed in
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <p className="status-page">Opening the library…</p>
  if (!session) return <Login />
  return <MemberArea userId={session.user.id} />
}

function MemberArea({ userId }) {
  const [member, setMember] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('members')
      .select('id, name, city, role')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => (error ? setError(error.message) : setMember(data)))
  }, [userId])

  if (error) {
    return (
      <p className="status-page" role="alert">
        Your member profile couldn't load: {error}. Refresh the page to try again.
      </p>
    )
  }
  if (!member) return <p className="status-page">Finding your library card…</p>
  if (!member.name) return <CompleteProfile member={member} onSaved={setMember} />

  return (
    <>
      <Header member={member} />
      <main className="catalogue">
        <Catalogue />
      </main>
    </>
  )
}
