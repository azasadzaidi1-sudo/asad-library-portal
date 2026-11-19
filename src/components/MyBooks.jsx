import { useState } from 'react'
import { describeMyReservation, formatDate, isOverdue } from '../lib/catalogue'
import { cancelReservation } from '../lib/library'
import BookCard from './BookCard'
import Cover from './Cover'

// A member's own page: what they've borrowed, reserved and marked as interested.
export default function MyBooks({ library, onOpenBook }) {
  const { myCard, booksById, availability, interests } = library
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loanBook = myCard.loan && booksById.get(myCard.loan.book_id)
  const reservation = myCard.reservation
  const reservedBook = reservation && booksById.get(reservation.book_id)
  const interestedBooks = library.books.filter((b) => interests.has(b.id))

  async function cancel() {
    setBusy(true)
    setError('')
    try {
      await cancelReservation(reservation.reservation_id)
      await library.refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="my-books">
      <h1 className="page-title">My books</h1>

      <section className="shelf" aria-labelledby="borrowed-title">
        <h2 id="borrowed-title" className="shelf-title">Borrowed</h2>
        {loanBook ? (
          <BookRow book={loanBook} onOpen={() => onOpenBook(loanBook.id)}>
            {isOverdue(myCard.loan.due_on) ? (
              <p className="overdue">Was due back {formatDate(myCard.loan.due_on)}. Please return it to Asad.</p>
            ) : (
              <p>Due back {formatDate(myCard.loan.due_on)}</p>
            )}
          </BookRow>
        ) : (
          <p className="shelf-empty">You haven't borrowed a book. Find one in the catalogue and reserve it.</p>
        )}
      </section>

      <section className="shelf" aria-labelledby="reserved-title">
        <h2 id="reserved-title" className="shelf-title">Reserved</h2>
        {reservedBook ? (
          <BookRow book={reservedBook} onOpen={() => onOpenBook(reservedBook.id)}>
            <p>{describeMyReservation(reservation, availability.get(reservedBook.id)).text}</p>
            <button type="button" className="button button-quiet" disabled={busy} onClick={cancel}>
              {reservation.status === 'pending_approval' ? 'Withdraw request' : 'Cancel reservation'}
            </button>
          </BookRow>
        ) : (
          <p className="shelf-empty">Nothing reserved. You can reserve one book at a time.</p>
        )}
        {myCard.declined.map((d) => (
          <p key={d.id} className="declined-note">
            Asad declined your request for <em>{booksById.get(d.book_id)?.title ?? 'a book'}</em>{' '}
            on {formatDate(d.decided_at)}.
          </p>
        ))}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      <section className="shelf" aria-labelledby="interested-title">
        <h2 id="interested-title" className="shelf-title">Interested</h2>
        {interestedBooks.length === 0 ? (
          <p className="shelf-empty">
            Open a book in the catalogue and choose "Mark as interested" to keep it here. Asad can see this
            list too.
          </p>
        ) : (
          <>
            <p className="shelf-note">Asad can see this list too.</p>
            <ul className="drawer">
              {interestedBooks.map((book) => (
                <li key={book.id}>
                  <BookCard book={book} counts={availability.get(book.id)} interested
                    onOpen={() => onOpenBook(book.id)} />
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
