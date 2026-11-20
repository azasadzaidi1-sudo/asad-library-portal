import { useEffect, useRef, useState } from 'react'
import {
  availability,
  describeMyReservation,
  formatDate,
  isOverdue,
  languageName,
  memberLabel,
  READING_STATUSES,
} from '../lib/catalogue'
import {
  cancelReservation,
  lendCopy,
  loadLibrarianDetails,
  reserve,
  returnLoan,
  saveReadingStatus,
  setInterested,
} from '../lib/library'
import { listAwards, Stamp } from './BookCard'
import Cover from './Cover'
import LendControls from './LendControls'
import ReturnButton from './ReturnButton'
import Reviews from './Reviews'

// The pop-up that opens when a book card is clicked. Built on the browser's
// own <dialog>, which handles the Escape key and keeps keyboard focus inside.
export default function BookDialog({ book, library, member, onClose }) {
  const dialogRef = useRef(null)
  const [version, setVersion] = useState(0) // bumps after each change, to reload librarian details

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const close = () => dialogRef.current?.close()
  const changed = async () => {
    await library.refresh()
    setVersion((v) => v + 1)
  }

  const details = [book.genre, book.year_published, languageName(book.language)].filter(Boolean)

  return (
    <dialog
      ref={dialogRef}
      className="book-dialog"
      aria-labelledby="book-dialog-title"
      onClose={onClose}
      onClick={(event) => event.target === dialogRef.current && close()}
    >
      <div className="dialog-inner">
        <button type="button" className="link-button dialog-close" onClick={close}>
          Close
        </button>

        <div className="dialog-head">
          <Cover book={book} className="dialog-cover" />
          <div>
            <h2 id="book-dialog-title" className="dialog-title">{book.title}</h2>
            <p className="card-author">{book.author}</p>
            {book.series && <p className="card-series">{book.series}</p>}
            <p className="card-details">{details.join(', ')}</p>
            {book.prizes?.length > 0 && <p className="card-awards">Won the {listAwards(book.prizes)}</p>}
            {book.goodreads_rating && (
              <p className="card-rating">Rated {Number(book.goodreads_rating).toFixed(2)} on Goodreads</p>
            )}
          </div>
        </div>

        {book.description && <p className="dialog-description">{book.description}</p>}

        <MemberActions book={book} library={library} member={member} onChanged={changed} />

        <Reviews book={book} member={member} />

        {library.isLibrarian && <LibrarianPanel bookId={book.id} version={version} onChanged={changed} />}
      </div>
    </dialog>
  )
}

function MemberActions({ book, library, member, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const counts = library.availability.get(book.id)
  const status = availability(counts)
  const { reservation, loan } = library.myCard
  const reservedThis = reservation?.book_id === book.id
  const borrowedThis = loan?.book_id === book.id
  const otherReservation = reservation && !reservedThis ? library.booksById.get(reservation.book_id) : null
  const interested = library.interests.has(book.id)

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      await onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dialog-section">
      <div className="dialog-status">
        <p className={`card-status status-${status.state}`}>{status.text}</p>
        {book.restricted && <Stamp reason={book.restricted_reason} />}
      </div>

      {borrowedThis && (
        <p className="dialog-note">
          You have this book. Due back {formatDate(loan.due_on)}.
        </p>
      )}

      {reservedThis && (
        <div className="dialog-row">
          <p className="dialog-note">{describeMyReservation(reservation, counts).text}</p>
          <button type="button" className="button button-quiet" disabled={busy}
            onClick={() => run(() => cancelReservation(reservation.reservation_id))}>
            {reservation.status === 'pending_approval' ? 'Withdraw request' : 'Cancel reservation'}
          </button>
        </div>
      )}

      {!reservedThis && !borrowedThis && otherReservation && (
        <p className="dialog-note">
          You've already reserved <em>{otherReservation.title}</em>. Members reserve one book at a
          time, so cancel that reservation to reserve this one.
        </p>
      )}

      {!reservedThis && !borrowedThis && !otherReservation && (
        <div className="dialog-row">
          {book.restricted && (
            <p className="dialog-note">This book is in the Restricted Section: Asad approves each request.</p>
          )}
          <button type="button" className="button" disabled={busy}
            onClick={() => run(() => reserve(book.id, member.id))}>
            {book.restricted ? 'Request this book' : 'Reserve'}
          </button>
        </div>
      )}

      <button type="button" className="link-button dialog-interest" disabled={busy}
        onClick={() => run(() => setInterested(book.id, member.id, !interested))}>
        {interested ? 'Remove from my interested list' : 'Mark as interested'}
      </button>

      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}

function LibrarianPanel({ bookId, version, onChanged }) {
  const [details, setDetails] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      await onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    loadLibrarianDetails(bookId).then(setDetails).catch((e) => setError(e.message))
  }, [bookId, version])

  async function changeReading(event) {
    const status = event.target.value
    setDetails({ ...details, readingStatus: status })
    setSaved('')
    try {
      await saveReadingStatus(bookId, status)
      setSaved('Saved')
    } catch (e) {
      setError(e.message)
    }
  }

  if (!details) {
    return error
      ? <p className="form-error" role="alert">{error}</p>
      : <p className="dialog-loading">Checking the ledger…</p>
  }
  // Suggest lending to the first person in the queue, if their reservation is confirmed.
  const firstReady = details.queue[0]?.status === 'active' ? details.queue[0] : null

  return (
    <section className="dialog-section librarian-panel" aria-label="Librarian details">
      <h3 className="panel-title">Only you see this</h3>

      <div className="panel-reading">
        <label>
          Your reading status
          <select value={details.readingStatus} onChange={changeReading}>
            {READING_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <span className="panel-saved" aria-live="polite">{saved}</span>
      </div>

      <h4 className="panel-heading">Copies</h4>
      <ul className="panel-copies">
        {details.copies.map((copy, i) => (
          <li key={copy.id}>
            <p>
              Copy {i + 1}{copy.edition_note ? `, ${copy.edition_note}` : ''}:{' '}
              {copy.loan ? (
                <span className={isOverdue(copy.loan.due_on) ? 'overdue' : undefined}>
                  with {memberLabel(copy.loan.member)}, due {formatDate(copy.loan.due_on)}
                  {isOverdue(copy.loan.due_on) && ' (overdue)'}
                </span>
              ) : (
                'on the shelf'
              )}
            </p>
            {copy.loan ? (
              <ReturnButton busy={busy} onReturn={() => run(() => returnLoan(copy.loan.id))} />
            ) : (
              <LendControls key={version} copies={[{ ...copy, number: i + 1 }]} members={details.members}
                defaultMemberId={firstReady?.member_id ?? ''} busy={busy}
                onLend={(copyId, memberId) => run(() => lendCopy(copyId, memberId))} />
            )}
          </li>
        ))}
      </ul>
      {error && <p className="form-error" role="alert">{error}</p>}

      <h4 className="panel-heading">Queue</h4>
      {details.queue.length === 0 ? (
        <p className="panel-empty">No one is waiting.</p>
      ) : (
        <ol className="panel-list">
          {details.queue.map((r) => (
            <li key={r.id}>
              {memberLabel(r.member)}, since {formatDate(r.created_at)}
              {r.status === 'pending_approval' && ', waiting for your approval'}
            </li>
          ))}
        </ol>
      )}

      <h4 className="panel-heading">Interested</h4>
      {details.interested.length === 0 ? (
        <p className="panel-empty">No one has marked this book yet.</p>
      ) : (
        <p>{details.interested.map((i) => memberLabel(i.member)).join(', ')}</p>
      )}
    </section>
  )
}
