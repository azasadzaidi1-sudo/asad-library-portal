import { useState } from 'react'
import { askForPass, withdrawPassRequest } from '../lib/library'
import { bookCountLine, noteLabel, passStanding } from '../lib/passes'
import { topGenresLine } from '../lib/shelves'
import DescribeShelf from './DescribeShelf'
import InviteFriend from './InviteFriend'

// Every librarian's shelf: its personality line, top genres, pick-up times
// (for pass holders and anyone with an approved request there), where the
// signed-in member stands with that librarian, and "Ask for a library
// pass". "Browse this shelf" opens the catalogue filtered to that library.
export default function Libraries({ library, onBrowse }) {
  const { libraries } = library
  const [editing, setEditing] = useState(false)
  const own = libraries.filter((l) => l.is_me)
  const others = libraries.filter((l) => !l.is_me)

  return (
    <div className="libraries">
      <h1 className="page-title">Libraries</h1>
      <p className="page-lede">
        Every shelf on The Common Shelf. A librarian OKs each request, unless they've given you their library
        pass: then you reserve from their shelf without asking, and see their Restricted Section too.
      </p>

      {own.length === 0 && (
        <section className="start-shelf" aria-labelledby="start-shelf-title">
          <h2 id="start-shelf-title" className="library-name">Start your shelf</h2>
          <p>
            Add the books you're happy to lend. Friends can then ask to borrow them: you OK each request, or give
            the people you trust a library pass.
          </p>
          <a className="button" href="#add-book">Add your first book</a>
        </section>
      )}

      <InviteFriend />

      <ul className="library-list">
        {[...own, ...others].map((lib) => (
          <li key={lib.owner_id} className="library-card">
            <h2 className="library-name">{lib.is_me ? 'Your shelf' : lib.name}</h2>
            {lib.personality && !(lib.is_me && editing) && <p className="shelf-personality">{lib.personality}</p>}
            <p className="library-meta">
              {lib.city && <>{lib.city}. </>}
              {bookCountLine(lib)}
            </p>
            {topGenresLine(lib.top_genres) && <p className="shelf-genres">{topGenresLine(lib.top_genres)}</p>}
            {lib.pickups && !(lib.is_me && editing) && (
              <p className="shelf-pickups"><span>Pick-ups:</span> {lib.pickups}</p>
            )}

            {lib.is_me && (editing || !lib.described) && (
              <DescribeShelf shelf={lib}
                title={lib.described ? 'Your shelf description' : 'Describe your shelf'}
                intro={lib.described ? null : 'Two short lines that show on your card here, so borrowers know what to expect.'}
                onCancel={lib.described ? () => setEditing(false) : null}
                onSaved={async () => {
                  setEditing(false)
                  await library.refresh()
                }} />
            )}

            {lib.is_me ? (
              <>
                <p className="library-status library-own">{passStanding(lib).text}</p>
                <div className="library-actions">
                  <button type="button" className="button button-quiet" onClick={() => onBrowse(lib.owner_id)}>
                    Browse this shelf
                  </button>
                  <a className="button button-quiet" href="#add-book">Add a book</a>
                  {lib.described && !editing && (
                    <button type="button" className="button button-quiet" onClick={() => setEditing(true)}>
                      Edit description
                    </button>
                  )}
                </div>
              </>
            ) : (
              <Standing lib={lib} library={library} onBrowse={onBrowse} />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Where the signed-in member stands with someone else's shelf, and what
// they can do: browse it, ask for a pass, or withdraw that request.
function Standing({ lib, library, onBrowse }) {
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const standing = passStanding(lib)

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      setAsking(false)
      setNote('')
      await library.refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const statusClass = standing.declined || standing.takenBack
    ? 'pass-declined'
    : `library-${lib.my_status ?? 'new'}`

  return (
    <>
      <p className={`library-status ${statusClass}`}>{standing.text}</p>

      {asking ? (
        <form className="pass-request"
          onSubmit={(event) => {
            event.preventDefault()
            run(() => askForPass(lib.owner_id, note.trim()))
          }}>
          <label>
            <span>{noteLabel(lib.name, lib.first_time)} <span className="optional">(optional)</span></span>
            <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="form-actions">
            <button type="submit" className="button" disabled={busy}>Ask for a pass</button>
            <button type="button" className="link-button" disabled={busy} onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="library-actions">
          {lib.titles > 0 && (
            <button type="button" className="button button-quiet" onClick={() => onBrowse(lib.owner_id)}>
              Browse this shelf
            </button>
          )}
          {standing.canAsk && (
            <button type="button" className="button button-quiet" onClick={() => setAsking(true)}>
              Ask for a library pass
            </button>
          )}
          {standing.pending && (
            <button type="button" className="link-button" disabled={busy}
              onClick={() => run(() => withdrawPassRequest(lib.owner_id))}>
              Withdraw pass request
            </button>
          )}
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  )
}
