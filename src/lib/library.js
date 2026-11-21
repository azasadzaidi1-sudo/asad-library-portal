// Every conversation with the database lives here, so the screens only
// deal with plain data and friendly error messages.
import { supabase } from '../supabaseClient'
import { localDate } from './desk'
import { attachAuthors } from './reviews'

const BOOK_COLUMNS =
  'id, title, author, series, genre, year_published, language, goodreads_rating, prizes, cover_id, description, ol_work_key'

// Supabase answers { data, error }; turn an error into a thrown Error.
function unwrap({ data, error }, friendly) {
  if (error) throw new Error(friendly?.(error) ?? error.message)
  return data
}

export async function loadBooks() {
  return unwrap(await supabase.from('books').select(BOOK_COLUMNS).limit(1000))
}

// Every library (anyone with a copy on the shelf): name, city, how many
// titles, and where the signed-in member stands with that librarian.
export async function loadLibraries() {
  return unwrap(await supabase.rpc('libraries'))
}

// Map of book id -> [{ owner_id, copies_total, copies_out, waiting }], one entry per library.
export async function loadAvailability() {
  const rows = unwrap(await supabase.rpc('library_availability'))
  const byBook = new Map()
  for (const row of rows) {
    if (!byBook.has(row.book_id)) byBook.set(row.book_id, [])
    byBook.get(row.book_id).push(row)
  }
  return byBook
}

// Map of book id -> Map of owner id -> reason, for every librarian's Restricted Section.
export async function loadRestricted() {
  const rows = unwrap(await supabase.from('restricted_titles').select('owner_id, book_id, reason'))
  const byBook = new Map()
  for (const row of rows) {
    if (!byBook.has(row.book_id)) byBook.set(row.book_id, new Map())
    byBook.get(row.book_id).set(row.owner_id, row.reason)
  }
  return byBook
}

// What the signed-in member has going on: open reservations (at most one
// per library, each with its place in that library's queue), books on
// loan (at most one per library), and requests declined this week.
export async function loadMyCard(memberId) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [reservations, loans, declined] = await Promise.all([
    supabase.rpc('my_open_reservations'),
    supabase
      .from('loans')
      .select('id, due_on, owner_id, copy:copies(book_id)')
      .eq('member_id', memberId)
      .is('returned_on', null)
      .order('due_on'),
    supabase
      .from('reservations')
      .select('id, book_id, owner_id, decided_at')
      .eq('member_id', memberId)
      .eq('status', 'declined')
      .gte('decided_at', weekAgo)
      .order('decided_at', { ascending: false }),
  ])
  return {
    reservations: unwrap(reservations),
    loans: unwrap(loans).map((l) => ({ id: l.id, due_on: l.due_on, owner_id: l.owner_id, book_id: l.copy.book_id })),
    declined: unwrap(declined),
  }
}

// Reserve a title from one library. A first request to a librarian can
// carry a note ("Remind Mira how you know each other").
export async function requestBook(bookId, ownerId, note = '') {
  unwrap(
    await supabase.rpc('request_book', { p_book_id: bookId, p_owner_id: ownerId, p_note: note || null }),
    (error) =>
      error.code === '23505'
        ? 'You already have a reservation open on this shelf. Cancel it before reserving another book from it.'
        : `The reservation didn't go through: ${error.message}`,
  )
}

export async function cancelReservation(reservationId) {
  unwrap(
    await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', reservationId),
    (error) => `The reservation wasn't cancelled: ${error.message}`,
  )
}

// ---------- Librarians (the database only shows your own shelf) ----------

// Map of member id -> name, for everyone connected to the signed-in
// librarian's shelf. Members can't read each other's profiles, so names
// come from library_people() in supabase/08_multiple_libraries.sql.
export async function loadPeople() {
  const rows = unwrap(await supabase.rpc('library_people'))
  return new Map(rows.map((row) => [row.member_id, row.name]))
}

// What's waiting for the signed-in librarian's OK: first-time borrowers
// (with everything the request card shows) and Restricted Section requests
// from people they've already approved.
export async function loadApprovalRequests(ownerId) {
  const [newBorrowers, pending] = await Promise.all([
    supabase.rpc('borrower_requests'),
    supabase
      .from('reservations')
      .select('id, book_id, member_id, created_at')
      .eq('owner_id', ownerId)
      .eq('status', 'pending_approval')
      .order('created_at'),
  ])
  const firstTimers = unwrap(newBorrowers)
  const waitingAsNew = new Set(firstTimers.map((b) => b.borrower_id))
  return {
    newBorrowers: firstTimers,
    restricted: unwrap(pending).filter((r) => !waitingAsNew.has(r.member_id)),
  }
}

