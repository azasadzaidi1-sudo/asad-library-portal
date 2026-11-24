import { describe, expect, it } from 'vitest'
import { isAppleMobile, isStandalone, keyBytes, notificationStatus } from './push'

const ready = { configured: true, supported: true, appleMobile: false, standalone: false, permission: 'default', subscribed: false }

describe('notificationStatus', () => {
  it('offers nothing until the keys are saved', () => {
    expect(notificationStatus({ ...ready, configured: false })).toMatchObject({ state: 'not-set-up', action: null })
  })

  it('sends iPhones to the Home Screen first', () => {
    expect(notificationStatus({ ...ready, appleMobile: true, standalone: false }))
      .toMatchObject({ state: 'home-screen', action: null })
    expect(notificationStatus({ ...ready, appleMobile: true, standalone: true }))
      .toMatchObject({ state: 'off', action: 'turn-on' })
  })

  it('explains when the browser can not, or the person blocked it', () => {
    expect(notificationStatus({ ...ready, supported: false }).state).toBe('unsupported')
    expect(notificationStatus({ ...ready, permission: 'denied' }).state).toBe('blocked')
  })

  it('turns on and off', () => {
    expect(notificationStatus(ready)).toEqual({ state: 'off', text: 'Off for this device.', action: 'turn-on' })
    expect(notificationStatus({ ...ready, permission: 'granted', subscribed: true }))
      .toEqual({ state: 'on', text: 'On for this device.', action: 'turn-off' })
  })
})

describe('this device', () => {
  it('recognises iPhones and iPads', () => {
    expect(isAppleMobile({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)' })).toBe(true)
    expect(isAppleMobile({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
    expect(isAppleMobile({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
    expect(isAppleMobile({ userAgent: 'Mozilla/5.0 (Linux; Android 15)' })).toBe(false)
  })

  it('knows when it was opened from the Home Screen', () => {
    expect(isStandalone({ navigator: { standalone: true } })).toBe(true)
    expect(isStandalone({ navigator: {}, matchMedia: () => ({ matches: true }) })).toBe(true)
    expect(isStandalone({ navigator: {}, matchMedia: () => ({ matches: false }) })).toBe(false)
  })

  it('reads the public key the way the browser needs it', () => {
    expect([...keyBytes('BAEC')]).toEqual([4, 1, 2])
  })
})
