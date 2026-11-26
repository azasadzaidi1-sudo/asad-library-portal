import { describe, expect, it } from 'vitest'
import { ownShelfLine, topGenresLine, withShelfDescriptions } from './shelves'

describe('withShelfDescriptions', () => {
  const libraries = [
    { owner_id: 'a', name: 'Asad' },
    { owner_id: 'm', name: 'Mira' },
  ]

  it('adds each shelf its description', () => {
    const result = withShelfDescriptions(libraries, [
      { owner_id: 'a', top_genres: ['Fantasy', 'Classics'], personality: 'I bringeth the classics!', pickups: null, described: true },
    ])
    expect(result[0]).toMatchObject({ name: 'Asad', top_genres: ['Fantasy', 'Classics'], personality: 'I bringeth the classics!', described: true })
  })

  it('leaves shelves without a description plain', () => {
    const result = withShelfDescriptions(libraries, [])
    expect(result[1]).toEqual({ owner_id: 'm', name: 'Mira', top_genres: [], personality: null, pickups: null, described: false })
  })
})

describe('topGenresLine', () => {
  it('lists up to three genres', () => {
    expect(topGenresLine(['Fantasy', 'Science Fiction', 'Classics'])).toBe('Top genres: Fantasy, Science Fiction, Classics')
  })

  it('says "genre" for one, and nothing for none', () => {
    expect(topGenresLine(['Poetry'])).toBe('Top genre: Poetry')
    expect(topGenresLine([])).toBeNull()
  })
})

describe('ownShelfLine', () => {
  const restricted = new Map([
    [10, new Map([['me', 'Ask the librarian'], ['other', 'Fragile copy']])],
    [11, new Map([['me', 'Fragile copy']])],
    [12, new Map([['other', 'Sensitive content']])],
  ])

  it('counts books, and copies when there are more copies than books', () => {
    expect(ownShelfLine({ titles: 38, copies: 38 }, new Map(), 'me')).toBe('38 books on your shelf.')
    expect(ownShelfLine({ titles: 38, copies: 40 }, new Map(), 'me')).toBe('38 books, 40 copies on your shelf.')
    expect(ownShelfLine({ titles: 1, copies: 1 }, new Map(), 'me')).toBe('1 book on your shelf.')
  })

  it('adds how many are in your own Restricted Section, not anyone else\'s', () => {
    expect(ownShelfLine({ titles: 38, copies: 40 }, restricted, 'me'))
      .toBe('38 books, 40 copies on your shelf; 2 of them are in your Restricted Section.')
    expect(ownShelfLine({ titles: 5, copies: 5 }, restricted, 'other'))
      .toBe('5 books on your shelf; 2 of them are in your Restricted Section.')
    expect(ownShelfLine({ titles: 5, copies: 5 }, new Map([[11, new Map([['me', 'x']])]]), 'me'))
      .toBe('5 books on your shelf; 1 of them is in your Restricted Section.')
  })

  it('says so when the whole shelf is Restricted', () => {
    expect(ownShelfLine({ titles: 2, copies: 3 }, restricted, 'me'))
      .toBe('2 books, 3 copies on your shelf; all of them are in your Restricted Section.')
    expect(ownShelfLine({ titles: 1, copies: 1 }, new Map([[11, new Map([['me', 'x']])]]), 'me'))
      .toBe('1 book on your shelf; it is in your Restricted Section.')
  })
})
