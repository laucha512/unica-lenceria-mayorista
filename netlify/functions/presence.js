// POST /api/presence -> "sigo en la web", cada minuto desde la tienda (público, anónimo)
// GET  /api/presence -> cuántas personas hay ahora y qué están mirando (admin)
// Cada pestaña guarda un registro chico con la hora de su último aviso; los viejos se borran solos.
import { getStore } from '@netlify/blobs';
import { error, handle, json, readJson, requireAuth } from '../lib/http.js';
import { readCollection } from '../lib/store.js';
import { validatePresence } from '../lib/validate.js';

const ACTIVE_MS = 150 * 1000; // sin aviso en 2,5 minutos = ya no está
const presenceStore = () => getStore({ name: 'presence', consistency: 'strong' });

export default handle(async (req) => {
  const store = presenceStore();
  switch (req.method) {
    case 'POST': {
      const p = validatePresence(await readJson(req, 1024));
      if (p.leave) await store.delete(p.sid);
      else await store.setJSON(p.sid, { t: Date.now(), view: p.view, productId: p.productId, cart: p.cart });
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }

    case 'GET': {
      requireAuth(req);
      const { blobs } = await store.list();
      const now = Date.now();
      const rows = await Promise.all(
        blobs.map(async ({ key }) => ({ key, data: await store.get(key, { type: 'json' }).catch(() => null) }))
      );
      const active = [];
      const stale = [];
      for (const r of rows) (r.data && now - r.data.t < ACTIVE_MS ? active : stale).push(r);
      await Promise.all(stale.slice(0, 50).map((r) => store.delete(r.key).catch(() => {})));

      const titles = new Map((await readCollection('articles')).map((a) => [a.id, `${a.title} – ${a.brand}`]));
      const views = { tienda: 0, producto: 0, pedido: 0 };
      const products = new Map();
      for (const { data } of active) {
        views[data.view] = (views[data.view] || 0) + 1;
        if (data.view === 'producto' && titles.has(data.productId)) {
          const title = titles.get(data.productId);
          products.set(title, (products.get(title) || 0) + 1);
        }
      }
      return json({
        total: active.length,
        views,
        withCart: active.filter(({ data }) => data.cart > 0).length,
        products: [...products].map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count),
      });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
