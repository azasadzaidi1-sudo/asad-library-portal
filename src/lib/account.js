// Talking to the database about the signed-in member's own account: the
// house rules, the contact details in the privacy notice, and deleting it.
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function unwrap({ data, error }, friendly) {
  if (error) throw new Error(friendly?.(error) ?? error.message)
  return data
}

export async function acceptHouseRules(version) {
  unwrap(
    await supabase.rpc('accept_house_rules', { p_version: version }),
    (error) => `That didn't save: ${error.message}`,
  )
}

// Asad's postal address and email, which live in the database rather than
// in the public code. Members get them; so does someone on the Join page
// with a valid invitation link (pass its code). Anyone else gets nothing.
export async function loadContactDetails(inviteCode = null) {
  const rows = unwrap(await supabase.rpc('contact_details', { p_invite_code: inviteCode }))
  return rows?.[0] ?? null
}

// { address, email } once loaded; null while loading or if it failed.
export function useContactDetails(inviteCode = null) {
  const [contact, setContact] = useState(null)
  useEffect(() => {
    let current = true
    loadContactDetails(inviteCode)
      .then((details) => current && setContact(details ?? {}))
      .catch(() => current && setContact({}))
    return () => {
      current = false
    }
  }, [inviteCode])
  return contact
}

// How many books stop the account from being deleted right now.
export async function loadDeletionBlockers() {
  const rows = unwrap(await supabase.rpc('deletion_blockers'))
  return rows?.[0] ?? { borrowed: 0, lent: 0 }
}

const DELETED_FLAG = 'common-shelf-account-deleted'

// Deletes the account in the database, then signs out on this device.
// The sign-in page then says the account is gone.
export async function deleteMyAccount() {
  unwrap(await supabase.rpc('delete_my_account'), (error) => error.message)
  try {
    window.sessionStorage.setItem(DELETED_FLAG, '1')
  } catch {
    // Private browsing can refuse storage; the goodbye line just won't show.
  }
  await supabase.auth.signOut({ scope: 'local' })
}

// True once, right after an account was deleted on this device.
export function takeAccountDeletedFlag() {
  try {
    const was = window.sessionStorage.getItem(DELETED_FLAG) === '1'
    window.sessionStorage.removeItem(DELETED_FLAG)
    return was
  } catch {
    return false
  }
}
