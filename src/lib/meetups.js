// Book club meet-ups: one at a time, posted by Asad from his Account page,
// shown to members at the top of the Catalogue. See supabase/18_book_club_meetups.sql.
//
// Times are always Berlin time, wherever the phone is: the meet-ups are in
// Berlin, and Asad may post one while travelling.

import { supabase } from '../supabaseClient'

export const MEETUP_ZONE = 'Europe/Berlin'
export const MEETUP_TITLE = 'Next book club meet-up'
export const FORMAT_LINE = "Bring the book you can't put down and tell everyone why it's got you hooked."
export const PLACE_MAX = 150
export const NOTE_MAX = 300

// The wall-clock parts of a moment in Berlin: { year, month, day, hour, minute }.
function berlinParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MEETUP_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type) => Number(parts.find((p) => p.type === type).value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

// "2026-12-11" and "19:00", meant as Berlin time, to the moment it is
// (an ISO string for the database). Null if either is missing.
export function berlinToIso(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '')
  const t = /^(\d{2}):(\d{2})$/.exec(time ?? '')
  if (!d || !t) return null
  const wanted = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2])
  // Start from the same wall time in UTC and shift by Berlin's offset then;
  // twice, in case the first guess landed on the other side of a clock change.
  let guess = wanted
  for (let i = 0; i < 2; i++) {
    const p = berlinParts(new Date(guess))
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    guess += wanted - shown
  }
  return new Date(guess).toISOString()
}

// The other way, for the edit form: { date: "2026-12-11", time: "19:00" }.
export function isoToBerlinInputs(value) {
  const p = berlinParts(new Date(value))
  const two = (n) => String(n).padStart(2, '0')
  return { date: `${p.year}-${two(p.month)}-${two(p.day)}`, time: `${two(p.hour)}:${two(p.minute)}` }
}

// "Thursday 11 December, 19:00"
export function meetupWhen(value) {
  const date = new Date(value)
  const day = date.toLocaleDateString('en-GB', { timeZone: MEETUP_ZONE, weekday: 'long', day: 'numeric', month: 'long' })
  const time = date.toLocaleTimeString('en-GB', { timeZone: MEETUP_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${day}, ${time}`
}

// "Thu 13 Nov 2026", for Asad's list of earlier meet-ups.
export function meetupShortDate(value) {
  return new Date(value).toLocaleDateString('en-GB', {
    timeZone: MEETUP_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

// Opens the place in Google Maps (only if someone taps it).
export function mapsLink(place) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
}

// What members see next to the button: a number, never names.
export function comingLine(coming) {
  if (!coming) return 'Be the first to count yourself in.'
  return `${coming} coming`
}

// What Asad sees: "3 said they'd come: Noor, Sam and Lena".
export function guestLine(coming, names) {
  if (!coming) return 'Nobody has counted themselves in yet.'
  const said = `${coming} said they'd come`
  if (!names?.length) return said
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `${said}: ${list}`
}

// Checks the form before it's sent; '' when it's fine.
export function meetupFormError({ date, time, place, note }, now = new Date()) {
  const startsAt = berlinToIso(date, time)
  if (!startsAt) return 'Pick a date and a start time.'
  if (new Date(startsAt) <= now) return 'Pick a date and time in the future.'
  if (!place?.trim()) return 'Say where it is.'
  if (place.trim().length > PLACE_MAX) return `Keep the place under ${PLACE_MAX} characters.`
  if ((note ?? '').trim().length > NOTE_MAX) return `Keep the note under ${NOTE_MAX} characters.`
  return ''
}

// From Asad's list (newest first): the one still to come, if any, and the earlier ones.
export function splitAdminMeetups(rows, now = new Date()) {
  const upcoming = rows.find((m) => new Date(m.starts_at) > now) ?? null
  return { upcoming, earlier: rows.filter((m) => m !== upcoming) }
}

function unwrap({ data, error }, friendly) {
  if (error) throw new Error(friendly ? friendly(error) : error.message)
  return data
}

// Members

// { meetup_id, starts_at, place, note, coming, i_am_coming, nudge_meetup_id }
export async function loadMeetupCard() {
  const rows = unwrap(await supabase.rpc('meetup_card'))
  return rows?.[0] ?? null
}

export async function countMeIn(id) {
  unwrap(await supabase.rpc('count_me_in', { p_id: id }), (e) => `That didn't work: ${e.message}`)
}

export async function cantMakeIt(id) {
  unwrap(await supabase.rpc('cant_make_it', { p_id: id }), (e) => `That didn't work: ${e.message}`)
}

export async function hideMeetupNudge(id) {
  unwrap(await supabase.rpc('hide_meetup_nudge', { p_id: id }))
}

// Asad

export async function loadAdminMeetups() {
  return unwrap(await supabase.rpc('meetups_for_admin')) ?? []
}

export async function postMeetup({ date, time, place, note }) {
  unwrap(
    await supabase.rpc('post_meetup', { p_starts_at: berlinToIso(date, time), p_place: place, p_note: note }),
    (e) => `The meet-up wasn't posted: ${e.message}`,
  )
}

export async function editMeetup(id, { date, time, place, note }) {
  unwrap(
    await supabase.rpc('edit_meetup', { p_id: id, p_starts_at: berlinToIso(date, time), p_place: place, p_note: note }),
    (e) => `The changes weren't saved: ${e.message}`,
  )
}

export async function cancelMeetup(id) {
  unwrap(await supabase.rpc('cancel_meetup', { p_id: id }), (e) => `The meet-up wasn't cancelled: ${e.message}`)
}
