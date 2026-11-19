import { describe, expect, it } from 'vitest'
import {
  availability,
  awardName,
  countBy,
  filingTitle,
  filterBooks,
  languageName,
  sortByFilingTitle,
} from './catalogue'

const books = [
  { title: 'The Stand', author: 'Stephen King', genre: 'Horror', language: 'en', prizes: [] },
  { title: 'American Gods', author: 'Neil Gaiman', genre: 'Fantasy', language: 'en',
    prizes: ['Hugo Award 2002', 'Nebula Award 2002'] },
  { title: 'Perdido Street Station', author: 'China Miéville', genre: 'Fantasy', language: 'en',
    prizes: ['Arthur C. Clarke Award 2001'] },
  { title: 'Die Winterrose', author: 'Jennifer Donnelly', genre: 'Historical Fiction', language: 'de',
    prizes: [] },
  { title: 'Dune', author: 'Frank Herbert', series: 'Dune #1', genre: 'Science Fiction', language: 'en',
    prizes: ['Nebula Award 1965', 'Hugo Award 1966'] },
]

describe('availability', () => {
  it('shows a single free copy as on the shelf', () => {
    expect(availability({ copies_total: 1, copies_out: 0, waiting: 0 }))
      .toEqual({ state: 'available', text: 'On the shelf' })
  })

  it('counts free copies when there are several', () => {
    expect(availability({ copies_total: 2, copies_out: 1, waiting: 0 }).text).toBe('1 of 2 on the shelf')
  })

  it('treats a copy claimed by a reservation as reserved', () => {
    expect(availability({ copies_total: 1, copies_out: 0, waiting: 1 }))
      .toEqual({ state: 'reserved', text: 'Reserved, 1 in the queue' })
  })

  it('shows the queue when every copy is out', () => {
    expect(availability({ copies_total: 2, copies_out: 2, waiting: 3 }))
      .toEqual({ state: 'out', text: 'All copies out, 3 in the queue' })
    expect(availability({ copies_total: 1, copies_out: 1, waiting: 0 }).text).toBe('Lent out')
  })

  it('copes with missing data', () => {
    expect(availability(undefined).state).toBe('none')
  })
})

describe('awards and languages', () => {
  it('drops the year from an award', () => {
    expect(awardName('Hugo Award 2002')).toBe('Hugo Award')
    expect(awardName('Booker Prize')).toBe('Booker Prize')
  })

  it('names languages', () => {
    expect(languageName('de')).toBe('German')
    expect(languageName('fr')).toBe('FR')
  })
})

describe('filing order', () => {
  it('ignores leading articles and punctuation', () => {
    expect(filingTitle('The Stand')).toBe('stand')
    expect(filingTitle("'Salem's Lot")).toBe("salem's lot")
    expect(filingTitle('Die Winterrose', 'de')).toBe('winterrose')
    expect(filingTitle('Die Winterrose', 'en')).toBe('die winterrose')
  })

  it('sorts the way a library shelves', () => {
    expect(sortByFilingTitle(books).map((b) => b.title)).toEqual([
      'American Gods', 'Dune', 'Perdido Street Station', 'The Stand', 'Die Winterrose',
    ])
  })
})

describe('filterBooks', () => {
  const titles = (filters) => filterBooks(books, filters).map((b) => b.title)

  it('searches title, author and series, ignoring case and accents', () => {
    expect(titles({ query: 'mieville' })).toEqual(['Perdido Street Station'])
    expect(titles({ query: 'stephen stand' })).toEqual(['The Stand'])
    expect(titles({ query: 'dune #1' })).toEqual(['Dune'])
  })

  it('filters by genre, award and language together', () => {
    expect(titles({ genre: 'Fantasy', award: 'Hugo Award' })).toEqual(['American Gods'])
    expect(titles({ language: 'de' })).toEqual(['Die Winterrose'])
    expect(titles({ award: 'Nebula Award' })).toEqual(['American Gods', 'Dune'])
  })

  it('returns everything with no filters', () => {
    expect(titles({})).toHaveLength(books.length)
  })
})

describe('countBy', () => {
  it('counts each award once per book', () => {
    const awards = countBy(books, (b) => b.prizes.map(awardName))
    expect(awards).toContainEqual({ value: 'Hugo Award', count: 2 })
    expect(awards[0].value).toBe('Arthur C. Clarke Award')
  })
})
