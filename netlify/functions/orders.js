// POST   /api/orders          -> registra el pedido que el cliente envía por WhatsApp (público)
// GET    /api/orders          -> lista de pedidos, más nuevos primero (admin)
// PUT    /api/orders?id=ID    -> cambia el estado o lo armado de un artículo (admin)
// DELETE /api/orders?id=ID    -> elimina (admin)
//
// Reglas (la persona se reconoce por su WhatsApp):
// - Mismo WhatsApp + mismo destino + pedido "nuevo" o "en preparación" -> lo nuevo se SUMA a ese pedido (mismo código).
// - Distinto destino, o pedido anterior listo / entregado / cancelado -> pedido NUEVO con otro código.
// Los precios y nombres se toman del catálogo, no de lo que manda el navegador.
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { error, handle, HttpError, idParam, json, readJson, requireAuth } from '../lib/http.js';
import { readCollection, updateCollection } from '../lib/store.js';
import { ORDER_STATUSES, validateOrder } from '../lib/validate.js';

const MAX_ORDERS = 1000;
// Pedidos nuevos por conexión cada 10 minutos (evita abusos). Es generoso porque en celulares
// muchas personas comparten la misma conexión; si se supera, el WhatsApp igual se envía.
const MAX_PER_VISITOR = 30;
const WINDOW_MS = 10 * 60 * 1000;
const OPEN_STATUSES = ['nuevo', 'en_preparacion']; // a estos se les puede sumar
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I

const packPrice = (a) => a.pricePack || a.priceUnit || 0;
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const visitorHash = (ip) => createHash('sha256').update(`unica-pedidos:${ip || ''}`).digest('hex').slice(0, 16);

/** Destino: la sucursal de retiro, o envío/a coordinar + localidad. Si cambia, es otro pedido. */
const destinationOf = (info) => {
  const delivery = plain(info.delivery || 'a coordinar');
  return delivery.startsWith('retiro') ? delivery : `${delivery}|${plain(info.city)}`;
};

function newCode(list) {
  const used = new Set(list.map((o) => o.code));
  for (;;) {
    const code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    if (!used.has(code)) return code;
  }
}

/** Pedidos guardados antes de este cambio: estados y artículos al formato actual. */
function normalizeOrder(o) {
  const status = o.status === 'confirmado' ? 'en_preparacion' : ORDER_STATUSES.includes(o.status) ? o.status : 'nuevo';
  const items = (o.items || []).map((l, i) => ({
    ...l,
    lineId: l.lineId || `l${i + 1}`,
    prepared: Number.isInteger(l.prepared) ? l.prepared : 0,
    batch: l.batch || 1,
  }));
  return { ...o, status, items, batches: o.batches || 1 };
}

const withTotals = (o) => ({
  ...o,
  total: o.items.reduce((t, l) => t + l.subtotal, 0),
  packs: o.items.reduce((n, l) => n + l.qty, 0),
});

const publicOrder = ({ visitor, lastSignature, lastAt, ...o }) => o;

export default handle(async (req, context) => {
  switch (req.method) {
    case 'POST': {
      const { items, phone, info } = validateOrder(await readJson(req, 32 * 1024));
      const catalog = new Map((await readCollection('articles')).map((a) => [a.id, a]));
      const now = new Date().toISOString();
      const lines = items
        .map((i) => {
          const a = catalog.get(i.id);
          if (!a) return null;
          const price = packPrice(a);
          return { ...i, brand: a.brand, code: a.code || '', title: a.title, presentation: a.presentation, price, subtotal: price * i.qty, prepared: 0, addedAt: now };
        })
        .filter(Boolean);
      if (!lines.length) throw new HttpError('Los artículos del pedido ya no están disponibles.');
      const destination = destinationOf(info);
      const signature = JSON.stringify(lines.map((l) => [l.id, l.qty, l.colors, l.sizes]));
      const visitor = visitorHash(context?.ip);

      const result = await updateCollection('orders', (raw) => {
        const list = raw.map(normalizeOrder);
        const i = list.findIndex((o) => o.phone === phone && o.destination === destination && OPEN_STATUSES.includes(o.status));

        if (i !== -1) {
          const open = list[i];
          // Doble toque en "Enviar" con lo mismo: no se suma dos veces.
          if (open.lastSignature === signature && Date.now() - Date.parse(open.lastAt) < 60 * 1000) {
            return { list, result: { order: open, merged: true, repeated: true } };
          }
          const batch = open.batches + 1;
          const added = lines.map((l, n) => ({ ...l, batch, lineId: `b${batch}-${n + 1}` }));
          const notes = info.notes && !open.info.notes.includes(info.notes) ? [open.info.notes, info.notes].filter(Boolean).join(' / ') : open.info.notes;
          list[i] = withTotals({
            ...open,
            items: [...open.items, ...added],
            info: { ...open.info, ...Object.fromEntries(Object.entries(info).filter(([, v]) => v)), notes },
            batches: batch,
            updatedAt: now,
            lastSignature: signature,
            lastAt: now,
          });
          return { list, result: { order: list[i], merged: true } };
        }

        const recent = list.filter((o) => o.visitor === visitor && Date.now() - Date.parse(o.createdAt) < WINDOW_MS).length;
        if (recent >= MAX_PER_VISITOR) throw new HttpError('Demasiados pedidos seguidos. Probá en unos minutos.', 429);
        const created = withTotals({
          id: `order-${randomUUID()}`,
          number: list.reduce((max, o) => Math.max(max, o.number || 0), 0) + 1,
          code: newCode(list),
          status: 'nuevo',
          phone,
          destination,
          info,
          items: lines.map((l, n) => ({ ...l, batch: 1, lineId: `b1-${n + 1}` })),
          batches: 1,
          visitor,
          lastSignature: signature,
          lastAt: now,
          createdAt: now,
          updatedAt: now,
        });
        return { list: [created, ...list].slice(0, MAX_ORDERS), result: { order: created, merged: false } };
      });
      const { order, merged } = result;
      return json({ ok: true, code: order.code, number: order.number, merged }, merged ? 200 : 201);
    }

    case 'GET': {
      requireAuth(req);
      const list = (await readCollection('orders')).map(normalizeOrder);
      return json(list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(publicOrder));
    }

    case 'PUT': {
      requireAuth(req);
      const id = idParam(req);
      const body = await readJson(req);
      if ('status' in body && !ORDER_STATUSES.includes(body.status)) throw new HttpError('Estado inválido.');
      const order = await updateCollection('orders', (raw) => {
        const list = raw.map(normalizeOrder);
        const i = list.findIndex((o) => o.id === id);
        if (i === -1) throw new HttpError('Pedido no encontrado.', 404);
        const o = { ...list[i], updatedAt: new Date().toISOString() };
        if ('status' in body) {
          o.status = body.status;
          o.statusAt = o.updatedAt;
        }
        if ('line' in body) {
          const line = o.items.find((l) => l.lineId === body.line);
          if (!line) throw new HttpError('Artículo del pedido no encontrado.', 404);
          const n = Number(body.prepared);
          if (!Number.isInteger(n) || n < 0 || n > line.qty) throw new HttpError(`La cantidad armada debe ir de 0 a ${line.qty}.`);
          o.items = o.items.map((l) => (l.lineId === body.line ? { ...l, prepared: n } : l));
        }
        list[i] = o;
        return { list, result: o };
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
