import { useState } from 'react'
import { borrowingRecord, formatDate, memberSince } from '../lib/catalogue'
import { answerPassQuestion, decidePass, decideRequest } from '../lib/library'

// Librarians only: what's waiting for them at the top of the lending desk.
//   1. Requests from people without a library pass, each with its request
//      card (their note, who invited them, how their loans have gone).
//   2. People asking for a library pass, with the same card.
//   3. Restricted Section requests from pass holders.
//   4. The question after a return: "Give Sara a library pass?"
export default function ApprovalBox({ library, onOpenBook }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const { requests, passRequests, restricted, passQuestions } = library.approvals

  if (requests.length + passRequests.length + restricted.length + passQuestions.length === 0) return null

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
      <h2 id="approvals-title" className="approvals-title">Waiting for you</h2>
      <ul>
        {requests.map((r) => {
          const name = r.name || 'A new member'
          return (
            <li key={`request-${r.reservation_id}`} className="approval approval-new">
              <p className="approval-kind">{r.first_time ? 'First request' : 'Request'}</p>
              <p className="approval-lead">
                <strong>{name}</strong> asks to borrow {bookButton(r.book_id)}
              </p>
              <p className="approval-book">Asked on {formatDate(r.requested_at)}</p>
              {r.note && <blockquote className="approval-note">{r.note}</blockquote>}
              <Facts person={r} />
              <div className="approval-actions">
                <button type="button" className="button" disabled={busyId === r.reservation_id}
                  onClick={() => decide(r.reservation_id, () => decideRequest(r.reservation_id, true))}>
                  Approve
                </button>
                <button type="button" className="button button-quiet" disabled={busyId === r.reservation_id}
                  onClick={() => decide(r.reservation_id, () => decideRequest(r.reservation_id, false))}>
                  Decline
                </button>
              </div>
            </li>
          )
        })}

        {passRequests.map((p) => {
          const name = p.name || 'A new member'
          const id = `pass-${p.borrower_id}`
          return (
            <li key={id} className="approval approval-new">
              <p className="approval-kind">Library pass</p>
              <p className="approval-lead">
                <strong>{name}</strong> asks for a library pass
              </p>
              <p className="approval-book">Asked on {formatDate(p.requested_at)}</p>
              {p.note && <blockquote className="approval-note">{p.note}</blockquote>}
              <Facts person={p} />
              <div className="approval-actions">
                <button type="button" className="button" disabled={busyId === id}
                  onClick={() => decide(id, () => decidePass(p.borrower_id, true))}>
                  Give {name} a pass
                </button>
                <button type="button" className="button button-quiet" disabled={busyId === id}
                  onClick={() => decide(id, () => decidePass(p.borrower_id, false))}>
                  Not now
                </button>
              </div>
            </li>
          )
        })}

        {restricted.map((r) => (
          <li key={`restricted-${r.id}`} className="approval">
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

        {passQuestions.map((q) => {
          const name = q.name || 'This member'
          const id = `question-${q.loan_id}`
          return (
            <li key={id} className="approval">
              <p className="approval-kind">After a return</p>
              <p>
                {name} brought back {bookButton(q.book_id)} on {formatDate(q.returned_on)}. Give {name} a library
                pass?
              </p>
              <div className="approval-actions">
                <button type="button" className="button" disabled={busyId === id}
                  onClick={() => decide(id, () => answerPassQuestion(q.loan_id, true))}>
                  Give a pass
                </button>
                <button type="button" className="button button-quiet" disabled={busyId === id}
                  onClick={() => decide(id, () => answerPassQuestion(q.loan_id, false))}>
                  Not now
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="approval-hint">
        Approving a request lends that one book. With a library pass, someone reserves from you without asking
        (Restricted books still need your OK) and sees your Restricted Section. You can give or take back passes
        on the Borrowers tab; a pass you take back can't be asked for again.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}

// The facts on a request card, from borrower_facts() in
// supabase/15_library_passes.sql.
function Facts({ person }) {
  const fromMe = person.loans_from_me ?? 0
  return (
    <dl className="approval-facts">
      <dt>Invited by</dt>
      <dd>{person.invited_by_name ?? 'Not recorded'}</dd>
      <dt>Has a library pass from</dt>
      <dd>{person.passes_from?.length ? person.passes_from.join(', ') : 'No one yet'}</dd>
      <dt>Member since</dt>
      <dd>{memberSince(person.member_since)}</dd>
      <dt>Borrowing record</dt>
      <dd>{borrowingRecord(person)}</dd>
      <dt>From your shelf</dt>
      <dd>{fromMe === 0 ? 'Not yet' : fromMe === 1 ? 'Once' : `${fromMe} times`}</dd>
    </dl>
  )
}
