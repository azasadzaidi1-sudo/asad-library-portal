// Push notifications on this device: turning them on and off, and what the
// Account page says about them. The sending side is in
// supabase/17_push_notifications.sql and supabase/functions/send-notifications.
import { supabase } from '../supabaseClient'

function unwrap({ data, error }, friendly) {
  if (error) throw new Error(friendly ? friendly(error) : error.message)
  return data
}

// ---------- What this device can do (pure, tested in push.test.js) ----------

// iPhones and iPads (iPadOS says it's a Mac, but has a touch screen).
export function isAppleMobile(nav) {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
}

// Opened from the Home Screen, rather than in a browser tab.
export function isStandalone(win) {
  return Boolean(win.navigator?.standalone) || Boolean(win.matchMedia?.('(display-mode: standalone)').matches)
}

// What the Account page shows for notifications on this device.
//   configured  the keys are saved (push_public_key isn't null)
//   supported   the browser has service workers, push and notifications
//   appleMobile, standalone  see above: iPhones need the Home Screen app
//   permission  Notification.permission ('default', 'granted', 'denied')
//   subscribed  this device is signed up
// Returns { state, text, action } with action 'turn-on', 'turn-off' or null.
export function notificationStatus({ configured, supported, appleMobile, standalone, permission, subscribed }) {
  if (!configured) {
    return { state: 'not-set-up', text: "Notifications aren't switched on for The Common Shelf yet.", action: null }
  }
  if (appleMobile && !standalone) {
    return {
      state: 'home-screen',
      text:
        'On iPhone and iPad, notifications work once The Common Shelf is on your Home Screen: tap Share, then ' +
        '"Add to Home Screen", and open it from there.',
      action: null,
    }
  }
  if (!supported) {
    return { state: 'unsupported', text: "This browser can't show notifications from The Common Shelf.", action: null }
  }
  if (permission === 'denied') {
    return {
      state: 'blocked',
      text: 'Notifications are blocked for this site in your browser settings. Allow them there, then come back.',
      action: null,
    }
  }
  return subscribed
    ? { state: 'on', text: 'On for this device.', action: 'turn-off' }
    : { state: 'off', text: 'Off for this device.', action: 'turn-on' }
}

// The public key as the browser wants it (bytes from base64url).
export function keyBytes(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4)
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

// ---------- This device (browser only) ----------

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registration() {
  const url = `${import.meta.env.BASE_URL}sw.js`
  return (await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)) ??
    navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL })
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  return reg ? reg.pushManager.getSubscription() : null
}

export async function loadPushPublicKey() {
  return unwrap(await supabase.rpc('push_public_key'))
}

async function save(subscription) {
  const { endpoint, keys } = subscription.toJSON()
  unwrap(
    await supabase.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth }),
    (error) => `Notifications weren't turned on: ${error.message}`,
  )
}

// Must be called from a tap (browsers, iPhones especially, only ask then).
export async function turnOnPush(publicKey) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission
  const reg = await registration()
  await navigator.serviceWorker.ready
  let subscription = await reg.pushManager.getSubscription()
  if (subscription) await subscription.unsubscribe() // start clean, in case the app's key changed
  subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
  await save(subscription)
  return permission
}

// Keeps the database in step with this device (say, after it forgot a
// device the push service had refused for a while).
export async function resaveSubscription(subscription) {
  await save(subscription)
}

export async function turnOffPush() {
  const subscription = await currentSubscription()
  if (!subscription) return
  const { endpoint } = subscription
  await subscription.unsubscribe()
  unwrap(await supabase.rpc('remove_push_subscription', { p_endpoint: endpoint }))
}

export async function sendTestNotification() {
  unwrap(await supabase.rpc('send_test_notification'), (error) => error.message)
}

// Tapping a notification while the app is open: the service worker asks
// the page to show the right place.
export function followNotificationTaps() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'open' && typeof event.data.url === 'string') {
      window.location.hash = event.data.url.replace(/^#/, '')
    }
  })
}
