import { useCallback, useEffect, useMemo, useState } from 'react'
import { countBy, filterBooks, LANGUAGE_NAMES } from '../lib/catalogue'
import { addBook, addCopy } from '../lib/library'
import { findAwards, findInCatalogue, isbnFrom, searchOpenLibrary } from '../lib/openLibrary'
import BarcodeScanner, { canScanBarcodes } from './BarcodeScanner'
import Cover from './Cover'

// Add a book to your own shelf: find it (search or scan its barcode), then
// either add your copy to a title already in the catalogue, or add a new
// title from Open Library (or by hand), with a genre and an optional description.
export default function AddBook({ library, onOpenBook }) {
  const { books } = library
  const [query, setQuery] = useState('')
  const [scanning, setScanning] = useState(false)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)
  const [picked, setPicked] = useState(null)
  const [added, setAdded] = useState(null)
  const [error, setError] = useState('')

  const genres = useMemo(() => countBy(books ?? [], (b) => [b.genre]).map((g) => g.value), [books])
  const myCopies = useMemo(() => {
    const counts = new Map()
    for (const [bookId, rows] of library.availability) {
      const mine = rows.find((r) => r.owner_id === library.memberId)
      if (mine) counts.set(bookId, mine.copies_total)
    }
    return counts
  }, [library.availability, library.memberId])

  const search = useCallback(
    async (text) => {
      const q = text.trim()
      if (!q) {
        setError('Type a title, an author or an ISBN first.')
        return
      }
      setSearching(true)
      setError('')
      setPicked(null)
      setAdded(null)
      try {
        const found = await searchOpenLibrary(q)
        const inCatalogue = new Map()
        if (!isbnFrom(q)) {
          for (const b of filterBooks(books, { query: q }).slice(0, 5)) inCatalogue.set(b.id, b)
        }
        const fromOpenLibrary = []
        for (const r of found) {
          const match = findInCatalogue(books, r)
          if (match) inCatalogue.set(match.id, match)
          else fromOpenLibrary.push(r)
        }
        setResults({ catalogue: [...inCatalogue.values()], openLibrary: fromOpenLibrary })
      } catch (e) {
        setError(e.message)
      } finally {
        setSearching(false)
      }
    },
    [books],
  )

  const onIsbn = useCallback(
    (isbn) => {
      setScanning(false)
      setQuery(isbn)
      search(isbn)
    },
    [search],
  )

  async function done(bookId, title) {
    setPicked(null)
    setResults(null)
    setQuery('')
    setAdded({ bookId, title })
    await library.refresh()
  }

  if (!books) return <p className="loading">Opening the catalogue…</p>

  return (
    <div className="add-book">
      <h1 className="page-title">Add a book</h1>
      <p className="page-lede">
        Find a book to put on your shelf. If it's already in the catalogue, your copy joins that card. Other
        members see it right away.
      </p>

      {added && (
        <p className="add-done" role="status">
          <em>{added.title}</em> is on your shelf.{' '}
          <button type="button" className="link-button" onClick={() => onOpenBook(added.bookId)}>
            Open it
          </button>
        </p>
      )}

      {!picked && (
        <form
          className="add-search"
          onSubmit={(event) => {
            event.preventDefault()
            search(query)
          }}>
          <label>
            Title, author or ISBN
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" />
          </label>
          <div className="form-actions">
            <button type="submit" className="button" disabled={searching}>
              {searching ? 'Searching…' : 'Search'}
            </button>
            {canScanBarcodes() && (
              <button type="button" className="button button-quiet" onClick={() => setScanning(true)}>
                Scan barcode
              </button>
            )}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      )}

      {scanning && <BarcodeScanner onIsbn={onIsbn} onClose={() => setScanning(false)} />}

      {picked?.kind === 'copy' && (
        <CopyForm book={picked.book} owned={myCopies.get(picked.book.id) ?? 0}
          onBack={() => setPicked(null)} onDone={done} />
      )}
      {(picked?.kind === 'new' || picked?.kind === 'manual') && (
        <NewTitleForm found={picked.book} genres={genres}
          onBack={() => setPicked(null)} onDone={done} />
      )}

      {!picked && results && (
        <div className="add-results">
          {results.catalogue.length > 0 && (
            <section aria-labelledby="in-catalogue">
              <h2 id="in-catalogue" className="shelf-title">Already in the catalogue</h2>
              <ul className="result-list">
                {results.catalogue.map((book) => (
                  <ResultRow key={book.id} cover={book.cover_id} title={book.title} author={book.author}
                    detail={myCopies.has(book.id) ? `You have ${myCopies.get(book.id) === 1 ? 'a copy' : `${myCopies.get(book.id)} copies`} already` : null}
                    action="Add my copy" onPick={() => setPicked({ kind: 'copy', book })} />
                ))}
              </ul>
            </section>
          )}
          {results.openLibrary.length > 0 && (
            <section aria-labelledby="from-open-library">
              <h2 id="from-open-library" className="shelf-title">From Open Library</h2>
              <ul className="result-list">
                {results.openLibrary.map((r) => (
                  <ResultRow key={r.workKey ?? r.title} cover={r.coverId} title={r.title} author={r.author}
                    detail={r.year ? `First published ${r.year}` : null}
                    action="Add this book" onPick={() => setPicked({ kind: 'new', book: r })} />
                ))}
              </ul>
            </section>
          )}
          {results.catalogue.length === 0 && results.openLibrary.length === 0 && (
            <p className="shelf-empty">Nothing found. Try fewer words, or the ISBN from the back of the book.</p>
          )}
          <p className="add-manual">
            Can't find it?{' '}
            <button type="button" className="link-button" onClick={() => setPicked({ kind: 'manual', book: null })}>
              Add it by hand
            </button>
          </p>
        </div>
      )}
    </div>
  )
}

