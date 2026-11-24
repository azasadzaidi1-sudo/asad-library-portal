import { useCallback, useEffect, useMemo, useState } from 'react'
import { sortByFilingTitle } from './catalogue'
import { unreadTotal } from './messages'
import {
  loadApprovalRequests,
  loadAvailability,
  loadBooks,
  loadLibraries,
  loadMyCard,
  loadMyInterests,
  loadPeople,
  loadRestricted,
  loadThreads,
  watchMessages,
} from './library'

const NO_APPROVALS = { requests: [], passRequests: [], restricted: [], passQuestions: [] }

// Everything the pages need, loaded once and refreshed after each action
// (reserving, cancelling, approving, marking as interested).
export function useLibrary(member) {
  const [books, setBooks] = useState(null)
  const [libraries, setLibraries] = useState([])
  const [availability, setAvailability] = useState(new Map())
  const [restricted, setRestricted] = useState(new Map())
  const [myCard, setMyCard] = useState({ reservations: [], loans: [], declined: [] })
  const [interests, setInterests] = useState(new Set())
  const [approvals, setApprovals] = useState(NO_APPROVALS)
  const [people, setPeople] = useState(new Map())
  const [threads, setThreads] = useState([])
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      // For someone without a shelf, the librarian lists simply come back empty.
      const [rows, libs, counts, restrictedTitles, card, mine, requests, names, conversations] = await Promise.all([
        loadBooks(),
        loadLibraries(),
        loadAvailability(),
        loadRestricted(),
        loadMyCard(member.id),
        loadMyInterests(member.id),
        loadApprovalRequests(member.id),
        loadPeople(),
        loadThreads(),
      ])
      setBooks(sortByFilingTitle(rows))
      setLibraries(libs)
      setAvailability(counts)
      setRestricted(restrictedTitles)
      setMyCard(card)
      setInterests(mine)
      setApprovals(requests)
      setPeople(names)
      setThreads(conversations)
    } catch (e) {
      setError(e.message)
    }
  }, [member.id])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Conversations change more often than the rest (every message), so they
  // reload on their own, whenever a message arrives or is deleted.
  const refreshThreads = useCallback(async () => {
    try {
      setThreads(await loadThreads())
    } catch (e) {
      console.warn('Conversations could not reload:', e.message)
    }
  }, [])

  useEffect(() => watchMessages(() => refreshThreads()), [refreshThreads])

  const booksById = useMemo(() => new Map((books ?? []).map((b) => [b.id, b])), [books])
  const librariesById = useMemo(() => new Map(libraries.map((l) => [l.owner_id, l])), [libraries])
  const ownersByBook = useMemo(
    () => new Map([...availability].map(([bookId, rows]) => [bookId, rows.map((r) => r.owner_id)])),
    [availability],
  )

  // A librarian is anyone with at least one copy on their own shelf.
  const isLibrarian = libraries.some((l) => l.is_me)
  const ownerName = useCallback((ownerId) => librariesById.get(ownerId)?.name ?? 'the librarian', [librariesById])
  const personName = useCallback((memberId) => people.get(memberId) || 'A new member (no name yet)', [people])
  // The conversation about a reservation or a loan, if there is one.
  const threadFor = useCallback(
    ({ reservationId, loanId }) =>
      threads.find((t) => (loanId && t.loan_id === loanId) || (reservationId && t.reservation_id === reservationId)),
    [threads],
  )

  return {
    books,
    booksById,
    libraries,
    librariesById,
    availability,
    ownersByBook,
    restricted,
    myCard,
    interests,
    approvals,
    people,
    threads,
    unread: unreadTotal(threads),
    threadFor,
    refreshThreads,
    ownerName,
    personName,
    error,
    refresh,
    isLibrarian,
    isAdmin: Boolean(member.is_admin),
    memberId: member.id,
  }
}
