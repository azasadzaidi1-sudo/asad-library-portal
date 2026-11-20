import { useState } from 'react'
import { borrowingRecord, formatDate, memberSince } from '../lib/catalogue'
import { decideBorrower, decideRequest } from '../lib/library'

// Librarians only: what's waiting for their OK. First-time borrowers come
// first, with who vouches for them; then Restricted Section requests.
export default function ApprovalBox({ library, onOpenBook }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const { newBorrowers, restricted } = library.approvals

  if (newBorrowers.length === 0 && restricted.length === 0) return null

  async function decide(id, action) {
    setBusyId(id)
    setError('')
    try {
      await action()
      await library.refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  const bookButton = (bookId) => (
    <button type="button" className="link-button" onClick={() => onOpenBook(bookId)}>
      {library.booksById.get(bookId)?.title ?? 'a book'}
    </button>
  )

  return (
    <section className="approvals" aria-labelledby="approvals-title">
      <h2 id="approvals-title" className="approvals-title">Waiting for your approval</h2>
      <ul>
        {newBorrowers.map((b) => {
          const name = b.name || 'A new member'
          return (
            <li key={b.borrower_id} className="approval approval-new">
              <p className="approval-kind">New borrower</p>
              <p className="approval-lead">
                <strong>{name}</strong> wants to borrow from you for the first time
              </p>
              <p className="approval-book">
                Asked for {b.book_id ? bookButton(b.book_id) : 'a book'} on {formatDate(b.requested_at)}
              </p>
              {b.note && <blockquote className="approval-note">{b.note}</blockquote>}
              <dl className="approval-facts">
                <dt>Invited by</dt>
                <dd>{b.invited_by_name ?? 'Not recorded'}</dd>
                <dt>Already borrows from</dt>
                <dd>{b.also_borrows_from?.length ? b.also_borrows_from.join(', ') : 'No one yet'}</dd>
                <dt>Member since</dt>
                <dd>{memberSince(b.member_since)}</dd>
                <dt>Borrowing record</dt>
                <dd>{borrowingRecord(b)}</dd>
              </dl>
              <div className="approval-actions">
                <button type="button" className="button" disabled={busyId === b.borrower_id}
                  onClick={() => decide(b.borrower_id, () => decideBorrower(b.borrower_id, true))}>
                  Approve {name}
                </button>
                <button type="button" className="button button-quiet" disabled={busyId === b.borrower_id}
                  onClick={() => decide(b.borrower_id, () => decideBorrower(b.borrower_id, false))}>
                  Decline
                </button>
              </div>
            </li>
          )
        })}

        {restricted.map((r) => (
          <li key={r.id} className="approval">
            <p>
              {library.personName(r.member_id)} asked for {bookButton(r.book_id)} from your Restricted Section
              on {formatDate(r.created_at)}.
            </p>
            <div className="approval-actions">
              <button type="button" className="button" disabled={busyId === r.id}
                onClick={() => decide(r.id, () => decideRequest(r.id, true))}>
                Approve
              </button>
              <button type="button" className="button button-quiet" disabled={busyId === r.id}
                onClick={() => decide(r.id, () => decideRequest(r.id, false))}>
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
      {newBorrowers.length > 0 && (
        <p className="approval-hint">
          Approving someone lets them reserve your books from now on. Restricted books still need your OK each
          time.
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}
