import { availability, languageName } from '../lib/catalogue'

// One book, laid out like a card from a library's card catalogue.
export default function BookCard({ book, counts }) {
  const status = availability(counts)
  const details = [book.genre, book.year_published, languageName(book.language)].filter(Boolean)

  return (
    <article className={`card${book.restricted ? ' card-restricted' : ''}`}>
      <h2 className="card-title">{book.title}</h2>
      <p className="card-author">{book.author}</p>
      {book.series && <p className="card-series">{book.series}</p>}

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
        {book.restricted && (
          <p className="stamp">
            <span className="stamp-heading">Restricted Section</span>
            <span className="stamp-reason">{book.restricted_reason ?? 'Ask the librarian'}</span>
          </p>
        )}
      </div>
    </article>
  )
}

function listAwards(prizes) {
  if (prizes.length === 1) return prizes[0]
  return `${prizes.slice(0, -1).join(', ')} and ${prizes.at(-1)}`
}
