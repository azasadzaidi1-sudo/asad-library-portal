// Every conversation with the database lives here, so the screens only
// deal with plain data and friendly error messages.
import { supabase } from '../supabaseClient'
import { localDate } from './desk'

const BOOK_COLUMNS =
  'id, title, author, series, genre, year_published, language, goodreads_rating, prizes, restricted, restricted_reason, cover_id'

// Supabase answers { data, error }; turn an error into a thrown Error.
function unwrap({ data, error }, friendly) {
  if (error) throw new Error(friendly?.(error) ?? error.message)
  return data
}

export async function loadBooks() {
  return unwrap(await supabase.from('books').select(BOOK_COLUMNS).limit(1000))
}

// Map of book id -> { copies_total, copies_out, waiting }
export async function loadAvailability() {
  const rows = unwrap(await supabase.rpc('book_availability'))
  return new Map(rows.map((row) => [row.book_id, row]))
}

// What the signed-in member has going on: one open reservation (with its
// place in the queue), one book on loan, and requests declined this week.
export async function loadMyCard(memberId) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [reservation, loan, declined] = await Promise.all([
    supabase.rpc('my_open_reservation').maybeSingle(),
    supabase
      .from('loans')
      .select('id, due_on, copy:copies(book_id)')
      .eq('member_id', memberId)
      .is('returned_on', null)
      .maybeSingle(),
    supabase
      .from('reservations')
      .select('id, book_id, decided_at')
      .eq('member_id', memberId)
      .eq('status', 'declined')
      .gte('decided_at', weekAgo)
      .order('decided_at', { ascending: false }),
  ])
  const myLoan = unwrap(loan)
  return {
    reservation: unwrap(reservation),
    loan: myLoan && { id: myLoan.id, due_on: myLoan.due_on, book_id: myLoan.copy.book_id },
    declined: unwrap(declined),
  }
}

export async function reserve(bookId, memberId) {
  unwrap(
    await supabase.from('reservations').insert({ book_id: bookId, member_id: memberId }),
    (error) =>
      error.code === '23505'
        ? 'You already have a reservation open. Cancel it before reserving another book.'
        : `The reservation didn't go through: ${error.message}`,
  )
}

export async function cancelReservation(reservationId) {
  unwrap(
    await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', reservationId),
    (error) => `The reservation wasn't cancelled: ${error.message}`,
  )
}

// ---------- Librarian only (the database refuses these for members) ----------

export async function loadApprovalRequests() {
  return unwrap(
    await supabase
      .from('reservations')
      .select('id, book_id, created_at, member:members(name, city)')
      .eq('status', 'pending_approval')
      .order('created_at'),
  )
}

export async function decideRequest(reservationId, approve) {
  unwrap(
    await supabase
      .from('reservations')
      .update({ status: approve ? 'active' : 'declined' })
      .eq('id', reservationId),
    (error) => `That decision wasn't saved: ${error.message}`,
  )
}

// Copies with who has each one, the queue, who's interested, and the
// librarian's own reading status.
export async function loadLibrarianDetails(bookId) {
  const copies = unwrap(
    await supabase.from('copies').select('id, edition_note').eq('book_id', bookId).order('id'),
  )
  const [loans, queue, reading, interested, members] = await Promise.all([
    supabase
      .from('loans')
      .select('id, copy_id, member_id, lent_on, due_on, member:members(name, city)')
      .is('returned_on', null)
      .in('copy_id', copies.map((c) => c.id)),
    supabase
      .from('reservations')
      .select('id, status, created_at, member_id, member:members(name, city)')
      .eq('book_id', bookId)
      .in('status', ['pending_approval', 'active'])
      .order('created_at'),
    supabase.from('reading_status').select('status').eq('book_id', bookId).maybeSingle(),
    supabase
      .from('interests')
      .select('created_at, member:members(name, city)')
      .eq('book_id', bookId)
      .order('created_at'),
    loadMembers(),
  ])
  const loansByCopy = new Map(unwrap(loans).map((loan) => [loan.copy_id, loan]))
  return {
    copies: copies.map((copy) => ({ ...copy, loan: loansByCopy.get(copy.id) ?? null })),
    queue: unwrap(queue),
    readingStatus: unwrap(reading)?.status ?? 'unread',
    interested: unwrap(interested),
    members,
  }
}

export async function saveReadingStatus(bookId, status) {
  unwrap(
    await supabase.from('reading_status').upsert({ book_id: bookId, status }),
    (error) => `Your reading status wasn't saved: ${error.message}`,
  )
}

// ---------- Interested list (seen by the member and the librarian) ----------

// Set of book ids the member has marked as interested.
export async function loadMyInterests(memberId) {
  const rows = unwrap(await supabase.from('interests').select('book_id').eq('member_id', memberId))
  return new Set(rows.map((row) => row.book_id))
}

export async function setInterested(bookId, memberId, interested) {
  const result = interested
    ? await supabase.from('interests').insert({ book_id: bookId, member_id: memberId })
    : await supabase.from('interests').delete().eq('book_id', bookId).eq('member_id', memberId)
  unwrap(result, (error) => `Your interested list wasn't updated: ${error.message}`)
}

// ---------- Lending (librarian only) ----------

// Every member with whether they already have a book out, for the "Lend to" list.
export async function loadMembers() {
  const [members, loans] = await Promise.all([
    supabase.from('members').select('id, name, city').order('name'),
    supabase.from('loans').select('member_id').is('returned_on', null),
  ])
  const borrowing = new Set(unwrap(loans).map((l) => l.member_id))
  return unwrap(members).map((m) => ({ ...m, hasBook: borrowing.has(m.id) }))
}

// Everything the lending desk needs in one go.
export async function loadDesk() {
  const [copies, loans, reservations, members] = await Promise.all([
    supabase.from('copies').select('id, book_id, edition_note').order('id'),
    supabase
      .from('loans')
      .select('id, copy_id, member_id, lent_on, due_on, member:members(name, city)')
      .is('returned_on', null),
    supabase
      .from('reservations')
      .select('id, book_id, member_id, status, created_at, member:members(name, city)')
      .in('status', ['pending_approval', 'active'])
      .order('created_at'),
    loadMembers(),
  ])
  return { copies: unwrap(copies), loans: unwrap(loans), reservations: unwrap(reservations), members }
}

// Lends a copy (and closes the member's reservation for it, if they had one)
// in a single database step: see supabase/05_lending.sql.
export async function lendCopy(copyId, memberId, reservationId = null) {
  unwrap(
    await supabase.rpc('lend_copy', {
      p_copy_id: copyId,
      p_member_id: memberId,
      p_lent_on: localDate(),
      p_reservation_id: reservationId,
    }),
  )
}

export async function returnLoan(loanId) {
  unwrap(
    await supabase.from('loans').update({ returned_on: localDate() }).eq('id', loanId),
    (error) => `The return wasn't saved: ${error.message}`,
  )
}
