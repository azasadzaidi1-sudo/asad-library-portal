import { describe, expect, it } from 'vitest'
import { bookCountLine, borrowerLine, noteLabel, passDeclineText, passStanding, passTakenBackText } from './passes'

describe('bookCountLine', () => {
  it('counts books and copies like before', () => {
    expect(bookCountLine({ titles: 1, copies: 1 })).toBe('1 book')
    expect(bookCountLine({ titles: 35, copies: 40 })).toBe('35 books, 40 copies')
  })

  it('mentions Restricted books for pass holders', () => {
    expect(bookCountLine({ titles: 35, copies: 35, hidden_titles: 5 })).toBe('35 books, plus 5 for library pass holders')
  })

  it("doesn't make an all-Restricted shelf look empty", () => {
    expect(bookCountLine({ titles: 0, copies: 0, hidden_titles: 12 })).toBe('12 books, all for library pass holders')
  })
})

describe('passDeclineText', () => {
  it('is warm, and never says "you"', () => {
    const open = passDeclineText('Mira', true)
    const closed = passDeclineText('Mira', false)
    expect(open).toBe(
      "A library pass from Mira's shelf isn't on its way just yet. Mira's books can still be borrowed one request at a time.",
    )
    expect(closed).toBe(
      "A library pass from Mira's shelf isn't on its way just yet. There are plenty of other shelves to wander through in the meantime.",
    )
    for (const text of [open, closed]) expect(text).not.toMatch(/\byou(r)?\b/i)
  })
})

describe('passStanding', () => {
  const today = new Date('2026-11-24T12:00:00')
  const mira = { name: 'Mira', titles: 10 }

  it('describes each standing', () => {
    expect(passStanding({ ...mira, my_status: 'approved' }, today).canAsk).toBe(false)
    expect(passStanding({ ...mira, my_status: 'pending' }, today)).toMatchObject({ pending: true, canAsk: false })
    expect(passStanding({ ...mira, my_status: 'stopped' }, today).text).toBe('Not lending at the moment.')
    expect(passStanding({ ...mira, my_status: null }, today)).toEqual({
      text: "Mira OKs each request. With a library pass, you'd reserve without asking.",
      canAsk: true,
    })
    expect(passStanding({ name: 'Jonas', titles: 0, my_status: null }, today).text)
      .toBe("Jonas's shelf is open to library pass holders.")
  })

  it('says plainly when a pass was taken back, with no way to ask again', () => {
    expect(passStanding({ ...mira, my_status: 'taken_back' }, today)).toEqual({
      text: "Mira has taken back the library pass for this shelf. Mira's books can still be asked for one request at a time.",
      canAsk: false,
      takenBack: true,
    })
    expect(passTakenBackText('Jonas', false)).toBe('Jonas has taken back the library pass for this shelf.')
  })

  it('shows the warm note for a week after a "Not now"', () => {
    const declined = { ...mira, my_status: 'declined', decided_at: '2026-11-20T10:00:00Z', ask_again_on: '2027-02-20' }
    expect(passStanding(declined, today)).toMatchObject({ declined: true, canAsk: false })
  })

  it('then says when they can ask again', () => {
    const declined = { ...mira, my_status: 'declined', decided_at: '2026-11-01T10:00:00Z', ask_again_on: '2027-02-01' }
    expect(passStanding(declined, today).text).toBe("A pass from Mira's shelf can be asked for again from 1 February 2027.")
  })

  it('lets them ask once the wait is over or lifted', () => {
    const lifted = { ...mira, my_status: 'declined', decided_at: '2026-11-01T10:00:00Z', ask_again_on: null }
    expect(passStanding(lifted, today).canAsk).toBe(true)
  })
})

describe('noteLabel', () => {
  it('keeps the first-time prompt, then asks openly', () => {
    expect(noteLabel('Mira', true)).toBe('Remind Mira how you know each other')
    expect(noteLabel('Mira', false)).toBe('Anything Mira should know?')
  })
})

describe('borrowerLine', () => {
  const date = () => '3 Nov 2026'
  it('describes pass holders, borrowers and stopped lending', () => {
    expect(borrowerLine({ status: 'pass', since: 'x', hasBook: true }, date))
      .toBe('Library pass since 3 Nov 2026. Has one of your books.')
    expect(borrowerLine({ status: 'taken_back', since: 'x' }, date)).toBe('You took back their library pass on 3 Nov 2026.')
    expect(borrowerLine({ status: 'borrower', loans: 1 }, date)).toBe('Borrowed from you once, no library pass.')
    expect(borrowerLine({ status: 'borrower', loans: 3 }, date)).toBe('Borrowed from you 3 times, no library pass.')
    expect(borrowerLine({ status: 'stopped' }, date)).toBe('You stopped lending to them.')
  })
})
