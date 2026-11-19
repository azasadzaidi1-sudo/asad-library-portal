// The librarian's lending desk, worked out from the raw lists.
// Nothing here is stored: every group is computed from copies, open loans
// and open reservations, so it can never fall out of step with them.

// Today's date in the visitor's own time zone, as YYYY-MM-DD.
export function localDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Whole days from date a to date b (both YYYY-MM-DD).
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)
}

// books:        all books (already in filing order)
// copies:       [{ id, book_id, edition_note }]
// loans:        open loans [{ id, copy_id, member_id, lent_on, due_on, member }]
// reservations: open reservations, oldest first [{ id, book_id, member_id, status, created_at, member }]
export function buildDesk({ books, copies, loans, reservations, today = localDate() }) {
  const loanByCopy = new Map(loans.map((loan) => [loan.copy_id, loan]))
  // Number each book's copies 1, 2, ... in the order they were added.
  const numbered = copies.map((c) => ({ ...c }))
  const copiesByBook = groupBy(numbered, (c) => c.book_id)
  for (const list of copiesByBook.values()) list.forEach((c, i) => (c.number = i + 1))
  const queueByBook = groupBy(reservations, (r) => r.book_id)
  const bookById = new Map(books.map((b) => [b.id, b]))

  const overdue = []
  const lentOut = []
  for (const loan of loans) {
    const copy = numbered.find((c) => c.id === loan.copy_id)
    const book = bookById.get(copy?.book_id)
    const daysLate = daysBetween(loan.due_on, today)
    const entry = { loan, copy, book, daysLate }
    ;(daysLate > 0 ? overdue : lentOut).push(entry)
  }
  overdue.sort((a, b) => a.loan.due_on.localeCompare(b.loan.due_on))
  lentOut.sort((a, b) => a.loan.due_on.localeCompare(b.loan.due_on))

  // Walk each book's queue in order: each reservation claims a copy that's
  // on the shelf until there are none left; the rest wait.
  const reserved = []
  const available = []
  for (const book of books) {
    const bookCopies = copiesByBook.get(book.id) ?? []
    const onShelf = bookCopies.filter((c) => !loanByCopy.has(c.id))
    const queue = queueByBook.get(book.id) ?? []
    let free = onShelf.length
    queue.forEach((reservation, i) => {
      const claimsCopy = free > 0
      if (claimsCopy) free -= 1
      const state = reservation.status === 'pending_approval' ? 'approval' : claimsCopy ? 'ready' : 'waiting'
      reserved.push({ reservation, book, place: i + 1, state, onShelf })
    })
    if (free > 0) {
      available.push({ book, onShelf, unclaimed: free, total: bookCopies.length })
    }
  }
  const order = { ready: 0, approval: 1, waiting: 2 }
  reserved.sort((a, b) =>
    order[a.state] - order[b.state] || a.reservation.created_at.localeCompare(b.reservation.created_at),
  )

  return { overdue, reserved, lentOut, available }
}

function groupBy(items, keyOf) {
  const groups = new Map()
  for (const item of items) {
    const key = keyOf(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return groups
}
