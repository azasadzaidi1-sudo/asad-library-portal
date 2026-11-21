// Every librarian's shelf, with where the signed-in member stands with each.
// "Browse this shelf" opens the catalogue filtered to that library.
export default function Libraries({ library, onBrowse }) {
  const { libraries } = library
  const own = libraries.filter((l) => l.is_me)
  const others = libraries.filter((l) => !l.is_me)

  return (
    <div className="libraries">
      <h1 className="page-title">Libraries</h1>
      <p className="page-lede">
        Every shelf on The Common Shelf. The first time you borrow from a librarian, they approve you; after
        that you reserve from their shelf like any other.
      </p>

      {own.length === 0 && (
        <section className="start-shelf" aria-labelledby="start-shelf-title">
          <h2 id="start-shelf-title" className="library-name">Start your shelf</h2>
          <p>
            Add the books you're happy to lend. Friends can then borrow them, and you decide who borrows from
            you the first time.
          </p>
          <a className="button" href="#add-book">Add your first book</a>
        </section>
      )}

      <ul className="library-list">
        {[...own, ...others].map((lib) => (
          <li key={lib.owner_id} className="library-card">
            <h2 className="library-name">{lib.is_me ? 'Your shelf' : lib.name}</h2>
            <p className="library-meta">
              {lib.city && <>{lib.city}. </>}
              {lib.titles === 1 ? '1 book' : `${lib.titles} books`}
              {lib.copies > lib.titles && `, ${lib.copies} copies`}
            </p>
            <p className={`library-status library-${lib.my_status ?? 'new'}`}>{standing(lib)}</p>
            <div className="library-actions">
              <button type="button" className="button button-quiet" onClick={() => onBrowse(lib.owner_id)}>
                Browse this shelf
              </button>
              {lib.is_me && <a className="button button-quiet" href="#add-book">Add a book</a>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function standing(lib) {
  switch (lib.my_status) {
    case 'own':
      return 'Other members borrow from here.'
    case 'approved':
      return 'You can borrow from here.'
    case 'pending':
      return `Waiting for ${lib.name}'s OK on your first request.`
    case 'stopped':
      return 'Not lending at the moment.'
    default:
      return `First time? ${lib.name} approves new borrowers.`
  }
}
