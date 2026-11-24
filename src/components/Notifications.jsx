import { useCallback, useEffect, useState } from 'react'
import {
  currentSubscription,
  isAppleMobile,
  isStandalone,
  loadPushPublicKey,
  notificationStatus,
  pushSupported,
  resaveSubscription,
  sendTestNotification,
  turnOffPush,
  turnOnPush,
} from '../lib/push'

// On the Account page: push notifications for this device (phone or
// computer). Each device is turned on separately.
export default function Notifications() {
  const [status, setStatus] = useState(null)
  const [publicKey, setPublicKey] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const check = useCallback(async () => {
    try {
      const key = await loadPushPublicKey()
      const supported = pushSupported()
      const subscription = supported ? await currentSubscription() : null
      if (subscription && key) await resaveSubscription(subscription)
      setPublicKey(key)
      setStatus(notificationStatus({
        configured: Boolean(key),
        supported,
        appleMobile: isAppleMobile(navigator),
        standalone: isStandalone(window),
        permission: supported ? Notification.permission : 'default',
        subscribed: Boolean(subscription),
      }))
    } catch (e) {
      setError(`Couldn't check notifications: ${e.message}`)
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  async function run(action) {
    setBusy(true)
    setError('')
    setNote('')
    try {
      await action()
      await check()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="shelf" aria-labelledby="notifications-title">
      <h2 id="notifications-title" className="shelf-title">Notifications</h2>
      <div className="account-text">
        <p>
          A short notification on this device for new messages, requests to borrow, library passes, and books due back
          in a week. It never shows what a message says. Turn it on separately on each phone or computer.
        </p>
        {status && <p className="notifications-status">{status.text}</p>}
        {status?.action && (
          <div className="form-actions">
            {status.action === 'turn-on' ? (
              <button type="button" className="button" disabled={busy}
                onClick={() => run(async () => {
                  const answer = await turnOnPush(publicKey)
                  if (answer === 'denied') setNote('Notifications stay off: the browser was told not to allow them.')
                })}>
                Turn on notifications
              </button>
            ) : (
              <>
                <button type="button" className="button button-quiet" disabled={busy}
                  onClick={() => run(async () => {
                    await sendTestNotification()
                    setNote('A test notification is on its way. It can take a minute.')
                  })}>
                  Send me a test notification
                </button>
                <button type="button" className="link-button" disabled={busy} onClick={() => run(turnOffPush)}>
                  Turn off on this device
                </button>
              </>
            )}
          </div>
        )}
        {note && <p className="shelf-note" role="status">{note}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}
