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

// ---------- Covers ----------

// Open Library serves covers by number; size is S, M or L.
export function coverUrl(coverId, size = 'M') {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null
}

// ---------- Reservations ----------

export function ordinal(n) {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`
}

// What a member's own open reservation means right now.
//   reservation: { status, queue_place } from my_open_reservation()
//   counts:      { copies_total, copies_out } from book_availability()
export function describeMyReservation(reservation, counts = {}) {
  if (reservation.status === 'pending_approval') {
    return { state: 'pending', text: "Waiting for Asad's approval" }
  }
  const onShelf = Math.max((counts.copies_total ?? 0) - (counts.copies_out ?? 0), 0)
  if (reservation.queue_place <= onShelf) {
    return { state: 'ready', text: 'A copy is waiting for you. Get in touch with Asad on when you can pick up.' }
  }
  return { state: 'queued', text: `You're ${ordinal(reservation.queue_place)} in the queue` }
}

// Due dates and request dates, written the British way: 17 Dec 2026.
export function formatDate(value) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function isOverdue(dueOn, today = new Date()) {
  return new Date(`${dueOn}T23:59:59`) < today
}

export const READING_STATUSES = [
  { value: 'unread', label: 'Unread' },
  { value: 'next', label: 'Next up' },
  { value: 'reading', label: 'Reading' },
  { value: 'read', label: 'Read' },
]

// "Sara (Hamburg)", or a stand-in for a member who hasn't filled in their name yet.
export function memberLabel(member) {
  if (!member?.name) return 'A new member (no name yet)'
  return member.city ? `${member.name} (${member.city})` : member.name
}
