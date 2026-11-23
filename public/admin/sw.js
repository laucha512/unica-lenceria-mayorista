// Service worker del admin: permite instalarlo como app y recibir los avisos de pedidos nuevos.
// No guarda copias de las páginas: el admin siempre muestra los datos al día.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Aviso de pedido nuevo (lo manda el servidor desde netlify/lib/push.js).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'ÚNICA LENCERÍA', {
      body: data.body || 'Hay novedades en el admin.',
      icon: '/icon-192.png',
      badge: '/favicon-96.png',
      tag: data.tag || 'pedido',
      renotify: true,
      data: { url: data.url || '/admin/#pedidos' },
    })
  );
});

// Al tocar el aviso: abre el admin en Pedidos (o trae al frente la ventana que ya estaba abierta).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin/#pedidos', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const admin = windows.find((w) => new URL(w.url).pathname.startsWith('/admin'));
      if (admin) {
        await admin.focus();
        return admin.navigate ? admin.navigate(url).catch(() => admin.postMessage({ type: 'abrir', url })) : null;
      }
      return self.clients.openWindow(url);
    })()
  );
});
