// Meddies service worker (#354): displays incoming FCM messages, so reminders arrive with
// Meddies closed. A push must always show a notification, or Safari revokes the subscription.
// Tapping a reminder (#369) focuses an open Meddies window and navigates it to the message's
// Reminder link (`data.link`), or opens a window there; a missing or foreign link opens Today.
// It claims open windows on activation so a tap can navigate them. It has no fetch handler:
// pages load from the network as before.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let message = {}
  try {
    message = event.data?.json() ?? {}
  } catch {
    // An unreadable payload still shows the generic notification.
  }
  const notification = message.notification ?? {}
  event.waitUntil(
    self.registration.showNotification(notification.title || 'Meddies', {
      body: notification.body,
      icon: '/icon-192.png',
      data: message.data,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = event.notification.data?.link
  const path = typeof link === 'string' && /^\/(?![/\\])/.test(link) ? link : '/'
  const url = new URL(path, self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        // Focus first, while the tap still allows it; navigate needs a window this worker controls.
        const focused = await open.focus().catch(() => open)
        if (await focused.navigate(url).catch(() => null)) return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
