import { describe, expect, it } from 'vitest'
import { buildDesk, daysBetween, localDate } from './desk'

const books = [
  { id: 1, title: 'Dune' },
  { id: 2, title: 'The Stand' },
  { id: 3, title: 'Mein Kampf' },
]
const copies = [
  { id: 10, book_id: 1 },
  { id: 20, book_id: 2 },
  { id: 21, book_id: 2 },
  { id: 30, book_id: 3 },
]
const sara = { id: 's', name: 'Sara' }
const tom = { id: 't', name: 'Tom' }

describe('dates', () => {
  it('counts days between dates', () => {
    expect(daysBetween('2026-11-20', '2026-11-23')).toBe(3)
    expect(daysBetween('2026-12-18', '2026-12-17')).toBe(-1)
  })

  it('formats the local date', () => {
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('buildDesk', () => {
  const loans = [
    { id: 1, copy_id: 20, member_id: 's', lent_on: '2026-10-01', due_on: '2026-10-29', member: sara },
    { id: 2, copy_id: 10, member_id: 't', lent_on: '2026-11-19', due_on: '2026-12-17', member: tom },
  ]
  const reservations = [
    { id: 5, book_id: 2, status: 'active', created_at: '2026-11-10', member: tom },
    { id: 6, book_id: 2, status: 'active', created_at: '2026-11-11', member: sara },
    { id: 7, book_id: 1, status: 'active', created_at: '2026-11-12', member: sara },
    { id: 8, book_id: 3, status: 'pending_approval', created_at: '2026-11-13', member: tom },
  ]
  const desk = buildDesk({ books, copies, loans, reservations, today: '2026-11-20' })

  it('splits loans into overdue and lent out', () => {
    expect(desk.overdue.map((e) => e.loan.id)).toEqual([1])
    expect(desk.overdue[0].daysLate).toBe(22)
    expect(desk.overdue[0].copy.number).toBe(1)
    expect(desk.lentOut.map((e) => e.loan.id)).toEqual([2])
  })

  it('gives the shelf copy to the first in the queue', () => {
    const stand = desk.reserved.filter((e) => e.book.id === 2)
    expect(stand.map((e) => [e.reservation.id, e.state, e.place])).toEqual([
      [5, 'ready', 1],
      [6, 'waiting', 2],
    ])
    expect(stand[0].onShelf.map((c) => c.number)).toEqual([2])
  })

  it('lists approval requests and puts ready ones first', () => {
    expect(desk.reserved.map((e) => e.state)).toEqual(['ready', 'approval', 'waiting', 'waiting'])
  })

  it('counts only unclaimed copies as available', () => {
    // The Stand's shelf copy is claimed by Tom; Mein Kampf's by the pending request.
    expect(desk.available).toEqual([])
    const quiet = buildDesk({ books, copies, loans: [], reservations: [], today: '2026-11-20' })
    expect(quiet.available.map((e) => [e.book.id, e.unclaimed, e.total])).toEqual([
      [1, 1, 1],
      [2, 2, 2],
      [3, 1, 1],
    ])
  })
})
