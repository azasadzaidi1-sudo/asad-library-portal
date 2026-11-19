import { availability, languageName } from '../lib/catalogue'
import Cover from './Cover'

// One book, laid out like a card from a library's card catalogue.
// The whole card opens the book's pop-up (the title button stretches over it).
export default function BookCard({ book, counts, interested, onOpen }) {
  const status = availability(counts)
  const details = [book.genre, book.year_published, languageName(book.language)].filter(Boolean)

  return (
    <article className={`card${book.restricted ? ' card-restricted' : ''}`}>
      {interested && (
        <span className="ribbon" title="You're interested in this book">
          <span className="visually-hidden">You're interested in this book.</span>
        </span>
      )}
      <div className="card-head">
        <div className="card-heading">
          <h2 className="card-title">
            <button type="button" className="card-open" aria-haspopup="dialog" onClick={onOpen}>
              {book.title}
            </button>
          </h2>
          <p className="card-author">{book.author}</p>
          {book.series && <p className="card-series">{book.series}</p>}
        </div>
        <Cover book={book} className="card-cover" />
      </div>

      <p className="card-details">{details.join(', ')}</p>
      {book.prizes?.length > 0 && <p className="card-awards">Won the {listAwards(book.prizes)}</p>}
      {book.goodreads_rating && (
        <p className="card-rating">Rated {Number(book.goodreads_rating).toFixed(2)} on Goodreads</p>
      )}

      <div className="card-foot">
        <div>
          <p className={`card-status status-${status.state}`}>{status.text}</p>
          {book.restricted && <p className="card-approval">Needs Asad's approval to borrow</p>}
        </div>
        {book.restricted && <Stamp reason={book.restricted_reason} />}
      </div>
    </article>
  )
}

export function Stamp({ reason }) {
  return (
    <p className="stamp">
      <span className="stamp-heading">Restricted Section</span>
      <span className="stamp-reason">{reason ?? 'Ask the librarian'}</span>
    </p>
  )
}

export function listAwards(prizes) {
  if (prizes.length === 1) return prizes[0]
  return `${prizes.slice(0, -1).join(', ')} and ${prizes.at(-1)}`
}
