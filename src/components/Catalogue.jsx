import { useMemo, useState } from 'react'
import { awardName, countBy, filterBooks, languageName } from '../lib/catalogue'
import ApprovalBox from './ApprovalBox'
import BookCard from './BookCard'
import MeetupCard from './MeetupCard'

export const NO_FILTERS = { query: '', library: '', genre: '', award: '', language: '' }

export default function Catalogue({ library, filters, setFilters, onOpenBook }) {
  const [showFilters, setShowFilters] = useState(false) // phones only: filters fold away
  const { libraries, ownersByBook } = library
  // Only titles with at least one copy on a shelf (a title can lose its last
  // copy when a librarian removes it).
  const books = useMemo(() => library.books.filter((b) => ownersByBook.has(b.id)), [library.books, ownersByBook])

  const options = useMemo(
    () => ({
      genres: countBy(books, (b) => [b.genre]),
      awards: countBy(books, (b) => (b.prizes ?? []).map(awardName)),
      languages: countBy(books, (b) => [b.language]),
    }),
    [books],
  )

  const shown = useMemo(() => filterBooks(books, filters, ownersByBook), [books, filters, ownersByBook])
  const filtered = Object.values(filters).some(Boolean)
  const dropdownsInUse = [filters.library, filters.genre, filters.award, filters.language].filter(Boolean).length
  const update = (key) => (event) => setFilters({ ...filters, [key]: event.target.value })

  return (
    <>
      <h1 className="visually-hidden">Catalogue</h1>
      <MeetupCard isLibrarian={library.isLibrarian} />
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
            : `Filter by library, genre, award or language${dropdownsInUse ? ` (${dropdownsInUse} in use)` : ''}`}
        </button>
        <label className="finder-filter">
          Library
          <select value={filters.library} onChange={update('library')}>
            <option value="">All libraries</option>
            {libraries.map((lib) => (
              <option key={lib.owner_id} value={lib.owner_id}>
                {lib.is_me ? 'Your shelf' : lib.name} ({lib.titles})
              </option>
            ))}
          </select>
        </label>
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
                library={library}
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