function ResultRow({ cover, title, author, detail, action, onPick }) {
  return (
    <li className="result">
      <Cover book={{ cover_id: cover, title }} className="row-cover" />
      <div className="result-text">
        <p className="result-title">{title}</p>
        {author && <p className="card-author">{author}</p>}
        {detail && <p className="result-detail">{detail}</p>}
        <button type="button" className="button button-quiet" onClick={onPick}>
          {action}
        </button>
      </div>
    </li>
  )
}

function CopyForm({ book, owned, onBack, onDone }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await addCopy(book.id, note.trim())
      await onDone(book.id, book.title)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <Picked cover={book.cover_id} title={book.title} author={book.author} onBack={onBack} />
      {owned > 0 && <p className="dialog-note">You already have {owned === 1 ? 'a copy' : `${owned} copies`}; this adds another.</p>}
      <CopyNote value={note} onChange={setNote} />
      <div className="form-actions">
        <button type="submit" className="button" disabled={busy}>Add to my shelf</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  )
}

const DESCRIPTION_MAX = 600

function NewTitleForm({ found, genres, onBack, onDone }) {
  const manual = !found
  const [title, setTitle] = useState(found?.title ?? '')
  const [author, setAuthor] = useState(found?.author ?? '')
  const [year, setYear] = useState(found?.year ? String(found.year) : '')
  const [genre, setGenre] = useState('')
  const [language, setLanguage] = useState(found?.language ?? 'en')
  const [description, setDescription] = useState('')
  const [note, setNote] = useState('')
  const [awards, setAwards] = useState(found?.workKey ? null : [])
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')

  // Prizes from Wikidata, looked up once while the librarian fills in the form.
  const workKey = found?.workKey
  useEffect(() => {
    let current = true
    if (workKey) findAwards(workKey).then((list) => current && setAwards(list))
    return () => {
      current = false
    }
  }, [workKey])

  async function submit(event) {
    event.preventDefault()
    const problems = {}
    if (!title.trim()) problems.title = 'Enter the title.'
    if (!genre) problems.genre = 'Pick a genre.'
    if (year && !/^\d{1,4}$/.test(year.trim())) problems.year = 'Enter a year, like 2004.'
    setErrors(problems)
    if (Object.keys(problems).length) return

    setBusy(true)
    setError('')
    try {
      const book = {
        title: title.trim(),
        author: author.trim(),
        year: year ? Number(year) : null,
        genre,
        language,
        description: description.trim(),
        coverId: found?.coverId ?? null,
        workKey: found?.workKey ?? null,
        prizes: awards ?? [],
      }
      const bookId = await addBook(book, note.trim())
      await onDone(bookId, book.title)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <form className="add-form" onSubmit={submit} noValidate>
      {manual ? (
        <>
          <div className="add-picked-head">
            <h2 className="shelf-title">Add a book by hand</h2>
            <button type="button" className="link-button" onClick={onBack}>Back to results</button>
          </div>
          <Field label="Title" error={errors.title}>
            <input value={title} onChange={(e) => { setTitle(e.target.value); setErrors({ ...errors, title: '' }) }} />
          </Field>
          <Field label="Author">
            <input value={author} onChange={(e) => setAuthor(e.target.value)} />
          </Field>
          <Field label={<>First published <span className="optional">(year, optional)</span></>} error={errors.year}>
            <input inputMode="numeric" value={year} onChange={(e) => { setYear(e.target.value); setErrors({ ...errors, year: '' }) }} />
          </Field>
        </>
      ) : (
        <Picked cover={found.coverId} title={found.title}
          author={[found.author, found.year].filter(Boolean).join(', ')} onBack={onBack} />
      )}

      <p className="dialog-note">This book is new to the catalogue, so it needs a genre.</p>
      <Field label="Genre" error={errors.genre}>
        <select value={genre} onChange={(e) => { setGenre(e.target.value); setErrors({ ...errors, genre: '' }) }}>
          <option value="">Choose a genre</option>
          {genres.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </Field>
      <Field label="Language">
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {Object.entries(LANGUAGE_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </Field>
      <Field label={<>Description <span className="optional">(optional)</span></>}
        hint={`A few sentences in your own words, without spoilers. ${description.length}/${DESCRIPTION_MAX}`}>
        <textarea rows={4} maxLength={DESCRIPTION_MAX} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <CopyNote value={note} onChange={setNote} />

      {!manual && (
        <p className="add-awards" aria-live="polite">
          {awards === null && 'Looking up prizes…'}
          {awards?.length > 0 && <>Prizes, from Wikidata: {awards.join(', ')}</>}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="button" disabled={busy}>Add to my shelf</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  )
}

function Picked({ cover, title, author, onBack }) {
  return (
    <div className="add-picked">
      <Cover book={{ cover_id: cover, title }} className="row-cover" />
      <div>
        <p className="result-title">{title}</p>
        {author && <p className="card-author">{author}</p>}
        <button type="button" className="link-button" onClick={onBack}>Back to results</button>
      </div>
    </div>
  )
}

function CopyNote({ value, onChange }) {
  return (
    <Field label={<>About your copy <span className="optional">(optional)</span></>}
      hint="For example: signed hardback, or well-worn paperback.">
      <input maxLength={100} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

function Field({ label, hint, error, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {error && <span className="form-error" role="alert">{error}</span>}
    </label>
  )
}
