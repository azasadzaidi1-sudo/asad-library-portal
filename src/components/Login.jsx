import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    // On success, App notices the new session and shows the catalogue.
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? "That email and password don't match. Check both and try again."
          : `Signing in failed: ${error.message}`,
      )
      setBusy(false)
    }
  }

  return (
    <main className="entry">
      <div className="entry-card">
        <h1 className="entry-title">Asad's Library</h1>
        <p className="entry-lede">
          A lending library for friends. Sign in with the email address Asad invited.
        </p>
        <form onSubmit={signIn} className="form">
          <label>
            Email
            <input type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="entry-note">Not a member yet? Ask Asad for an invitation.</p>
      </div>
    </main>
  )
}
