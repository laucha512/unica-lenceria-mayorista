// GET    /api/push                 -> clave pública para activar los avisos y cantidad de dispositivos (admin)
// POST   /api/push { subscription, device } -> activa los avisos en este dispositivo (admin)
// POST   /api/push { test: true, endpoint } -> manda un aviso de prueba a este dispositivo (admin)
// DELETE /api/push { endpoint }    -> desactiva los avisos en este dispositivo (admin)
import { error, handle, HttpError, json, readJson, requireAuth } from '../lib/http.js';
import { addSubscription, listSubscriptions, removeSubscription, sendPush, vapidKeys } from '../lib/push.js';

const validEndpoint = (e) => typeof e === 'string' && /^https:\/\/[^\s]{10,800}$/.test(e);

export default handle(async (req) => {
  requireAuth(req);
  switch (req.method) {
    case 'GET': {
      const [{ publicKey }, subs] = await Promise.all([vapidKeys(), listSubscriptions()]);
      return json({ publicKey, devices: subs.length });
    }

    case 'POST': {
      const body = await readJson(req, 8192);
      if (body.test === true) {
        if (!validEndpoint(body.endpoint)) throw new HttpError('Dispositivo inválido.');
        const { sent } = await sendPush(
          { title: 'Avisos activados', body: 'Así te va a llegar cada pedido nuevo de la web.', url: '/admin/#pedidos', tag: 'prueba' },
          { onlyEndpoint: body.endpoint }
        );
        return json({ sent });
      }
      const sub = body.subscription;
      if (!sub || !validEndpoint(sub.endpoint) || typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') {
        throw new HttpError('Suscripción inválida.');
      }
      const device = String(body.device || 'Dispositivo').slice(0, 80);
      const list = await addSubscription({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh.slice(0, 200), auth: sub.keys.auth.slice(0, 100) } }, device);
      return json({ ok: true, devices: list.length });
    }

    case 'DELETE': {
      const { endpoint } = await readJson(req, 4096);
      if (!validEndpoint(endpoint)) throw new HttpError('Dispositivo inválido.');
      const list = await removeSubscription(endpoint);
      return json({ ok: true, devices: list.length });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
