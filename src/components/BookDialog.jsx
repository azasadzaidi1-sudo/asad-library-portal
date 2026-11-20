import { useEffect, useRef, useState } from 'react'
import {
  availability,
  describeMyReservation,
  formatDate,
  isOverdue,
  languageName,
  libraryLabel,
  READING_STATUSES,
} from '../lib/catalogue'
import {
  cancelReservation,
  lendCopy,
  loadLibrarianDetails,
  removeCopy,
  requestBook,
  returnLoan,
  saveReadingStatus,
  setInterested,
  setRestricted,
} from '../lib/library'
import { listAwards, Stamp } from './BookCard'
import Cover from './Cover'
import LendControls from './LendControls'
import ConfirmButton from './ConfirmButton'
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

        {library.availability.get(book.id)?.some((r) => r.owner_id === member.id) && (
          <LibrarianPanel book={book} library={library} member={member} version={version} onChanged={changed} />
        )}
      </div>
    </dialog>
  )
}

function MemberActions({ book, library, member, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const rows = library.availability.get(book.id) ?? []
  const ownRow = rows.find((r) => r.owner_id === member.id)
  const others = rows
    .filter((r) => r.owner_id !== member.id)
    .sort((a, b) => library.ownerName(a.owner_id).localeCompare(library.ownerName(b.owner_id)))
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
      <h3 className="panel-heading">{rows.length > 1 ? 'Copies on these shelves' : 'Copies'}</h3>
      {rows.length === 0 && <p className="dialog-note">No copies yet.</p>}
      <ul className="shelf-rows">
        {ownRow && (
          <li className="shelf-row">
            <p className="shelf-row-name">Your shelf</p>
            <p className={`card-status status-${availability(ownRow).state}`}>{availability(ownRow).text}</p>
          </li>
        )}
        {others.map((row) => (
          <LibraryRow key={row.owner_id} book={book} row={row} library={library} busy={busy} run={run} />
        ))}
      </ul>

      <button type="button" className="link-button dialog-interest" disabled={busy}
        onClick={() => run(() => setInterested(book.id, member.id, !interested))}>
        {interested ? 'Remove from my interested list' : 'Mark as interested'}
      </button>

      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}

// One library's copies of this title, and what the member can do there.
function LibraryRow({ book, row, library, busy, run }) {
  const owner = row.owner_id
  const lib = library.librariesById.get(owner)
  const name = library.ownerName(owner)
  const reason = library.restricted.get(book.id)?.get(owner)
  const status = availability(row)
  const loan = library.myCard.loans.find((l) => l.owner_id === owner && l.book_id === book.id)
  const myReservation = library.myCard.reservations.find((r) => r.owner_id === owner)
  const reservedThis = myReservation?.book_id === book.id
  const standing = lib?.my_status

  let action
  if (loan) {
    action = <p className="dialog-note">You have this copy. Due back {formatDate(loan.due_on)}.</p>
  } else if (reservedThis) {
    action = (
      <div className="dialog-row">
        <p className="dialog-note">{describeMyReservation(myReservation, row, name).text}</p>
        <button type="button" className="button button-quiet" disabled={busy}
          onClick={() => run(() => cancelReservation(myReservation.reservation_id))}>
          {myReservation.status === 'pending_approval' ? 'Withdraw request' : 'Cancel reservation'}
        </button>
      </div>
    )
  } else if (myReservation) {
    const other = library.booksById.get(myReservation.book_id)
    action = (
      <p className="dialog-note">
        You've already reserved <em>{other?.title ?? 'a book'}</em> from {name}'s shelf. It's one reservation
        per library, so cancel that one to reserve this.
      </p>
    )
  } else if (standing === 'stopped') {
    action = <p className="dialog-note">Not lending at the moment.</p>
  } else if (standing === 'approved') {
    action = (
      <div className="dialog-row">
        {reason && <p className="dialog-note">Restricted Section: {name} approves each request.</p>}
        <button type="button" className="button" disabled={busy}
          onClick={() => run(() => requestBook(book.id, owner))}>
          {reason ? 'Request this book' : 'Reserve'}
        </button>
      </div>
    )
  } else {
    action = <FirstRequest book={book} owner={owner} name={name} restricted={Boolean(reason)} busy={busy} run={run} />
  }

  return (
    <li className="shelf-row">
      <div className="shelf-row-head">
        <div>
          <p className="shelf-row-name">{libraryLabel(lib)}</p>
          <p className={`card-status status-${status.state}`}>{status.text}</p>
        </div>
        {reason && <Stamp reason={reason} />}
      </div>
      {action}
    </li>
  )
}

// The first time someone borrows from a librarian, the librarian approves
// them. The optional note helps the librarian place them.
function FirstRequest({ book, owner, name, restricted, busy, run }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  if (!open) {
    return (
      <button type="button" className="button" disabled={busy} onClick={() => setOpen(true)}>
        Ask {name} to borrow
      </button>
    )
  }
  return (
    <form className="first-request"
      onSubmit={(event) => {
        event.preventDefault()
        run(() => requestBook(book.id, owner, note.trim()))
      }}>
      <p className="dialog-note">
        This is your first request from {name}'s shelf, so {name} approves it first.
        {restricted && ` It's also in ${name}'s Restricted Section, so ${name} approves the book separately.`}
      </p>
      <label>
        <span>Remind {name} how you know each other <span className="optional">(optional)</span></span>
        <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="form-actions">
        <button type="submit" className="button" disabled={busy}>Send request</button>
        <button type="button" className="link-button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

const RESTRICTED_REASONS = ['Fragile copy', 'Sensitive content', 'Special copy']

// The librarian's own copies of this title: only they see this.
function LibrarianPanel({ book, library, member, version, onChanged }) {
  const [details, setDetails] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const bookId = book.id
  const reason = library.restricted.get(bookId)?.get(member.id) ?? ''

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
    loadLibrarianDetails(bookId, member.id).then(setDetails).catch((e) => setError(e.message))
  }, [bookId, member.id, version])

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
  const reasons = reason && !RESTRICTED_REASONS.includes(reason) ? [reason, ...RESTRICTED_REASONS] : RESTRICTED_REASONS

  return (
    <section className="dialog-section librarian-panel" aria-label="Your shelf">
      <h3 className="panel-title">Your shelf: only you see this</h3>

      {library.isAdmin && (
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
      )}

      <div className="panel-restricted">
        <label className="checkbox">
          <input type="checkbox" checked={Boolean(reason)} disabled={busy}
            onChange={(e) => run(() => setRestricted(bookId, member.id, e.target.checked ? RESTRICTED_REASONS[0] : null))} />
          Restricted Section: I approve each request
        </label>
        {reason && (
          <label>
            Reason members see
            <select value={reason} disabled={busy}
              onChange={(e) => run(() => setRestricted(bookId, member.id, e.target.value))}>
              {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        )}
      </div>

      <h4 className="panel-heading">Your copies</h4>
      <ul className="panel-copies">
        {details.copies.map((copy, i) => (
          <li key={copy.id}>
            <p>
              Copy {i + 1}{copy.edition_note ? `, ${copy.edition_note}` : ''}:{' '}
              {copy.loan ? (
                <span className={isOverdue(copy.loan.due_on) ? 'overdue' : undefined}>
                  with {library.personName(copy.loan.member_id)}, due {formatDate(copy.loan.due_on)}
                  {isOverdue(copy.loan.due_on) && ' (overdue)'}
                </span>
              ) : (
                'on the shelf'
              )}
            </p>
            {copy.loan ? (
              <ReturnButton busy={busy} onReturn={() => run(() => returnLoan(copy.loan.id))} />
            ) : (
              <>
                <LendControls key={version} copies={[{ ...copy, number: i + 1 }]} members={details.members}
                  defaultMemberId={firstReady?.member_id ?? ''} busy={busy}
                  onLend={(copyId, memberId) => run(() => lendCopy(copyId, memberId))} />
                <ConfirmButton label="Remove from my shelf" busy={busy} className="link-button panel-remove"
                  question={details.copies.length === 1
                    ? 'Remove your only copy? Anyone waiting for it on your shelf has their reservation cancelled.'
                    : 'Remove this copy from your shelf?'}
                  confirmLabel="Remove" onConfirm={() => run(() => removeCopy(copy.id))} />
              </>
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
              {library.personName(r.member_id)}, since {formatDate(r.created_at)}
              {r.status === 'pending_approval' && ', waiting for your approval'}
            </li>
          ))}
        </ol>
      )}

      <h4 className="panel-heading">Interested</h4>
      {details.interested.length === 0 ? (
        <p className="panel-empty">No one has marked this book yet.</p>
      ) : (
        <p>{details.interested.map((i) => library.personName(i.member_id)).join(', ')}</p>
      )}
    </section>
  )
}
