// The Common Shelf's service worker. It only shows push notifications and
// opens the app at the right page when one is tapped. It doesn't cache
// anything, so the site always loads fresh.
// What arrives is sent by supabase/functions/send-notifications:
// { title, body, url, tag }, where url is a page like #messages/42.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'The Common Shelf', {
      body: data.body || '',
      tag: data.tag || undefined,
      data: { url: data.url || '' },
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
    }),
  )
})

// Tapping a notification: bring an open window of the app forward and
// show the page, or open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const page = event.notification.data?.url || ''
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => w.url.startsWith(self.registration.scope))
      if (open) {
        await open.focus()
        open.postMessage({ type: 'open', url: page })
      } else {
        await self.clients.openWindow(self.registration.scope + page)
      }
    })(),
  )
})
