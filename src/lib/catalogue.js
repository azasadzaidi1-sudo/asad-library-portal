// Pure helper functions for the catalogue: no React, no Supabase.
// Keeping them separate makes them easy to test (see catalogue.test.js).

export const LANGUAGE_NAMES = { en: 'English', de: 'German', ur: 'Urdu' }

export function languageName(code) {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase()
}

// "Hugo Award 2002" -> "Hugo Award", so the award filter groups all years together.
export function awardName(prize) {
  return prize.replace(/\s+\d{4}$/, '').trim()
}

// Lower-case and strip accents, so "miéville" matches "Mieville".
export function normalise(text) {
  return (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

// Libraries file titles without their leading article: "The Stand" sits
// under S, "Die Winterrose" under W. Leading punctuation is skipped too,
// so "'Salem's Lot" files under S.
const LEADING_ARTICLES = {
  en: /^(the|a|an)\s+/,
  de: /^(der|die|das|ein|eine)\s+/,
}

export function filingTitle(title, language = 'en') {
  const plain = normalise(title).replace(/^[^\p{L}\p{N}]+/u, '')
  const article = LEADING_ARTICLES[language]
  return article ? plain.replace(article, '') : plain
}

export function sortByFilingTitle(books) {
  return [...books].sort((a, b) =>
    filingTitle(a.title, a.language).localeCompare(filingTitle(b.title, b.language)),
  )
}

// Turns the counts from the book_availability() database function into
// what a member sees. "waiting" counts open reservations, which claim
// copies on the shelf before anyone new can.
export function availability({ copies_total = 0, copies_out = 0, waiting = 0 } = {}) {
  if (copies_total === 0) return { state: 'none', text: 'No copies yet' }

  const onShelf = Math.max(copies_total - copies_out, 0)
  const free = Math.max(onShelf - waiting, 0)
  const queue = waiting === 1 ? '1 in the queue' : `${waiting} in the queue`

  if (free > 0) {
    return {
      state: 'available',
      text: copies_total === 1 ? 'On the shelf' : `${free} of ${copies_total} on the shelf`,
    }
  }
  if (onShelf > 0) {
    return { state: 'reserved', text: `Reserved, ${queue}` }
  }
  const out = copies_total === 1 ? 'Lent out' : 'All copies out'
  return { state: 'out', text: waiting > 0 ? `${out}, ${queue}` : out }
}

// Applies the search box and the three filters.
export function filterBooks(books, { query = '', genre = '', award = '', language = '' } = {}) {
  const words = normalise(query).split(/\s+/).filter(Boolean)

  return books.filter((book) => {
    if (genre && book.genre !== genre) return false
    if (language && book.language !== language) return false
    if (award && !(book.prizes ?? []).some((p) => awardName(p) === award)) return false
    if (words.length === 0) return true
    const haystack = normalise([book.title, book.author, book.series].join(' '))
    return words.every((word) => haystack.includes(word))
  })
}

// Values for a filter drop-down, with how many books have each one,
// e.g. [{ value: 'Fantasy', count: 41 }, ...], sorted by name.
export function countBy(books, valuesOf) {
  const counts = new Map()
  for (const book of books) {
    for (const value of new Set(valuesOf(book))) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value))
}
