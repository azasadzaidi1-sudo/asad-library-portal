import { describe, expect, it } from 'vitest'
import { topGenresLine, withShelfDescriptions } from './shelves'

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
