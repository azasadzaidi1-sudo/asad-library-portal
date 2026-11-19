import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { awardName, countBy, filterBooks, languageName, sortByFilingTitle } from '../lib/catalogue'
import BookCard from './BookCard'

const NO_FILTERS = { query: '', genre: '', award: '', language: '' }

const BOOK_COLUMNS =
  'id, title, author, series, genre, year_published, language, goodreads_rating, prizes, restricted, restricted_reason'

export default function Catalogue() {
  const [books, setBooks] = useState(null)
  const [availabilityById, setAvailabilityById] = useState(new Map())
  const [error, setError] = useState('')
  const [filters, setFilters] = useState(NO_FILTERS)
  const [showFilters, setShowFilters] = useState(false) // phones only: filters fold away

  useEffect(() => {
    // Two requests at once: the books, and the counts of copies out / people waiting.
    Promise.all([
      supabase.from('books').select(BOOK_COLUMNS).limit(1000),
      supabase.rpc('book_availability'),
    ]).then(([booksResult, availabilityResult]) => {
      const failed = booksResult.error || availabilityResult.error
      if (failed) {
        setError(failed.message)
        return
      }
      setBooks(sortByFilingTitle(booksResult.data))
      setAvailabilityById(new Map(availabilityResult.data.map((row) => [row.book_id, row])))
    })
  }, [])

  const options = useMemo(() => {
    if (!books) return null
    return {
      genres: countBy(books, (b) => [b.genre]),
      awards: countBy(books, (b) => (b.prizes ?? []).map(awardName)),
      languages: countBy(books, (b) => [b.language]),
    }
  }, [books])

  const shown = useMemo(() => (books ? filterBooks(books, filters) : []), [books, filters])

  if (error) {
    return (
      <p className="status-page" role="alert">
        The catalogue couldn't load: {error}. Refresh the page to try again.
      </p>
    )
  }
  if (!books) return <p className="status-page">Opening the catalogue drawers…</p>

  const filtered = Object.values(filters).some(Boolean)
  const dropdownsInUse = [filters.genre, filters.award, filters.language].filter(Boolean).length
  const update = (key) => (event) => setFilters({ ...filters, [key]: event.target.value })

  return (
    <>
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
              <BookCard book={book} counts={availabilityById.get(book.id)} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