export async function decideBorrower(borrowerId, approve) {
  unwrap(
    await supabase.rpc('decide_borrower', { p_borrower_id: borrowerId, p_approve: approve }),
    (error) => `That decision wasn't saved: ${error.message}`,
  )
}

export async function stopLending(borrowerId) {
  unwrap(
    await supabase.rpc('stop_lending', { p_borrower_id: borrowerId }),
    (error) => `That wasn't saved: ${error.message}`,
  )
}

// Restricted Section requests: approve (into the queue) or decline.
export async function decideRequest(reservationId, approve) {
  unwrap(
    await supabase
      .from('reservations')
      .update({ status: approve ? 'active' : 'declined' })
      .eq('id', reservationId),
    (error) => `That decision wasn't saved: ${error.message}`,
  )
}

// The signed-in librarian's borrowers: approved ones (with whether they
// have a book from this shelf) and anyone they've stopped lending to.
export async function loadMyBorrowers() {
  const rows = unwrap(await supabase.rpc('my_borrowers'))
  return rows.map((row) => ({ id: row.borrower_id, name: row.name, status: row.status, since: row.since, hasBook: row.has_my_book }))
}

// For one title on the signed-in librarian's shelf: their copies with who
// has each one, their queue, who's interested, and (for the admin) the
// reading tracker.
export async function loadLibrarianDetails(bookId, ownerId) {
  const copies = unwrap(
    await supabase.from('copies').select('id, edition_note').eq('book_id', bookId).eq('owner_id', ownerId).order('id'),
  )
  const [loans, queue, reading, interested, borrowers] = await Promise.all([
    supabase
      .from('loans')
      .select('id, copy_id, member_id, lent_on, due_on')
      .is('returned_on', null)
      .in('copy_id', copies.map((c) => c.id)),
    supabase
      .from('reservations')
      .select('id, status, created_at, member_id')
      .eq('book_id', bookId)
      .eq('owner_id', ownerId)
      .in('status', ['pending_approval', 'active'])
      .order('created_at'),
    supabase.from('reading_status').select('status').eq('book_id', bookId).maybeSingle(),
    supabase.from('interests').select('created_at, member_id').eq('book_id', bookId).order('created_at'),
    loadMyBorrowers(),
  ])
  const loansByCopy = new Map(unwrap(loans).map((loan) => [loan.copy_id, loan]))
  return {
    copies: copies.map((copy) => ({ ...copy, loan: loansByCopy.get(copy.id) ?? null })),
    queue: unwrap(queue),
    readingStatus: unwrap(reading)?.status ?? 'unread',
    interested: unwrap(interested),
    members: borrowers.filter((b) => b.status === 'approved'),
  }
}

export async function saveReadingStatus(bookId, status) {
  unwrap(
    await supabase.from('reading_status').upsert({ book_id: bookId, status }),
    (error) => `Your reading status wasn't saved: ${error.message}`,
  )
}

// Put one of your titles in your Restricted Section (with a reason shown
// to members), or take it out again (reason = null).
export async function setRestricted(bookId, ownerId, reason) {
  const friendly = (error) => `The Restricted Section wasn't updated: ${error.message}`
  const mine = () => supabase.from('restricted_titles')
  if (!reason) {
    unwrap(await mine().delete().eq('book_id', bookId).eq('owner_id', ownerId), friendly)
    return
  }
  // Change the reason if the title is already restricted, otherwise add it.
  const changed = unwrap(
    await mine().update({ reason }).eq('book_id', bookId).eq('owner_id', ownerId).select('book_id'),
    friendly,
  )
  if (changed.length === 0) {
    unwrap(await mine().insert({ book_id: bookId, owner_id: ownerId, reason }), friendly)
  }
}

// ---------- Interested list (seen by the member and librarians with a copy) ----------

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

// ---------- Lending (your own shelf) ----------

