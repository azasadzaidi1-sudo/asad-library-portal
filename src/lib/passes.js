// Library passes: the words the Libraries page and the lending desk use.
// Pure helpers, no React or Supabase (tested in passes.test.js).
// See supabase/15_library_passes.sql for the rules themselves.

// How long the note after a "Not now" stays on a shelf's card.
export const DECLINE_NOTE_DAYS = 7

// "35 books", "35 books, 40 copies", "35 books, plus 5 for library pass
// holders", or for a shelf that's all Restricted: "5 books, all for
// library pass holders".
export function bookCountLine({ titles = 0, copies = 0, hidden_titles: hidden = 0 } = {}) {
  const books = (n) => (n === 1 ? '1 book' : `${n} books`)
  if (titles === 0 && hidden > 0) return `${books(hidden)}, all for library pass holders`
  const visible = copies > titles ? `${books(titles)}, ${copies} copies` : books(titles)
  return hidden > 0 ? `${visible}, plus ${hidden} for library pass holders` : visible
}

// After a "Not now" to a pass request. Asad's wording rule: warm, and
// without "you" or "your request". The second line depends on whether the
// shelf has books that can still be asked for one at a time.
export function passDeclineText(name, hasOpenBooks) {
  const first = `A library pass from ${name}'s shelf isn't on its way just yet.`
  return hasOpenBooks
    ? `${first} ${name}'s books can still be borrowed one request at a time.`
    : `${first} There are plenty of other shelves to wander through in the meantime.`
}

// After a librarian takes a pass back: said plainly (Asad), without a
// date, because it can't be asked for again.
export function passTakenBackText(name, hasOpenBooks) {
  const first = `${name} has taken back the library pass for this shelf.`
  return hasOpenBooks ? `${first} ${name}'s books can still be asked for one request at a time.` : first
}

// Where the signed-in member stands with one shelf, for its card on the
// Libraries page.
//   lib:   a row from libraries() (my_status, decided_at, ask_again_on, titles)
//   today: for working out whether the "Not now" note is still recent
// Returns { text, canAsk, pending, declined }:
//   canAsk   show "Ask for a library pass"
//   pending  they've asked; offer to withdraw
//   declined the text is the warm "Not now" note
//   takenBack the pass was taken back (no asking again)
export function passStanding(lib, today = new Date()) {
  const name = lib.name
  switch (lib.my_status) {
    case 'own':
      return { text: 'Other members borrow from here.', canAsk: false }
    case 'approved':
      return { text: 'You have a library pass: reserve from here without asking.', canAsk: false }
    case 'pending':
      return { text: `Your request for a library pass is with ${name}.`, canAsk: false, pending: true }
    case 'stopped':
      return { text: 'Not lending at the moment.', canAsk: false }
    case 'taken_back':
      return { text: passTakenBackText(name, lib.titles > 0), canAsk: false, takenBack: true }
    case 'declined': {
      const days = (today - new Date(lib.decided_at)) / (24 * 60 * 60 * 1000)
      if (lib.decided_at && days < DECLINE_NOTE_DAYS) {
        return { text: passDeclineText(name, lib.titles > 0), canAsk: false, declined: true }
      }
      if (lib.ask_again_on) {
        return {
          text: `A pass from ${name}'s shelf can be asked for again from ${longDate(lib.ask_again_on)}.`,
          canAsk: false,
        }
      }
      return noPass(lib)
    }
    default:
      return noPass(lib)
  }
}

function noPass(lib) {
  const text = lib.titles > 0
    ? `${lib.name} OKs each request. With a library pass, you'd reserve without asking.`
    : `${lib.name}'s shelf is open to library pass holders.`
  return { text, canAsk: true }
}

// "24 February 2027"
function longDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// The label for the optional note, on a book request or a pass request.
export function noteLabel(name, firstTime) {
  return firstTime ? `Remind ${name} how you know each other` : `Anything ${name} should know?`
}

// The Borrowers tab line under each person's name.
//   borrower: { status: 'pass' | 'taken_back' | 'borrower' | 'stopped', since, hasBook, loans }
export function borrowerLine({ status, since, hasBook, loans = 0 }, formatDate) {
  if (status === 'stopped') return 'You stopped lending to them.'
  const book = hasBook ? ' Has one of your books.' : ''
  if (status === 'pass') return `Library pass${since ? ` since ${formatDate(since)}` : ''}.${book}`
  if (status === 'taken_back') {
    return `You took back their library pass${since ? ` on ${formatDate(since)}` : ''}.${book}`
  }
  const times = loans === 1 ? 'once' : `${loans} times`
  return `Borrowed from you ${times}, no library pass.${book}`
}
