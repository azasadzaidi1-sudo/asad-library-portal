// The "Messages" button on a reservation or loan, on Borrowing lists and
// the lending desk, with the unread count. Nothing until a conversation
// exists (it opens when the reservation is confirmed).
export default function MessagesLink({ thread }) {
  if (!thread) return null
  return (
    <a className="button button-quiet button-small" href={`#messages/${thread.thread_id}`}>
      Messages
      {thread.unread > 0 && <span className="nav-count" aria-label={`${thread.unread} unread`}>{thread.unread}</span>}
    </a>
  )
}
