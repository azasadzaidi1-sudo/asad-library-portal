import { useState } from 'react'
import { declineText, describeMyReservation, formatDate, isOverdue } from '../lib/catalogue'
import { cancelReservation } from '../lib/library'
import BookCard from './BookCard'
import Cover from './Cover'

// "Borrowing lists": what a member has borrowed, reserved and marked as
// interested, from every library. (It used to be called "My books", which
// could be misread as the books on your own shelf.)
// Members can have one book and one reservation from each library at a time.
export default function BorrowingLists({ library, onOpenBook }) {
  const { myCard, booksById, availability, interests, ownerName } = library
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const interestedBooks = library.books.filter((b) => interests.has(b.id))
  const countsFor = (bookId, ownerId) => availability.get(bookId)?.find((r) => r.owner_id === ownerId)

  async function cancel(reservationId) {
    setBusy(true)
    setError('')
    try {
      await cancelReservation(reservationId)
      await library.refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="borrowing-lists">
      <h1 className="page-title">Borrowing lists</h1>

      <section className="shelf" aria-labelledby="borrowed-title">
        <h2 id="borrowed-title" className="shelf-title">Borrowed</h2>
        {myCard.loans.length === 0 && (
          <p className="shelf-empty">You haven't borrowed a book. Find one in the catalogue and reserve it.</p>
        )}
        {myCard.loans.map((loan) => {
          const book = booksById.get(loan.book_id)
          if (!book) return null
          return (
            <BookRow key={loan.id} book={book} onOpen={() => onOpenBook(book.id)}>
              {isOverdue(loan.due_on) ? (
                <p className="overdue">
                  Was due back {formatDate(loan.due_on)}. Please return it to {ownerName(loan.owner_id)}.
                </p>
              ) : (
                <p>From {ownerName(loan.owner_id)}'s shelf, due back {formatDate(loan.due_on)}</p>
              )}
            </BookRow>
          )
        })}
      </section>

      <section className="shelf" aria-labelledby="reserved-title">
        <h2 id="reserved-title" className="shelf-title">Reserved</h2>
        {myCard.reservations.length === 0 && (
          <p className="shelf-empty">Nothing reserved. You can reserve one book from each library at a time.</p>
        )}
        {myCard.reservations.map((reservation) => {
          const book = booksById.get(reservation.book_id)
          if (!book) return null
          const owner = ownerName(reservation.owner_id)
          return (
            <BookRow key={reservation.reservation_id} book={book} onOpen={() => onOpenBook(book.id)}>
              <p>
                {describeMyReservation(reservation, countsFor(book.id, reservation.owner_id), owner).text}
              </p>
              <button type="button" className="button button-quiet" disabled={busy}
                onClick={() => cancel(reservation.reservation_id)}>
                {reservation.status === 'pending_approval' ? 'Withdraw request' : 'Cancel reservation'}
              </button>
            </BookRow>
          )
        })}
        {myCard.declined.map((d) => {
          const book = booksById.get(d.book_id)
          const otherCopies = (availability.get(d.book_id) ?? []).some((r) => r.owner_id !== d.owner_id)
          return (
            <p key={d.id} className="declined-note">
              {declineText(book?.title ?? 'This book', ownerName(d.owner_id), otherCopies)}
            </p>
          )
        })}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      <section className="shelf" aria-labelledby="interested-title">
        <h2 id="interested-title" className="shelf-title">Interested</h2>
        {interestedBooks.length === 0 ? (
          <p className="shelf-empty">
            Open a book in the catalogue and choose "Mark as interested" to keep it here. Librarians with a
            copy can see this list too.
          </p>
        ) : (
          <>
            <p className="shelf-note">Librarians with a copy can see this list too.</p>
            <ul className="drawer">
              {interestedBooks.map((book) => (
                <li key={book.id}>
                  <BookCard book={book} library={library} interested onOpen={() => onOpenBook(book.id)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

function BookRow({ book, onOpen, children }) {
  return (
    <article className="book-row">
      <Cover book={book} className="row-cover" />
      <div className="book-row-text">
        <h3 className="row-title">
          <button type="button" className="link-button" aria-haspopup="dialog" onClick={onOpen}>
            {book.title}
          </button>
        </h3>
        <p className="card-author">{book.author}</p>
        <div className="row-detail">{children}</div>
      </div>
    </article>
  )
}
