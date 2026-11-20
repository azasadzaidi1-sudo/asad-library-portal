// Looking books up for the Add book page: Open Library for the book itself,
// Wikidata for the prizes it won. Both are free and need no key.

import { normalise } from './catalogue'

const OPEN_LIBRARY = 'https://openlibrary.org/search.json'
const WIKIDATA = 'https://query.wikidata.org/sparql'
const FIELDS = 'key,title,author_name,first_publish_year,cover_i,language'

// Open Library's three-letter language codes -> the two-letter codes we store.
const LANGUAGE_CODES = {
  eng: 'en', ger: 'de', urd: 'ur', fre: 'fr', spa: 'es', ita: 'it', tur: 'tr', ara: 'ar', per: 'fa', dut: 'nl', por: 'pt',
}
// When a book exists in several languages, guess in this order (the librarian can change it).
const LANGUAGE_PREFERENCE = ['eng', 'ger', 'urd', 'fre', 'spa', 'ita', 'tur', 'ara', 'per', 'dut', 'por']

// "978-0-7475-9105-4" -> "9780747591054"; anything else -> null.
export function isbnFrom(text) {
  const digits = String(text).replace(/[\s-]/g, '').toUpperCase()
  if (/^97[89]\d{10}$/.test(digits) || /^\d{9}[\dX]$/.test(digits)) return digits
  return null
}

export function languageFromCodes(codes = []) {
  const found = LANGUAGE_PREFERENCE.find((code) => codes.includes(code))
  return found ? LANGUAGE_CODES[found] : 'en'
}

// One Open Library search result -> what the Add book page shows.
export function fromOpenLibraryDoc(doc) {
  return {
    workKey: doc.key ? doc.key.replace('/works/', '') : null,
    title: doc.title ?? '',
    author: (doc.author_name ?? []).join(', '),
    year: doc.first_publish_year ?? null,
    coverId: doc.cover_i ?? null,
    language: languageFromCodes(doc.language),
  }
}

async function getJson(url, { timeout = 8000, headers = {} } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { signal: controller.signal, headers })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

// Search by title/author, or by ISBN (typed or scanned).
export async function searchOpenLibrary(query) {
  const isbn = isbnFrom(query)
  const params = new URLSearchParams(isbn ? { isbn } : { q: query })
  params.set('fields', FIELDS)
  params.set('limit', isbn ? '5' : '10')
  try {
    const data = await getJson(`${OPEN_LIBRARY}?${params}`)
    return (data.docs ?? []).map(fromOpenLibraryDoc).filter((b) => b.title)
  } catch {
    throw new Error("Open Library didn't answer. Check your connection and try again.")
  }
}

// "Hugo Award for Best Novel" -> "Hugo Award", so they read like the rest of
// the catalogue ("Hugo Award 2002").
export function shortAwardName(label) {
  return label.replace(/\s+for\s+(the\s+)?best\b.*$/i, '').replace(/\s+for\s+novel$/i, '').trim()
}

// Wikidata's answer -> ["Hugo Award 2002", ...]. Only prizes with a year:
// that leaves out "best of" lists, which aren't awards.
export function awardsFromWikidata(data) {
  const seen = new Set()
  const awards = []
  for (const row of data?.results?.bindings ?? []) {
    const label = row.awardLabel?.value
    const year = row.year?.value
    if (!label || !year || /^Q\d+$/.test(label)) continue
    const text = `${shortAwardName(label)} ${year}`
    if (!seen.has(text)) {
      seen.add(text)
      awards.push(text)
    }
  }
  return awards.sort((a, b) => a.slice(-4).localeCompare(b.slice(-4)) || a.localeCompare(b)).slice(0, 12)
}

// Prizes the book won, looked up by its Open Library work. Returns [] when
// Wikidata doesn't know the book or doesn't answer in time: adding the
// book never waits on this.
export async function findAwards(workKey) {
  if (!/^OL\d+W$/.test(workKey ?? '')) return []
  const query = `SELECT ?awardLabel ?year WHERE {
    ?work wdt:P648 "${workKey}" ; p:P166 ?st .
    ?st ps:P166 ?award .
    OPTIONAL { ?st pq:P585 ?date . BIND(YEAR(?date) AS ?year) }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`
  try {
    const data = await getJson(`${WIKIDATA}?${new URLSearchParams({ query, format: 'json' })}`, {
      timeout: 6000,
      headers: { Accept: 'application/sparql-results+json' },
    })
    return awardsFromWikidata(data)
  } catch {
    return []
  }
}

// Is this title already in the catalogue? Same Open Library work, or the
// same title and author (ignoring case, accents and punctuation).
export function findInCatalogue(books, { workKey, title, author }) {
  const t = clean(title)
  return (
    books.find((b) => workKey && b.ol_work_key === workKey) ??
    books.find((b) => clean(b.title) === t && (clean(b.author) === clean(author) || sharesSurname(b.author, author))) ??
    null
  )
}

// Lower case, no accents, punctuation as spaces: "The Kite-Runner!" -> "the kite runner".
function clean(text) {
  return normalise(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

// "J.K. Rowling" vs "J. K. Rowling": compare the last word of each name.
function sharesSurname(x, y) {
  const last = (name) => clean(name).split(' ').pop() ?? ''
  const a = last(x)
  return a.length >= 3 && a === last(y)
}
