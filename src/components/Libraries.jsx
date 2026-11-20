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

      {libraries.length === 0 && <p className="shelf-empty">No one has added books yet.</p>}

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
            <button type="button" className="button button-quiet" onClick={() => onBrowse(lib.owner_id)}>
              Browse this shelf
            </button>
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
