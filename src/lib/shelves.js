// Shelf descriptions on the Libraries page: a line worked out from the
// shelf's books, plus two lines the librarian writes. See
// supabase/11_shelf_descriptions.sql.

export const SHELF_LINE_MAX = 100

// Adds each shelf's description to its library row.
export function withShelfDescriptions(libraries, descriptions) {
  const byOwner = new Map(descriptions.map((d) => [d.owner_id, d]))
  return libraries.map((lib) => {
    const d = byOwner.get(lib.owner_id)
    return {
      ...lib,
      top_genres: d?.top_genres ?? [],
      personality: d?.personality ?? null,
      pickups: d?.pickups ?? null,
      described: d?.described ?? false,
    }
  })
}

// "Top genres: Fantasy, Science Fiction, Classics", or null for no books.
export function topGenresLine(genres) {
  if (!genres?.length) return null
  return `${genres.length === 1 ? 'Top genre' : 'Top genres'}: ${genres.join(', ')}`
}

// The "Your shelf" line on the Account page: "38 books, 40 copies" or
// "1 book", plus how many of them are in the Restricted Section.
//   shelf:      your own row from libraries() (titles, copies)
//   restricted: Map of book id -> Map of owner id -> reason (loadRestricted)
export function ownShelfLine(shelf, restricted, memberId) {
  const titles = shelf?.titles ?? 0
  const copies = shelf?.copies ?? 0
  const books = titles === 1 ? '1 book' : `${titles} books`
  const count = copies > titles ? `${books}, ${copies} copies` : books
  let inRestricted = 0
  for (const owners of restricted?.values() ?? []) if (owners.has(memberId)) inRestricted += 1
  if (inRestricted === 0) return `${count} on your shelf.`
  const which = inRestricted === titles ? (titles === 1 ? 'it is' : 'all of them are') : `${inRestricted} of them ${inRestricted === 1 ? 'is' : 'are'}`
  return `${count} on your shelf; ${which} in your Restricted Section.`
}
