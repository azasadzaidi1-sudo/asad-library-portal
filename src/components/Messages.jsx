import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate } from '../lib/catalogue'
import { deleteMessage, loadMessages, markThreadRead, sendMessage, watchMessages } from '../lib/library'
import {
  charactersLeft,
  MESSAGE_MAX,
  otherLabel,
  senderLabel,
  stageLine,
  threadNotice,
} from '../lib/messages'
import ConfirmButton from './ConfirmButton'
import Cover from './Cover'

// Loan messages: one conversation per reservation or loan, between the
// borrower and the librarian. #messages lists them; #messages/42 opens one.
export default function Messages({ library, member, threadId }) {
  const thread = threadId ? library.threads.find((t) => t.thread_id === threadId) : null
  if (threadId && thread) return <Conversation thread={thread} library={library} member={member} />
  return (
    <div className="messages">
      <h1 className="page-title">Messages</h1>
      {threadId && <p className="form-error" role="alert">That conversation isn't there any more.</p>}
      <p className="page-lede">
        A conversation opens for each confirmed reservation or loan, between the borrower and the librarian:
        for arranging the pick-up, questions about the book, or a late return.
      </p>
      <p className="shelf-note">
        To hear when a message arrives, turn on notifications in <a href="#account">your account</a>.
      </p>
      {library.threads.length === 0 ? (
        <p className="shelf-empty">No conversations yet. One opens when a reservation is confirmed.</p>
      ) : (
        <ul className="thread-list">
          {library.threads.map((t) => {
            const book = library.booksById.get(t.book_id) ?? { title: t.title }
            return (
              <li key={t.thread_id}>
                <a className={`thread-row${t.unread > 0 ? ' thread-unread' : ''}`} href={`#messages/${t.thread_id}`}>
                  <Cover book={book} className="thread-cover" />
                  <span className="thread-text">
                    <span className="thread-title">{t.title}</span>
                    <span className="thread-with">{withLine(t)}</span>
                    <span className="thread-stage">{stageLine(t, formatDate)}</span>
                  </span>
                  {t.unread > 0 && <span className="nav-count thread-count">{t.unread}</span>}
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Conversation({ thread, library, member }) {
  const [messages, setMessages] = useState(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)
  const threadId = thread.thread_id
  const open = thread.stage !== 'closed'
  const { refreshThreads } = library

  const reload = useCallback(async () => {
    try {
      setMessages(await loadMessages(threadId))
      await markThreadRead(threadId)
      await refreshThreads()
    } catch (e) {
      setError(e.message)
    }
  }, [threadId, refreshThreads])

  // Load, then keep up with new and deleted messages while it's open.
  useEffect(() => {
    reload()
    return watchMessages(() => reload(), threadId)
  }, [reload, threadId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages?.length])

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      await reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const book = library.booksById.get(thread.book_id) ?? { title: thread.title }

  return (
    <div className="conversation">
      <p><a href="#messages" className="back-link">All messages</a></p>
      <div className="conversation-head">
        <Cover book={book} className="thread-cover" />
        <div>
          <h1 className="page-title conversation-title">{thread.title}</h1>
          <p className="thread-with">{withLine(thread)}. {stageLine(thread, formatDate)}</p>
        </div>
      </div>

      <p className="conversation-notice">{threadNotice(thread, formatDate)}</p>

      {messages === null ? (
        <p className="shelf-empty">Opening the conversation…</p>
      ) : (
        <ol className="message-list" aria-label="Messages">
          {messages.length === 0 && <li className="shelf-empty">No messages yet.</li>}
          {messages.map((m) => {
            if (m.kind === 'event') {
              return <li key={m.id} className="message-event">{m.body}</li>
            }
            const mine = m.sender_id === member.id
            return (
              <li key={m.id} className={`message${mine ? ' message-mine' : ''}`}>
                <p className="message-meta">
                  {senderLabel(m, member.id, thread)}, {formatTime(m.created_at)}
                </p>
                {m.deleted_at ? (
                  <p className="message-body message-deleted">Message deleted</p>
                ) : (
                  <p className="message-body">{m.body}</p>
                )}
                {mine && !m.deleted_at && (
                  <ConfirmButton label="Delete" busy={busy} className="link-button message-delete"
                    question="Delete this message?" confirmLabel="Delete"
                    onConfirm={() => run(() => deleteMessage(m.id))} />
                )}
              </li>
            )
          })}
        </ol>
      )}
      <div ref={endRef} />

      {open ? (
        <form className="message-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) return
            run(async () => {
              await sendMessage(threadId, draft)
              setDraft('')
            })
          }}>
          <label>
            <span className="visually-hidden">Your message to {otherLabel(thread)}</span>
            <textarea rows={3} maxLength={MESSAGE_MAX} value={draft} placeholder={`Write to ${otherLabel(thread)}`}
              onChange={(e) => setDraft(e.target.value)} />
          </label>
          <div className="form-actions">
            <button type="submit" className="button" disabled={busy || !draft.trim()}>Send</button>
            <span className="message-left" aria-live="polite">{charactersLeft(draft)}</span>
          </div>
        </form>
      ) : (
        <p className="shelf-note">This conversation is read-only now.</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}

// "Lena, borrowing from your shelf" or "Mira's shelf"
function withLine(thread) {
  return thread.role === 'librarian'
    ? `${otherLabel(thread)}, borrowing from your shelf`
    : `${otherLabel(thread)}'s shelf`
}

// "3 Dec 2026, 18:05"
function formatTime(value) {
  const d = new Date(value)
  return `${formatDate(d)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}
