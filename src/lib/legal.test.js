import { describe, expect, it } from 'vitest'
import { RULES_VERSION, deleteWordMatches, deletionBlockedReason, needsToAcceptRules } from './legal'

describe('needsToAcceptRules', () => {
  it('asks members who never accepted', () => {
    expect(needsToAcceptRules({ rules_version: null })).toBe(true)
  })

  it('asks again after the rules change', () => {
    expect(needsToAcceptRules({ rules_version: RULES_VERSION - 1 })).toBe(true)
  })

  it('lets through members who accepted the current rules', () => {
    expect(needsToAcceptRules({ rules_version: RULES_VERSION })).toBe(false)
  })
})

describe('deleteWordMatches', () => {
  it('accepts DELETE, ignoring spaces and capitals', () => {
    expect(['DELETE', ' delete ', 'Delete'].every(deleteWordMatches)).toBe(true)
  })

  it('refuses anything else', () => {
    expect(['', 'DELET', 'delete me'].some(deleteWordMatches)).toBe(false)
  })
})

describe('deletionBlockedReason', () => {
  it('is empty when every book is home', () => {
    expect(deletionBlockedReason({ borrowed: 0, lent: 0 })).toBe('')
  })

  it('names borrowed and lent books', () => {
    expect(deletionBlockedReason({ borrowed: 1, lent: 2 })).toBe(
      'Not yet: you still have 1 borrowed book to return, and 2 books of yours are still lent out. ' +
        'You can delete your account once every book is back home.',
    )
  })

  it('stops the admin account', () => {
    expect(deletionBlockedReason({ borrowed: 0, lent: 0 }, true)).toMatch(/admin account/)
  })
})
