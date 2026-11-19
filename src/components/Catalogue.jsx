import { useMemo, useState } from 'react'
import { awardName, countBy, filterBooks, languageName } from '../lib/catalogue'
import ApprovalBox from './ApprovalBox'
import BookCard from './BookCard'

export const NO_FILTERS = { query: '', genre: '', award: '', language: '' }

export default function Catalogue({ library, filters, setFilters, onOpenBook }) {
  const [showFilters, setShowFilters] = useState(false) // phones only: filters fold away
  const { books } = library

  const options = useMemo(
    () => ({
      genres: countBy(books, (b) => [b.genre]),
      awards: countBy(books, (b) => (b.prizes ?? []).map(awardName)),
      languages: countBy(books, (b) => [b.language]),
    }),
    [books],
  )

  const shown = useMemo(() => filterBooks(books, filters), [books, filters])
  const filtered = Object.values(filters).some(Boolean)
  const dropdownsInUse = [filters.genre, filters.award, filters.language].filter(Boolean).length
  const update = (key) => (event) => setFilters({ ...filters, [key]: event.target.value })

  return (
    <>
      <h1 className="visually-hidden">Catalogue</h1>
      {library.isLibrarian && <ApprovalBox library={library} onOpenBook={onOpenBook} />}

      <form className={`finder${showFilters ? ' finder-open' : ''}`} role="search"
        onSubmit={(e) => e.preventDefault()}>
        <label className="finder-search">
          Search
          <input type="search" placeholder="Title, author or series" value={filters.query}
            onChange={update('query')} />
        </label>
        <button type="button" className="link-button finder-toggle" aria-expanded={showFilters}
          onClick={() => setShowFilters(!showFilters)}>
          {showFilters
            ? 'Hide filters'
            : `Filter by genre, award or language${dropdownsInUse ? ` (${dropdownsInUse} in use)` : ''}`}
        </button>
        <label className="finder-filter">
          Genre
          <select value={filters.genre} onChange={update('genre')}>
            <option value="">All genres</option>
            {options.genres.map(({ value, count }) => (
              <option key={value} value={value}>{value} ({count})</option>
            ))}
          </select>
        </label>
        <label className="finder-filter">
          Award
          <select value={filters.award} onChange={update('award')}>
            <option value="">Any award, or none</option>
            {options.awards.map(({ value, count }) => (
              <option key={value} value={value}>{value} ({count})</option>
            ))}
          </select>
        </label>
        <label className="finder-filter">
          Language
          <select value={filters.language} onChange={update('language')}>
            <option value="">All languages</option>
            {options.languages.map(({ value, count }) => (
              <option key={value} value={value}>{languageName(value)} ({count})</option>
            ))}
          </select>
        </label>
      </form>

      <div className="tally" aria-live="polite">
        <p>
          {filtered
            ? `${shown.length} of ${books.length} books match`
            : `${books.length} books on the shelves`}
        </p>
        {filtered && (
          <button type="button" className="link-button" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <p>No books match these filters.</p>
          <button type="button" className="button" onClick={() => setFilters(NO_FILTERS)}>
            Show all {books.length} books
          </button>
        </div>
      ) : (
        <ul className="drawer">
          {shown.map((book) => (
            <li key={book.id}>
              <BookCard
                book={book}
                counts={library.availability.get(book.id)}
                interested={library.interests.has(book.id)}
                onOpen={() => onOpenBook(book.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