// Everything the lending desk needs in one go, for the signed-in librarian's shelf.
export async function loadDesk(ownerId) {
  const [copies, loans, reservations, borrowers] = await Promise.all([
    supabase.from('copies').select('id, book_id, edition_note').eq('owner_id', ownerId).order('id'),
    supabase
      .from('loans')
      .select('id, copy_id, member_id, lent_on, due_on')
      .eq('owner_id', ownerId)
      .is('returned_on', null),
    supabase
      .from('reservations')
      .select('id, book_id, member_id, status, created_at')
      .eq('owner_id', ownerId)
      .in('status', ['pending_approval', 'active'])
      .order('created_at'),
    loadMyBorrowers(),
  ])
  return {
    copies: unwrap(copies),
    loans: unwrap(loans),
    reservations: unwrap(reservations),
    borrowers,
    members: borrowers.filter((b) => b.status === 'approved'),
  }
}

// Lends a copy (and closes the member's reservation for it, if they had one)
// in a single database step: see lend_copy() in supabase/08_multiple_libraries.sql.
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

// ---------- Adding and removing books (your own shelf) ----------

// Adds a copy to your shelf, and the book to the catalogue if it's new.
// Returns the book's id. See add_book() in supabase/09_add_books.sql.
export async function addBook(book, editionNote = '') {
  return unwrap(
    await supabase.rpc('add_book', {
      p_title: book.title,
      p_author: book.author,
      p_genre: book.genre,
      p_language: book.language,
      p_year: book.year || null,
      p_description: book.description || null,
      p_cover_id: book.coverId || null,
      p_ol_work_key: book.workKey || null,
      p_prizes: book.prizes ?? [],
      p_edition_note: editionNote || null,
    }),
    (error) => `The book wasn't added: ${error.message}`,
  )
}

// Adds your copy of a title that's already in the catalogue.
export async function addCopy(bookId, editionNote = '') {
  unwrap(
    await supabase.from('copies').insert({ book_id: bookId, edition_note: editionNote || null }),
    (error) => `Your copy wasn't added: ${error.message}`,
  )
}

export async function removeCopy(copyId) {
  unwrap(
    await supabase.rpc('remove_copy', { p_copy_id: copyId }),
    (error) => `The copy wasn't removed: ${error.message}`,
  )
}

// ---------- Reviews and replies ----------

// All reviews of a book (newest first) with their replies (oldest first),
// plus each author's name and whether they've borrowed the book.
export async function loadDiscussion(bookId) {
  const [reviews, people] = await Promise.all([
    supabase
      .from('reviews')
      .select('id, member_id, body, has_spoilers, created_at, edited_at, replies:review_replies(id, member_id, body, created_at, edited_at)')
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .order('created_at', { referencedTable: 'replies', ascending: true }),
    supabase.rpc('book_discussion_people', { p_book_id: bookId }),
  ])
  return attachAuthors(unwrap(reviews), unwrap(people))
}

const duplicateReview = (error) =>
  error.code === '23505'
    ? "You've already reviewed this book. Edit your review instead."
    : `Your review wasn't saved: ${error.message}`

export async function postReview(bookId, memberId, body, hasSpoilers) {
  unwrap(
    await supabase
      .from('reviews')
      .insert({ book_id: bookId, member_id: memberId, body: body.trim(), has_spoilers: hasSpoilers }),
    duplicateReview,
  )
}

export async function updateReview(reviewId, body, hasSpoilers) {
  unwrap(
    await supabase.from('reviews').update({ body: body.trim(), has_spoilers: hasSpoilers }).eq('id', reviewId),
    (error) => `Your changes weren't saved: ${error.message}`,
  )
}

export async function deleteReview(reviewId) {
  unwrap(
    await supabase.from('reviews').delete().eq('id', reviewId),
    (error) => `The review wasn't deleted: ${error.message}`,
  )
}

export async function postReply(reviewId, memberId, body) {
  unwrap(
    await supabase.from('review_replies').insert({ review_id: reviewId, member_id: memberId, body: body.trim() }),
    (error) => `Your reply wasn't posted: ${error.message}`,
  )
}

export async function updateReply(replyId, body) {
  unwrap(
    await supabase.from('review_replies').update({ body: body.trim() }).eq('id', replyId),
    (error) => `Your changes weren't saved: ${error.message}`,
  )
}

export async function deleteReply(replyId) {
  unwrap(
    await supabase.from('review_replies').delete().eq('id', replyId),
    (error) => `The reply wasn't deleted: ${error.message}`,
  )
}
