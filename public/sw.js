// Meddies service worker (#354): displays incoming FCM messages, so reminders arrive with
// Meddies closed. A push must always show a notification, or Safari revokes the subscription.
// Message content and tap navigation belong to #30. It has no fetch handler: pages load from
// the network as before.
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
