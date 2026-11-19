import { useCallback, useEffect, useMemo, useState } from 'react'
import { sortByFilingTitle } from './catalogue'
import {
  loadApprovalRequests,
  loadAvailability,
  loadBooks,
  loadMyCard,
  loadMyInterests,
} from './library'

// Everything both pages need, loaded once and refreshed after each action
// (reserving, cancelling, approving, marking as interested).
export function useLibrary(member) {
  const isLibrarian = member.role === 'librarian'
  const [books, setBooks] = useState(null)
  const [availability, setAvailability] = useState(new Map())
  const [myCard, setMyCard] = useState({ reservation: null, loan: null, declined: [] })
  const [interests, setInterests] = useState(new Set())
  const [approvals, setApprovals] = useState([])
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [counts, card, mine, requests] = await Promise.all([
        loadAvailability(),
        loadMyCard(member.id),
        loadMyInterests(member.id),
        isLibrarian ? loadApprovalRequests() : [],
      ])
      setAvailability(counts)
      setMyCard(card)
      setInterests(mine)
      setApprovals(requests)
    } catch (e) {
      setError(e.message)
    }
  }, [member.id, isLibrarian])

  useEffect(() => {
    loadBooks()
      .then((rows) => setBooks(sortByFilingTitle(rows)))
      .catch((e) => setError(e.message))
    refresh()
  }, [refresh])

  const booksById = useMemo(() => new Map((books ?? []).map((b) => [b.id, b])), [books])

  return { books, booksById, availability, myCard, interests, approvals, error, refresh, isLibrarian }
}
