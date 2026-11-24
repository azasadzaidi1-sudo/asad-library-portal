import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { takeAccountDeletedFlag } from '../lib/account'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Right after "Delete my account", say so once.
  const [justDeleted] = useState(takeAccountDeletedFlag)

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
        <h1 className="entry-title">The Common Shelf</h1>
        {justDeleted && (
          <p className="entry-notice" role="status">
            Your account has been deleted. Thank you for being part of The Common Shelf.
          </p>
        )}
        <p className="entry-lede">
          Friends' bookshelves in one catalogue. Sign in with your email and password.
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
        <p className="entry-note">Not a member yet? Ask a friend on The Common Shelf for an invitation link.</p>
      </div>
    </main>
  )
}
