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
