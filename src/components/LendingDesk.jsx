import { useCallback, useEffect, useMemo, useState } from 'react'
import { filterBooks, formatDate, ordinal } from '../lib/catalogue'
import { buildDesk, daysBetween, localDate } from '../lib/desk'
import { cancelReservation, decideBorrower, lendCopy, loadDesk, returnLoan, stopLending } from '../lib/library'
import ApprovalBox from './ApprovalBox'
import ConfirmButton from './ConfirmButton'
import Cover from './Cover'
import LendControls, { copyName } from './LendControls'
import ReturnButton from './ReturnButton'

const TABS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'reserved', label: 'Reserved' },
  { key: 'lentOut', label: 'Lent out' },
  { key: 'available', label: 'Available' },
  { key: 'borrowers', label: 'Borrowers' },
]

// The librarian's page: every copy on their own shelf that's overdue,
// reserved, lent out or free, plus the people they lend to.
export default function LendingDesk({ library, onOpenBook }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState(null)
  const [query, setQuery] = useState('')

  const reload = useCallback(async () => {
    try {
      setData(await loadDesk(library.memberId))
    } catch (e) {
      setError(e.message)
    }
  }, [library.memberId])

  useEffect(() => {
    reload()
  }, [reload])

  const desk = useMemo(
    () => data && { ...buildDesk({ books: library.books, ...data, today: localDate() }), borrowers: data.borrowers },
    [data, library.books],
  )

  if (error && !data) return <p className="status-page" role="alert">The lending desk couldn't load: {error}</p>
  if (!desk) return <p className="status-page">Opening the ledger…</p>

  // Open on the first group that needs attention.
  const current = tab ?? (TABS.slice(0, 3).find((t) => desk[t.key].length > 0)?.key || 'available')

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      await Promise.all([reload(), library.refresh()])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const today = localDate()
  const availableShown = query
    ? desk.available.filter((e) => filterBooks([e.book], { query }).length > 0)
    : desk.available

  return (
    <div className="desk">
      <h1 className="page-title">Lending desk</h1>
      <ApprovalBox library={{ ...library, refresh: async () => { await Promise.all([reload(), library.refresh()]) } }}
        onOpenBook={onOpenBook} />

      <div className="tabs" role="tablist" aria-label="Groups">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" id={`tab-${t.key}`}
            aria-selected={current === t.key} aria-controls={`panel-${t.key}`}
            className={`tab${t.key === 'overdue' && desk.overdue.length ? ' tab-alert' : ''}`}
            onClick={() => {
              setTab(t.key)
              setError('')
            }}>
            {t.label} <span className="tab-count">{desk[t.key].length}</span>
          </button>
        ))}
      </div>

      {error && <p className="form-error desk-error" role="alert">{error}</p>}

      <section className="desk-panel" role="tabpanel" id={`panel-${current}`} aria-labelledby={`tab-${current}`}>
        {(current === 'overdue' || current === 'lentOut') && (
          desk[current].length === 0 ? (
            <p className="shelf-empty">
              {current === 'overdue' ? 'Nothing is overdue.' : 'No books are lent out right now.'}
            </p>
          ) : (
            desk[current].map(({ loan, copy, book, daysLate }) => (
              <DeskRow key={loan.id} book={book} onOpenBook={onOpenBook}>
                <p>{copyName(copy)}</p>
                <p>With {library.personName(loan.member_id)} since {formatDate(loan.lent_on)}</p>
                <p className={daysLate > 0 ? 'overdue' : undefined}>
                  Due {formatDate(loan.due_on)}
                  {daysLate > 0 && `, ${daysLate} ${daysLate === 1 ? 'day' : 'days'} overdue`}
                </p>
                <ReturnButton busy={busy} onReturn={() => run(() => returnLoan(loan.id))} />
              </DeskRow>
            ))
          )
        )}

        {current === 'reserved' && (
          desk.reserved.length === 0 ? (
            <p className="shelf-empty">No one has reserved a book.</p>
          ) : (
            desk.reserved.map(({ reservation, book, place, state, onShelf }) => {
              const waited = daysBetween(localDate(new Date(reservation.created_at)), today)
              return (
                <DeskRow key={reservation.id} book={book} onOpenBook={onOpenBook}>
                  <p>
                    {library.personName(reservation.member_id)}, {ordinal(place)} in the queue since{' '}
                    {formatDate(reservation.created_at)}
                    {waited > 0 && ` (${waited} ${waited === 1 ? 'day' : 'days'})`}
                  </p>
                  {state === 'ready' && (
                    <>
                      <p className="status-available">A copy is on the shelf for them.</p>
                      <LendControls copies={onShelf} member={{ id: reservation.member_id, name: library.people.get(reservation.member_id) }}
                        busy={busy}
                        onLend={(copyId, memberId) => run(() => lendCopy(copyId, memberId, reservation.id))} />
                    </>
                  )}
                  {state === 'approval' && (
                    <p>Waiting for your approval: see the top of this page.</p>
                  )}
                  {state === 'waiting' && <p className="shelf-empty">Waiting: every copy is out or promised to someone earlier.</p>}
                  {state !== 'approval' && (
                    <button type="button" className="link-button desk-cancel" disabled={busy}
                      onClick={() => run(() => cancelReservation(reservation.id))}>
                      Cancel this reservation
                    </button>
                  )}
                </DeskRow>
              )
            })
          )
        )}

        {current === 'borrowers' && (
          desk.borrowers.length === 0 ? (
            <p className="shelf-empty">No one borrows from your shelf yet.</p>
          ) : (
            <ul className="borrower-list">
              {desk.borrowers.map((b) => (
                <li key={b.id} className="borrower">
                  <div>
                    <p className="borrower-name">{b.name || 'A new member (no name yet)'}</p>
                    <p className="borrower-meta">
                      {b.status === 'stopped'
                        ? 'You stopped lending to them.'
                        : `Approved${b.since ? ` on ${formatDate(b.since)}` : ''}${b.hasBook ? '. Has one of your books.' : '.'}`}
                    </p>
                  </div>
                  {b.status === 'stopped' ? (
                    <button type="button" className="button button-quiet" disabled={busy}
                      onClick={() => run(() => decideBorrower(b.id, true))}>
                      Lend again
                    </button>
                  ) : (
                    <ConfirmButton label="Stop lending" busy={busy} className="link-button"
                      question={`Stop lending to ${b.name}? Their reservation here is cancelled; a book they have comes back as normal.`}
                      confirmLabel="Stop lending" onConfirm={() => run(() => stopLending(b.id))} />
                  )}
                </li>
              ))}
            </ul>
          )
        )}

        {current === 'available' && (
          <>
            <label className="desk-search">
              Find a book to lend
              <input type="search" placeholder="Title, author or series" value={query}
                onChange={(e) => setQuery(e.target.value)} />
            </label>
            {availableShown.length === 0 && <p className="shelf-empty">No free copies match.</p>}
            {availableShown.map(({ book, onShelf, unclaimed, total }) => (
              <DeskRow key={book.id} book={book} onOpenBook={onOpenBook}>
                <p>{total === 1 ? 'On the shelf' : `${unclaimed} of ${total} free`}</p>
                <LendControls copies={onShelf.slice(0, Math.max(unclaimed, 1))} members={data.members} busy={busy}
                  onLend={(copyId, memberId) => run(() => lendCopy(copyId, memberId))} />
              </DeskRow>
            ))}
          </>
        )}
      </section>
    </div>
  )
}

function DeskRow({ book, onOpenBook, children }) {
  if (!book) return null
  return (
    <article className="book-row desk-row">
      <Cover book={book} className="row-cover" />
      <div className="book-row-text">
        <h2 className="row-title">
          <button type="button" className="link-button" aria-haspopup="dialog" onClick={() => onOpenBook(book.id)}>
            {book.title}
          </button>
        </h2>
        <p className="card-author">{book.author}</p>
        <div className="row-detail">{children}</div>
      </div>
    </article>
  )
}
