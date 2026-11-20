import { describe, expect, it } from 'vitest'
import {
  awardsFromWikidata,
  findInCatalogue,
  fromOpenLibraryDoc,
  isbnFrom,
  languageFromCodes,
  shortAwardName,
} from './openLibrary'

// Real answers, fetched from Open Library and Wikidata on 21 Nov 2026.
const AMERICAN_GODS = {
  author_name: ['Neil Gaiman'],
  cover_i: 8494659,
  first_publish_year: 2001,
  key: '/works/OL679360W',
  language: ['fre', 'chi', 'ger', 'por', 'dut', 'cze', 'spa', 'eng'],
  title: 'American Gods',
}
const AMERICAN_GODS_AWARDS = {
  results: {
    bindings: [
      { year: { value: '2003' }, awardLabel: { value: 'Nebula Award for Best Novel' } },
      { year: { value: '2001' }, awardLabel: { value: 'Bram Stoker Award for Novel' } },
      { year: { value: '2002' }, awardLabel: { value: 'Hugo Award for Best Novel' } },
      { year: { value: '2002' }, awardLabel: { value: 'Locus Award for Best Fantasy Novel' } },
      { awardLabel: { value: 'NPR Top 100 Science Fiction and Fantasy Books' } },
    ],
  },
}

describe('Open Library', () => {
  it('recognises ISBNs, typed or scanned', () => {
    expect(isbnFrom('978-0-7475-9105-4')).toBe('9780747591054')
    expect(isbnFrom('0747591059')).toBe('0747591059')
    expect(isbnFrom('074759105X')).toBe('074759105X')
    expect(isbnFrom('American Gods')).toBeNull()
    expect(isbnFrom('12345')).toBeNull()
  })

  it('turns a search result into a book', () => {
    expect(fromOpenLibraryDoc(AMERICAN_GODS)).toEqual({
      workKey: 'OL679360W',
      title: 'American Gods',
      author: 'Neil Gaiman',
      year: 2001,
      coverId: 8494659,
      language: 'en',
    })
  })

  it('guesses the language, preferring English, German and Urdu', () => {
    expect(languageFromCodes(['fre', 'eng'])).toBe('en')
    expect(languageFromCodes(['ger', 'fre'])).toBe('de')
    expect(languageFromCodes(['urd'])).toBe('ur')
    expect(languageFromCodes(['spa'])).toBe('es')
    expect(languageFromCodes([])).toBe('en')
  })
})

describe('Wikidata awards', () => {
  it('shortens award names to match the catalogue', () => {
    expect(shortAwardName('Hugo Award for Best Novel')).toBe('Hugo Award')
    expect(shortAwardName('Locus Award for Best Fantasy Novel')).toBe('Locus Award')
    expect(shortAwardName('Bram Stoker Award for Novel')).toBe('Bram Stoker Award')
    expect(shortAwardName('Booker Prize')).toBe('Booker Prize')
  })

  it('keeps only prizes with a year, oldest first', () => {
    expect(awardsFromWikidata(AMERICAN_GODS_AWARDS)).toEqual([
      'Bram Stoker Award 2001',
      'Hugo Award 2002',
      'Locus Award 2002',
      'Nebula Award 2003',
    ])
    expect(awardsFromWikidata({})).toEqual([])
  })
})

describe('already in the catalogue?', () => {
  const books = [
    { id: 1, title: 'Harry Potter and the Deathly Hallows', author: 'J.K. Rowling', ol_work_key: null },
    { id: 2, title: 'Piranesi', author: 'Susanna Clarke', ol_work_key: 'OL20000000W' },
  ]

  it('matches the same title and author, however they are written', () => {
    expect(findInCatalogue(books, { title: 'Harry Potter and the Deathly Hallows', author: 'J. K. Rowling' })?.id).toBe(1)
    expect(findInCatalogue(books, { title: 'harry potter and the deathly hallows!', author: 'Rowling' })?.id).toBe(1)
  })

  it('matches the same Open Library work', () => {
    expect(findInCatalogue(books, { workKey: 'OL20000000W', title: 'Piranesi (novel)', author: 'S. Clarke' })?.id).toBe(2)
  })

  it('does not match a different book', () => {
    expect(findInCatalogue(books, { title: 'Harry Potter and the Goblet of Fire', author: 'J.K. Rowling' })).toBeNull()
    expect(findInCatalogue(books, { title: 'Piranesi', author: 'Giovanni Battista Piranesi' })).toBeNull()
  })
})
