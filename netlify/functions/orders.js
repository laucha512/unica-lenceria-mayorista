// POST   /api/orders          -> guarda el pedido que el cliente envía por WhatsApp (público)
// GET    /api/orders          -> lista de pedidos, más nuevos primero (admin)
// PUT    /api/orders?id=ID    -> cambia el estado (admin)
// DELETE /api/orders?id=ID    -> elimina (admin)
// Los precios y nombres se toman del catálogo, no de lo que manda el navegador.
// Si el mismo pedido (mismo código) se reenvía, se actualiza en vez de duplicarse.
import { createHash, randomUUID } from 'node:crypto';
import { error, handle, HttpError, idParam, json, readJson, requireAuth } from '../lib/http.js';
import { readCollection, updateCollection } from '../lib/store.js';
import { ORDER_STATUSES, validateOrder } from '../lib/validate.js';

const MAX_ORDERS = 1000;
// Pedidos nuevos por conexión cada 10 minutos (evita abusos). Es generoso porque en celulares
// muchas personas comparten la misma conexión; si se supera, el WhatsApp igual se envía.
const MAX_PER_VISITOR = 30;
const WINDOW_MS = 10 * 60 * 1000;

const packPrice = (a) => a.pricePack || a.priceUnit || 0;
const visitorHash = (ip) => createHash('sha256').update(`unica-pedidos:${ip || ''}`).digest('hex').slice(0, 16);
const publicOrder = ({ visitor, ...o }) => o;

export default handle(async (req, context) => {
  switch (req.method) {
    case 'POST': {
      const { code, items, info } = validateOrder(await readJson(req, 32 * 1024));
      const catalog = new Map((await readCollection('articles')).map((a) => [a.id, a]));
      const lines = items
        .map((i) => {
          const a = catalog.get(i.id);
          if (!a) return null;
          const price = packPrice(a);
          return { ...i, brand: a.brand, code: a.code || '', title: a.title, presentation: a.presentation, price, subtotal: price * i.qty };
        })
        .filter(Boolean);
      if (!lines.length) throw new HttpError('Los artículos del pedido ya no están disponibles.');
      const now = new Date().toISOString();
      const content = {
        items: lines,
        info,
        total: lines.reduce((t, l) => t + l.subtotal, 0),
        packs: lines.reduce((n, l) => n + l.qty, 0),
      };
      const visitor = visitorHash(context?.ip);

      const order = await updateCollection('orders', (list) => {
        const i = list.findIndex((o) => o.code === code);
        if (i !== -1) {
          list[i] = { ...list[i], ...content, updatedAt: now, sends: (list[i].sends || 1) + 1 };
          return { list, result: list[i] };
        }
        const recent = list.filter((o) => o.visitor === visitor && Date.now() - Date.parse(o.createdAt) < WINDOW_MS).length;
        if (recent >= MAX_PER_VISITOR) throw new HttpError('Demasiados pedidos seguidos. Probá en unos minutos.', 429);
        const number = list.reduce((max, o) => Math.max(max, o.number || 0), 0) + 1;
        const created = { id: `order-${randomUUID()}`, number, code, status: 'nuevo', ...content, visitor, sends: 1, createdAt: now, updatedAt: now };
        return { list: [created, ...list].slice(0, MAX_ORDERS), result: created };
      });
      return json({ ok: true, number: order.number }, 201);
    }

    case 'GET': {
      requireAuth(req);
      const list = await readCollection('orders');
      return json([...list].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(publicOrder));
    }

    case 'PUT': {
      requireAuth(req);
      const id = idParam(req);
      const { status } = await readJson(req);
      if (!ORDER_STATUSES.includes(status)) throw new HttpError('Estado inválido.');
      const order = await updateCollection('orders', (list) => {
        const i = list.findIndex((o) => o.id === id);
        if (i === -1) throw new HttpError('Pedido no encontrado.', 404);
        list[i] = { ...list[i], status, statusAt: new Date().toISOString() };
        return { list, result: list[i] };
      });
      return json(publicOrder(order));
    }

    case 'DELETE': {
      requireAuth(req);
      const id = idParam(req);
      await updateCollection('orders', (list) => {
        if (!list.some((o) => o.id === id)) throw new HttpError('Pedido no encontrado.', 404);
        return { list: list.filter((o) => o.id !== id), result: null };
      });
      return json({ ok: true });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
