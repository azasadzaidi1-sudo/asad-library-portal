import { useEffect, useState } from 'react'
import { deleteMyAccount, loadDeletionBlockers } from '../lib/account'
import { DELETE_WORD, deleteWordMatches, deletionBlockedReason, longDate } from '../lib/legal'
import Field from './Field'
import InviteFriend from './InviteFriend'
import MeetupAdmin from './MeetupAdmin'
import Notifications from './Notifications'

// Your account: your details, your shelf (with Add a book), the book club
// meet-up (Asad only), inviting a friend, notifications on this device, the
// house rules and privacy notice, and deleting the account. Reached by
// tapping your name at the top.
//   shelfLine: "38 books on your shelf." (see ownShelfLine), null without a
//              shelf, undefined while the library is still loading
export default function Account({ member, email, isLibrarian, shelfLine }) {
  return (
    <div className="account">
      <h1 className="page-title">Your account</h1>

      <section className="shelf" aria-labelledby="details-title">
        <h2 id="details-title" className="shelf-title">Your details</h2>
        <dl className="account-details">
          <dt>Name</dt>
          <dd>{member.name}</dd>
          <dt>City</dt>
          <dd>{member.city || '–'}</dd>
          <dt>Email</dt>
          <dd>{email}</dd>
          {member.created_at && (
            <>
              <dt>Member since</dt>
              <dd>{longDate(member.created_at)}</dd>
            </>
          )}
        </dl>
      </section>

      <YourShelf line={shelfLine} />

      {member.is_admin && <MeetupAdmin />}

      <InviteFriend />

      <Notifications />

      <section className="shelf" aria-labelledby="rules-title">
        <h2 id="rules-title" className="shelf-title">House rules and privacy</h2>
        <p className="account-text">
          {member.rules_accepted_at
            ? `You accepted the house rules on ${longDate(member.rules_accepted_at)}.`
            : 'You accepted the house rules when you joined.'}{' '}
          Read the <a href="#rules">house rules</a> or the <a href="#privacy">privacy notice</a>.
        </p>
      </section>

      <DeleteAccount member={member} isLibrarian={isLibrarian} />
    </div>
  )
}

// Add a book from here as well as from the Libraries page. Members without
// a shelf start one here, with the same words as on the Libraries page.
function YourShelf({ line }) {
  const noShelf = line === null
  return (
    <section className="shelf account-shelf" aria-labelledby="your-shelf-title">
      <h2 id="your-shelf-title" className="shelf-title">Your shelf</h2>
      {line !== undefined && (
        <p className="account-text">
          {noShelf ? "No books on your shelf yet. Add the ones you're happy to lend, and friends can ask to borrow them." : line}
        </p>
      )}
      <a className="button" href="#add-book">{noShelf ? 'Add your first book' : 'Add a book'}</a>
    </section>
  )
}

function DeleteAccount({ member, isLibrarian }) {
  const [blockers, setBlockers] = useState(null)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadDeletionBlockers()
      .then(setBlockers)
      .catch((e) => setError(`Couldn't check your loans: ${e.message}`))
  }, [])

  const blocked = blockers ? deletionBlockedReason(blockers, member.is_admin) : ''
  const ready = blockers && !blocked

  async function remove(event) {
    event.preventDefault()
    if (!deleteWordMatches(typed)) {
      setError(`Type ${DELETE_WORD} to confirm.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      // Signs out afterwards; the sign-in page then says the account is gone.
      await deleteMyAccount()
    } catch (e) {
      setError(`Your account wasn't deleted: ${e.message}`)
      setBusy(false)
    }
  }

  return (
    <section className="shelf" aria-labelledby="delete-title">
      <h2 id="delete-title" className="shelf-title">Delete my account</h2>
      <div className="account-text">
        <p>This can't be undone.</p>
        <ul>
          <li><strong>Deleted:</strong> your sign-in, name, city, notes to librarians, Interested list and invitations.</li>
          <li>
            <strong>Stays, without your name:</strong> records of past loans, and your reviews and replies, shown
            under "Former member". To take your reviews with you, delete them first.
          </li>
          {isLibrarian && (
            <li>
              <strong>Your shelf:</strong> your books leave the catalogue, and requests waiting for them are cancelled.
            </li>
          )}
        </ul>
      </div>

      {!blockers && !error && <p className="shelf-note">Checking your loans…</p>}
      {blocked && <p className="account-blocked">{blocked}</p>}

      {ready && (
        <form onSubmit={remove} className="form account-delete" noValidate>
          <Field label={`Type ${DELETE_WORD} to confirm`}>
            <input value={typed} autoComplete="off" autoCapitalize="characters" spellCheck={false}
              onChange={(e) => {
                setTyped(e.target.value)
                setError('')
              }} />
          </Field>
          <button type="submit" className="button button-danger" disabled={busy || !deleteWordMatches(typed)}>
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}
