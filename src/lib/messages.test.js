import { describe, expect, it } from 'vitest'
import { charactersLeft, otherLabel, senderLabel, stageLine, threadNotice, unreadTotal } from './messages'

const date = (value) => `[${value}]`

describe('people in a conversation', () => {
  const thread = { other_name: 'Mira' }
  it('names the other person, or "Former member" once they have left', () => {
    expect(otherLabel(thread)).toBe('Mira')
    expect(otherLabel({ other_name: null })).toBe('Former member')
  })

  it('labels each message', () => {
    expect(senderLabel({ sender_id: 'me' }, 'me', thread)).toBe('You')
    expect(senderLabel({ sender_id: 'm' }, 'me', thread)).toBe('Mira')
    expect(senderLabel({ sender_id: null }, 'me', thread)).toBe('Former member')
  })
})

describe('stageLine', () => {
  it('follows the loan from reservation to read-only', () => {
    expect(stageLine({ stage: 'requested', role: 'borrower' }, date)).toBe('Reserved')
    expect(stageLine({ stage: 'requested', role: 'librarian' }, date)).toBe('Reserved from your shelf')
    expect(stageLine({ stage: 'lent', due_on: 'd' }, date)).toBe('Lent, due back [d]')
    expect(stageLine({ stage: 'returned', read_only_from: 'r' }, date)).toBe('Returned. Open until [r]')
    expect(stageLine({ stage: 'closed', delete_after: 'x' }, date)).toBe('Read-only. Deleted on [x]')
  })
})

describe('threadNotice', () => {
  it('always says who can read it', () => {
    for (const stage of ['requested', 'lent', 'returned', 'closed']) {
      expect(threadNotice({ stage, other_name: 'Mira' }, date)).toMatch(/^Just between you and Mira\./)
    }
  })

  it('gives the timeline, with dates once they are known', () => {
    expect(threadNotice({ stage: 'lent', other_name: 'Mira' }, date)).toMatch(/for a week after it's back/)
    expect(threadNotice({ stage: 'returned', other_name: 'Mira', read_only_from: 'r', delete_after: 'x' }, date))
      .toMatch(/open until \[r\].*deleted on \[x\]/)
    expect(threadNotice({ stage: 'closed', other_name: 'Mira', delete_after: 'x' }, date))
      .toMatch(/read-only now, and will be deleted on \[x\]/)
  })
})

describe('counts', () => {
  it('adds up unread messages', () => {
    expect(unreadTotal([{ unread: 2 }, { unread: 0 }, { unread: 1 }])).toBe(3)
    expect(unreadTotal()).toBe(0)
  })

  it('counts down only near the 1,000-character limit', () => {
    expect(charactersLeft('hello')).toBe('')
    expect(charactersLeft('x'.repeat(950))).toBe('50 characters left')
    expect(charactersLeft('x'.repeat(999))).toBe('1 character left')
  })
})
