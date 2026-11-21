import { describe, expect, it, vi } from 'vitest'
import { inviteLink, inviteState, joinCodeFromHash } from './invites'

vi.mock('../supabaseClient', () => ({ supabase: {} }))

const CODE = '0123456789abcdef0123456789abcdef'

describe('invitation links', () => {
  it('builds a link to the Join page', () => {
    const location = { origin: 'https://azasadzaidi1-sudo.github.io', pathname: '/asad-library-portal/' }
    expect(inviteLink(CODE, location)).toBe(`https://azasadzaidi1-sudo.github.io/asad-library-portal/#join=${CODE}`)
  })

  it('reads the code back from the address', () => {
    expect(joinCodeFromHash(`#join=${CODE}`)).toBe(CODE)
    expect(joinCodeFromHash(`#join=${CODE.toUpperCase()}`)).toBe(CODE)
    expect(joinCodeFromHash('#join=short')).toBeNull()
    expect(joinCodeFromHash('#catalogue')).toBeNull()
    expect(joinCodeFromHash('')).toBeNull()
  })

  it('tells joined, open and expired invitations apart', () => {
    const now = new Date('2026-11-21T12:00:00Z')
    expect(inviteState({ used_at: '2026-11-20T10:00:00Z', expires_at: '2026-12-01T00:00:00Z' }, now)).toBe('joined')
    expect(inviteState({ used_at: null, expires_at: '2026-12-01T00:00:00Z' }, now)).toBe('open')
    expect(inviteState({ used_at: null, expires_at: '2026-11-20T00:00:00Z' }, now)).toBe('expired')
  })
})
