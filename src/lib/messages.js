// Loan messages: the words around a conversation. Pure helpers, no React or
// Supabase (tested in messages.test.js). The rules themselves (when a
// conversation opens, turns read-only and is deleted) are in
// supabase/16_loan_messages.sql.

export const MESSAGE_MAX = 1000

// The other person in a conversation, or "Former member" once they've
// deleted their account.
export function otherLabel(thread) {
  return thread.other_name || 'Former member'
}

// Who wrote a message, as the conversation shows it.
export function senderLabel(message, myId, thread) {
  if (message.sender_id === myId) return 'You'
  return message.sender_id ? otherLabel(thread) : 'Former member'
}

// The line under each conversation in the list.
//   thread: a row from my_threads()
export function stageLine(thread, formatDate) {
  switch (thread.stage) {
    case 'requested':
      return thread.role === 'librarian' ? 'Reserved from your shelf' : 'Reserved'
    case 'lent':
      return `Lent, due back ${formatDate(thread.due_on)}`
    case 'returned':
      return `Returned. Open until ${formatDate(thread.read_only_from)}`
    default:
      return `Read-only. Deleted on ${formatDate(thread.delete_after)}`
  }
}

// What the top of every conversation says: who can read it, and when it
// turns read-only and is deleted (Asad: both people are told at the start).
export function threadNotice(thread, formatDate) {
  const who =
    `Just between you and ${otherLabel(thread)}. The Common Shelf's admin reads messages only if one of you asks ` +
    'for help.'
  let when
  if (thread.stage === 'closed') {
    when = `This conversation is read-only now, and will be deleted on ${formatDate(thread.delete_after)}.`
  } else if (thread.stage === 'returned') {
    when =
      `The book is back, so this conversation stays open until ${formatDate(thread.read_only_from)}, then it's ` +
      `read-only, and deleted on ${formatDate(thread.delete_after)}.`
  } else {
    when =
      "It stays open while the book is out and for a week after it's back. Then it's read-only for a month, and " +
      'deleted. If the reservation is cancelled before lending, it turns read-only straight away.'
  }
  return `${who} ${when}`
}

// Total unread messages across conversations, for the menu.
export function unreadTotal(threads = []) {
  return threads.reduce((sum, t) => sum + (t.unread ?? 0), 0)
}

// "1,000 characters left" style counter, only shown near the limit.
export function charactersLeft(text) {
  const left = MESSAGE_MAX - text.length
  return left <= 100 ? `${left} ${left === 1 ? 'character' : 'characters'} left` : ''
}
