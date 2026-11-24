import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { acceptHouseRules, useContactDetails } from '../lib/account'
import { RULES_VERSION } from '../lib/legal'
import HouseRules from './HouseRules'
import LegalDialog from './LegalDialog'

// Shown once to members who joined before the house rules existed (or when
// the rules change): read them, accept, carry on. New members accept on the
// Join page instead, so they never see this.
export default function AcceptRules({ member, onAccepted }) {
  const contact = useContactDetails()
  const [accepted, setAccepted] = useState(false)
  const [reading, setReading] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function accept(event) {
    event.preventDefault()
    if (!accepted) {
      setError('Tick the box to accept the house rules.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await acceptHouseRules(RULES_VERSION)
      onAccepted({ ...member, rules_version: RULES_VERSION, rules_accepted_at: new Date().toISOString() })
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  // The rules link to the privacy notice (opens in a pop-up); the Account
  // page waits until the rules are accepted.
  const linkTo = (page, label) =>
    page === 'privacy' ? (
      <button type="button" className="link-button" onClick={() => setReading('privacy')}>{label}</button>
    ) : (
      label
    )

  return (
    <main className="entry">
      <div className="entry-card entry-card-wide">
        <h1 className="entry-title">House rules</h1>
        <p className="entry-lede">
          {member.rules_version
            ? 'The house rules have changed. Please read them and accept to carry on.'
            : 'The Common Shelf now has short house rules and a privacy notice. Please read the rules and accept them to carry on.'}
        </p>
        <div className="legal-scroll" tabIndex={0} aria-label="House rules">
          <HouseRules contact={contact} linkTo={linkTo} />
        </div>
        <form onSubmit={accept} className="form" noValidate>
          <label className="checkbox">
            <input type="checkbox" checked={accepted}
              onChange={(e) => {
                setAccepted(e.target.checked)
                setError('')
              }} />
            I'm 18 or older and accept the house rules.
          </label>
          <p className="accept-rules-links">
            How your data is handled:{' '}
            <button type="button" className="link-button" onClick={() => setReading('privacy')}>privacy notice</button>.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Saving…' : 'Accept and continue'}
          </button>
        </form>
        <p className="entry-note">
          Rather not? Email Asad and he'll close your account, or{' '}
          <button type="button" className="link-button" onClick={() => supabase.auth.signOut()}>sign out</button>.
        </p>
      </div>
      {reading && <LegalDialog initial={reading} contact={contact} onClose={() => setReading(null)} />}
    </main>
  )
}
