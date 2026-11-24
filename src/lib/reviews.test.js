import { describe, expect, it } from 'vitest'
import { attachAuthors, canDelete, canEdit, orderReviews } from './reviews'

const people = [
  { member_id: 's', name: 'Sara', borrowed: true },
  { member_id: 't', name: 'Tom', borrowed: false },
]
const reviews = [
  { id: 2, member_id: 't', body: 'Fine', replies: [] },
  { id: 1, member_id: 's', body: 'Great', replies: [{ id: 9, member_id: 't' }, { id: 10, member_id: 'x' }] },
]

describe('attachAuthors', () => {
  const result = attachAuthors(reviews, people)

  it('adds names and the borrowed badge', () => {
    expect(result.map((r) => [r.author, r.borrowed])).toEqual([['Tom', false], ['Sara', true]])
  })

  it('names reply authors, with a stand-in for unknown members', () => {
    expect(result[1].replies.map((r) => r.author)).toEqual(['Tom', 'A new member'])
  })

  it('shows "Former member" for posts whose author deleted their account', () => {
    const [kept] = attachAuthors([{ id: 3, member_id: null, body: 'Still here', replies: [{ id: 11, member_id: null }] }], people)
    expect([kept.author, kept.borrowed, kept.replies[0].author]).toEqual(['Former member', false, 'Former member'])
  })
})

describe('orderReviews', () => {
  it('puts your own review first', () => {
    expect(orderReviews(reviews, 's').map((r) => r.id)).toEqual([1, 2])
  })
})

describe('permissions', () => {
  const sara = { id: 's', is_admin: false }
  const asad = { id: 'a', is_admin: true }

  it('lets you edit only your own posts', () => {
    expect(canEdit({ member_id: 's' }, sara)).toBe(true)
    expect(canEdit({ member_id: 's' }, asad)).toBe(false)
  })

  it('lets the admin delete anything', () => {
    expect(canDelete({ member_id: 't' }, sara)).toBe(false)
    expect(canDelete({ member_id: 't' }, asad)).toBe(true)
  })
})
