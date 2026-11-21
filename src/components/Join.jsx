import { useEffect, useState } from 'react'
import { checkInvite, joinWithInvite } from '../lib/invites'
import Field from './Field'

const PASSWORD_MIN = 8

// Where an invitation link leads: who invited you, then your name, city,
// email and a password of your own. Afterwards you're signed in.
export default function Join({ code, onSignIn }) {
  const [invite, setInvite] = useState(null)
  const [form, setForm] = useState({ name: '', city: '', email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    checkInvite(code)
      .then(setInvite)
      .catch(() => setInvite({ inviter_name: null, status: 'error' }))
  }, [code])

  const update = (key) => (event) => {
    setForm({ ...form, [key]: event.target.value })
    setErrors({ ...errors, [key]: '' })
  }

  async function join(event) {
    event.preventDefault()
    const problems = {}
    if (!form.name.trim()) problems.name = 'Enter your name.'
    if (!form.city.trim()) problems.city = 'Enter your city.'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) problems.email = 'Enter your email address.'
    if (form.password.length < PASSWORD_MIN) problems.password = `Use at least ${PASSWORD_MIN} characters.`
    setErrors(problems)
    if (Object.keys(problems).length) return

    setBusy(true)
    setError('')
    try {
      await joinWithInvite({
        code,
        name: form.name.trim(),
        city: form.city.trim(),
        email: form.email.trim(),
        password: form.password,
      })
      // Signed in: App notices the new session; leave the invitation address behind.
      window.history.replaceState(null, '', window.location.pathname)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  let body
  if (!invite) {
    body = <p className="entry-lede">Checking your invitation…</p>
  } else if (invite.status !== 'valid') {
    const who = invite.inviter_name ?? 'the friend who sent it'
    body = (
      <>
        <p className="entry-lede">
          {invite.status === 'used' && 'This invitation has already been used. '}
          {invite.status === 'expired' && 'This invitation has expired. '}
          {invite.status === 'unknown' && "This invitation link doesn't work. "}
          {invite.status === 'error' && "The invitation couldn't be checked. Check your connection and reload. "}
          {invite.status !== 'error' && `Ask ${who} for a new link.`}
        </p>
        <button type="button" className="link-button" onClick={onSignIn}>Already a member? Sign in</button>
      </>
    )
  } else {
    body = (
      <>
        <p className="entry-lede">
          <strong>{invite.inviter_name || 'A friend'}</strong> invited you to The Common Shelf: friends' bookshelves in
          one catalogue. Browse every shelf, borrow books in person, and meet other readers through them.
        </p>
        <form onSubmit={join} className="form" noValidate>
          <Field label="Your name" error={errors.name}>
            <input autoComplete="name" value={form.name} onChange={update('name')} />
          </Field>
          <Field label="Your city" error={errors.city}
            hint="Stays private, unless you add books of your own: then it shows next to your shelf.">
            <input autoComplete="address-level2" value={form.city} onChange={update('city')} />
          </Field>
          <Field label="Email" error={errors.email} hint="You'll sign in with this.">
            <input type="email" autoComplete="email" value={form.email} onChange={update('email')} />
          </Field>
          <Field label="Password" error={errors.password} hint={`At least ${PASSWORD_MIN} characters.`}>
            <input type="password" autoComplete="new-password" value={form.password} onChange={update('password')} />
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Joining…' : 'Join The Common Shelf'}
          </button>
        </form>
        <p className="entry-note">
          Already a member?{' '}
          <button type="button" className="link-button" onClick={onSignIn}>Sign in</button>
        </p>
      </>
    )
  }

  return (
    <main className="entry">
      <div className="entry-card">
        <h1 className="entry-title">The Common Shelf</h1>
        {body}
      </div>
    </main>
  )
}
