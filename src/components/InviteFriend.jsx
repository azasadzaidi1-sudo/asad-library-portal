import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '../lib/catalogue'
import { cancelInvite, createInvite, inviteLink, inviteState, loadMyInvites } from '../lib/invites'

const SHARE_TEXT = 'Join me on The Common Shelf, a lending library of friends’ bookshelves:'

// On the Libraries page, for every member: make an invitation link, send it
// however you like, and see your open links plus who joined with one in the
// last 14 days (the database only sends those; see my_invites in 10_invites.sql).
export default function InviteFriend() {
  const [invites, setInvites] = useState(null)
  const [fresh, setFresh] = useState(null)
  const [copied, setCopied] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(() => loadMyInvites().then(setInvites).catch((e) => setError(e.message)), [])
  useEffect(() => {
    reload()
  }, [reload])

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      await reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function copy(code) {
    try {
      await navigator.clipboard.writeText(inviteLink(code))
      setCopied(code)
    } catch {
      setError("Copying didn't work. Press and hold the link to copy it instead.")
    }
  }

  async function share(code) {
    try {
      await navigator.share({ title: 'The Common Shelf', text: SHARE_TEXT, url: inviteLink(code) })
    } catch {
      // Closing the share sheet isn't an error.
    }
  }

  const open = (invites ?? []).filter((i) => inviteState(i) === 'open')
  const joined = (invites ?? []).filter((i) => inviteState(i) === 'joined')
  const freshInvite = fresh && open.find((i) => i.code === fresh)
  const older = open.filter((i) => i.code !== fresh)   // the new link is already shown above

  return (
    <section className="invite" aria-labelledby="invite-title">
      <h2 id="invite-title" className="library-name">Invite a friend</h2>
      <p>
        Make a link and send it however you like. It works for one person, for 14 days. Librarians still approve
        anyone who borrows from them for the first time.
      </p>
      <button type="button" className="button" disabled={busy}
        onClick={() => run(async () => setFresh(await createInvite()))}>
        Create an invitation link
      </button>

      {freshInvite && (
        <div className="invite-fresh">
          <p className="invite-link">{inviteLink(freshInvite.code)}</p>
          <div className="form-actions">
            <button type="button" className="button button-quiet" onClick={() => copy(freshInvite.code)}>
              {copied === freshInvite.code ? 'Copied' : 'Copy link'}
            </button>
            {typeof navigator.share === 'function' && (
              <button type="button" className="button button-quiet" onClick={() => share(freshInvite.code)}>Share</button>
            )}
          </div>
          <p className="field-hint">Works once, until {formatDate(freshInvite.expires_at)}.</p>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      {older.length > 0 && (
        <ul className="invite-list">
          {older.map((i) => (
            <li key={i.code}>
              <span>Open link, until {formatDate(i.expires_at)}</span>
              <span className="invite-actions">
                <button type="button" className="link-button" onClick={() => copy(i.code)}>
                  {copied === i.code ? 'Copied' : 'Copy'}
                </button>
                <button type="button" className="link-button" disabled={busy}
                  onClick={() => run(() => cancelInvite(i.code))}>
                  Cancel
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Labelled, so nobody wonders why a friend from a month ago isn't listed. */}
      {joined.length > 0 && (
        <div className="invite-joined">
          <h3 className="invite-list-label">Joined in the last 14 days</h3>
          <ul className="invite-list">
            {joined.map((i) => (
              <li key={i.code}>
                <span>{i.joined_name || 'A new member'} joined on {formatDate(i.used_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
