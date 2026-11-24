// Invitation links: any member can invite a friend. A link works for one
// person, for 14 days. See supabase/10_invites.sql.

import { supabase } from '../supabaseClient'

// "https://…/asad-library-portal/#join=abc123"
export function inviteLink(code, location = window.location) {
  return `${location.origin}${location.pathname}#join=${code}`
}

// The code from "#join=abc123", or null.
export function joinCodeFromHash(hash = window.location.hash) {
  const match = /^#join=([0-9a-f]{32})$/i.exec(hash)
  return match ? match[1].toLowerCase() : null
}

// 'joined', 'open' or 'expired', for the list of sent invitations.
export function inviteState(invite, now = new Date()) {
  if (invite.used_at) return 'joined'
  return new Date(invite.expires_at) > now ? 'open' : 'expired'
}

function unwrap({ data, error }, friendly) {
  if (error) throw new Error(friendly ? friendly(error) : error.message)
  return data
}

export async function createInvite() {
  return unwrap(await supabase.rpc('create_invite'), (e) => `The invitation wasn't created: ${e.message}`)
}

export async function loadMyInvites() {
  return unwrap(await supabase.rpc('my_invites'))
}

export async function cancelInvite(code) {
  unwrap(await supabase.rpc('cancel_invite', { p_code: code }), (e) => `The invitation wasn't cancelled: ${e.message}`)
}

// Works before signing in: who sent this invitation, and is it still usable?
export async function checkInvite(code) {
  const rows = unwrap(await supabase.rpc('check_invite', { p_code: code }))
  return rows[0] ?? { inviter_name: null, status: 'unknown' }
}

// Creates the account. The database only accepts it with a valid invitation,
// and takes the name and city from here, so there's no first-visit form.
// rulesVersion: the version of the house rules the person accepted.
export async function joinWithInvite({ code, name, city, email, password, rulesVersion }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { invite_code: code, name, city, rules_version: rulesVersion } },
  })
  if (error) {
    const message = error.message ?? ''
    if (/already registered|already exists/i.test(message)) {
      throw new Error('There is already an account with this email. Sign in instead.')
    }
    if (/database error/i.test(message)) {
      throw new Error("This invitation can't be used anymore. Ask for a new link.")
    }
    if (/confirmation email|sending/i.test(message)) {
      throw new Error("Joining isn't fully set up yet (email confirmation is still on). Ask Asad to switch it off.")
    }
    if (/password/i.test(message)) throw new Error(message)
    throw new Error(`Joining didn't work: ${message}`)
  }
  if (!data.session) {
    throw new Error("Your account was created, but it needs an email confirmation first. Ask Asad to switch email confirmation off.")
  }
  return data
}
