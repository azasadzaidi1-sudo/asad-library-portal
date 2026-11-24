// The house rules and the privacy notice: their current versions, plus small
// helpers kept apart from the screens so they're easy to test.

// Raise RULES_VERSION when the house rules change in a way that matters:
// everyone is then asked to accept them again at their next visit.
export const RULES_VERSION = 1
export const RULES_UPDATED = '24 November 2026'
export const PRIVACY_UPDATED = '24 November 2026'

// What a member types to confirm deleting their account.
export const DELETE_WORD = 'DELETE'

// The columns the app reads about the signed-in member.
export const MEMBER_COLUMNS = 'id, name, city, is_admin, created_at, rules_version, rules_accepted_at'

export function needsToAcceptRules(member) {
  return (member?.rules_version ?? 0) < RULES_VERSION
}

export function deleteWordMatches(typed) {
  return typed.trim().toUpperCase() === DELETE_WORD
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Why the account can't be deleted right now, or '' when nothing stands in
// the way. `borrowed` and `lent` come from deletion_blockers().
export function deletionBlockedReason({ borrowed = 0, lent = 0 } = {}, isAdmin = false) {
  if (isAdmin) return "The admin account can't be deleted from the app."
  const reasons = []
  if (borrowed > 0) reasons.push(`you still have ${plural(borrowed, 'borrowed book', 'borrowed books')} to return`)
  if (lent > 0) reasons.push(`${plural(lent, 'book', 'books')} of yours ${lent === 1 ? 'is' : 'are'} still lent out`)
  if (!reasons.length) return ''
  const sentence = reasons.join(', and ')
  return `Not yet: ${sentence}. You can delete your account once every book is back home.`
}

// "24 November 2026" from a database timestamp.
export function longDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
