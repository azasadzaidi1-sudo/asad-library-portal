import { useState } from 'react'
import { formatDate } from '../lib/catalogue'
import { decideRequest } from '../lib/library'

// Librarian only: Restricted Section requests waiting for a decision.
export default function ApprovalBox({ library, onOpenBook }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  if (library.approvals.length === 0) return null

  async function decide(id, approve) {
    setBusyId(id)
    setError('')
    try {
      await decideRequest(id, approve)
      await library.refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="approvals" aria-labelledby="approvals-title">
      <h2 id="approvals-title" className="approvals-title">Waiting for your approval</h2>
      <ul>
        {library.approvals.map((r) => {
          const book = library.booksById.get(r.book_id)
          const who = r.member?.name
            ? `${r.member.name}${r.member.city ? ` (${r.member.city})` : ''}`
            : 'A new member'
          return (
            <li key={r.id} className="approval">
              <p>
                {who} asked for{' '}
                <button type="button" className="link-button" onClick={() => onOpenBook(r.book_id)}>
                  {book?.title ?? 'a book'}
                </button>{' '}
                on {formatDate(r.created_at)}.
              </p>
              <div className="approval-actions">
                <button type="button" className="button" disabled={busyId === r.id}
                  onClick={() => decide(r.id, true)}>
                  Approve
                </button>
                <button type="button" className="button button-quiet" disabled={busyId === r.id}
                  onClick={() => decide(r.id, false)}>
                  Decline
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}
