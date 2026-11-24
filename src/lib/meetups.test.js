import { describe, expect, it } from 'vitest'
import {
  berlinToIso,
  comingLine,
  guestLine,
  isoToBerlinInputs,
  mapsLink,
  meetupFormError,
  meetupWhen,
  nudgeLine,
  splitAdminMeetups,
} from './meetups'

describe('Berlin time, wherever the phone is', () => {
  it('turns a Berlin date and time into the moment it is', () => {
    expect(berlinToIso('2026-12-11', '19:00')).toBe('2026-12-11T18:00:00.000Z')   // winter: UTC+1
    expect(berlinToIso('2027-06-10', '19:00')).toBe('2027-06-10T17:00:00.000Z')   // summer: UTC+2
  })

  it('gets the clock-change weekends right', () => {
    expect(berlinToIso('2027-03-28', '19:00')).toBe('2027-03-28T17:00:00.000Z')   // the evening after clocks go forward
    expect(berlinToIso('2026-10-25', '19:00')).toBe('2026-10-25T18:00:00.000Z')   // the evening after they go back
  })

  it('needs both a date and a time', () => {
    expect(berlinToIso('', '19:00')).toBeNull()
    expect(berlinToIso('2026-12-11', '')).toBeNull()
  })

  it('fills the edit form back in, in Berlin time', () => {
    expect(isoToBerlinInputs('2026-12-11T18:00:00.000Z')).toEqual({ date: '2026-12-11', time: '19:00' })
    expect(isoToBerlinInputs('2027-06-10T17:30:00.000Z')).toEqual({ date: '2027-06-10', time: '19:30' })
  })

  it('writes the date out in full', () => {
    expect(meetupWhen('2026-12-11T18:00:00.000Z')).toBe('Friday 11 December, 19:00')
  })
})

describe('what members and Asad see', () => {
  it('shows members a number, never names', () => {
    expect(comingLine(0)).toBe('Be the first to count yourself in.')
    expect(comingLine(1)).toBe('1 coming')
    expect(comingLine(6)).toBe('6 coming')
  })

  it('shows Asad who', () => {
    expect(guestLine(0, [])).toBe('Nobody has counted themselves in yet.')
    expect(guestLine(1, ['Noor'])).toBe("1 said they'd come: Noor")
    expect(guestLine(3, ['Noor', 'Sam', 'Lena'])).toBe("3 said they'd come: Noor, Sam and Lena")
    expect(guestLine(9, null)).toBe("9 said they'd come")   // a week later, the names are gone
  })

  it('asks librarians only about a book that is not on their shelf yet', () => {
    expect(nudgeLine(true)).toBe(
      "Presented a book that isn't on your shelf yet? Add it for the possibility to share with others.",
    )
    expect(nudgeLine(false)).toBe(
      'Presented a book at the meet-up? Add it to your shelf for the possibility to share with others.',
    )
  })

  it('links the place to Google Maps', () => {
    expect(mapsLink('Café Pförtner, Uferstraße 8')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Caf%C3%A9%20Pf%C3%B6rtner%2C%20Uferstra%C3%9Fe%208',
    )
  })
})

describe('the form', () => {
  const now = new Date('2026-11-24T21:00:00Z')
  const ok = { date: '2026-12-11', time: '19:00', place: 'Café Pförtner', note: '' }

  it('accepts a meet-up in the future with a place', () => {
    expect(meetupFormError(ok, now)).toBe('')
  })

  it('says what is missing', () => {
    expect(meetupFormError({ ...ok, time: '' }, now)).toBe('Pick a date and a start time.')
    expect(meetupFormError({ ...ok, date: '2026-11-20' }, now)).toBe('Pick a date and time in the future.')
    expect(meetupFormError({ ...ok, place: '  ' }, now)).toBe('Say where it is.')
    expect(meetupFormError({ ...ok, note: 'x'.repeat(301) }, now)).toBe('Keep the note under 300 characters.')
  })
})

describe("Asad's list", () => {
  it('separates the one still to come from the earlier ones', () => {
    const now = new Date('2026-11-24T21:00:00Z')
    const next = { id: 3, starts_at: '2026-12-11T18:00:00Z' }
    const tonight = { id: 2, starts_at: '2026-11-24T18:00:00Z' }
    const last = { id: 1, starts_at: '2026-11-10T18:00:00Z' }
    expect(splitAdminMeetups([next, tonight, last], now)).toEqual({ upcoming: next, earlier: [tonight, last] })
    expect(splitAdminMeetups([tonight, last], now)).toEqual({ upcoming: null, earlier: [tonight, last] })
  })
})
