// GET  /api/prices                -> último cambio de precios en bloque (para "Deshacer") (admin)
// POST /api/prices                -> { scope: { type, value }, percent, round }: aplica el cambio (admin)
// POST /api/prices  { undo: true } -> vuelve los precios al estado anterior al último cambio (admin)
// type: "all" | "brand" (nombre) | "category" (id) | "subcategory" (id). Se guardan los últimos 10 cambios.
import { randomUUID } from 'node:crypto';
import { applyPercent, ROUND_OPTIONS } from '../../src/shared/prices.js';
import { error, handle, HttpError, json, readJson, requireAuth } from '../lib/http.js';
import { normalizeName, readCollection, updateCollection } from '../lib/store.js';

const MAX_HISTORY = 10;

async function matcher(scope) {
  const type = scope?.type;
  const value = String(scope?.value || '');
  if (type === 'all') return { test: () => true, label: 'todo el catálogo' };
  if (type === 'brand') {
    const key = normalizeName(value);
    if (!key) throw new HttpError('Elegí una marca.');
    return { test: (a) => normalizeName(a.brand) === key, label: `la marca ${value}` };
  }
  if (type === 'category') {
    const [cats, subs] = await Promise.all([readCollection('categories'), readCollection('subcategories')]);
    const cat = cats.find((c) => c.id === value);
    if (!cat) throw new HttpError('La categoría no existe.');
    const ids = new Set(subs.filter((s) => s.categoryId === value).map((s) => s.id));
    return { test: (a) => ids.has(a.subcategoryId), label: `la categoría ${cat.name}` };
  }
  if (type === 'subcategory') {
    const sub = (await readCollection('subcategories')).find((s) => s.id === value);
    if (!sub) throw new HttpError('La subcategoría no existe.');
    return { test: (a) => a.subcategoryId === value, label: `la subcategoría ${sub.name}` };
  }
  throw new HttpError('Alcance inválido.');
}

const summary = (h) => (h ? { id: h.id, at: h.at, percent: h.percent, round: h.round, label: h.label, count: h.items.length } : null);

export default handle(async (req) => {
  requireAuth(req);
  switch (req.method) {
    case 'GET': {
      const history = await readCollection('priceHistory');
      return json({ last: summary(history[0]) });
    }

    case 'POST': {
      const body = await readJson(req, 4096);

      if (body.undo === true) {
        const history = await readCollection('priceHistory');
        const last = history[0];
        if (!last) throw new HttpError('No hay cambios de precios para deshacer.', 404);
        const before = new Map(last.items.map((i) => [i.id, i]));
        const now = new Date().toISOString();
        const restored = await updateCollection('articles', (list) => {
          let n = 0;
          const next = list.map((a) => {
            const prev = before.get(a.id);
            if (!prev) return a;
            n++;
            return { ...a, pricePack: prev.pricePack, priceUnit: prev.priceUnit, offerPrice: prev.offerPrice || 0, updatedAt: now };
          });
          return { list: next, result: n };
        });
        await updateCollection('priceHistory', (list) => ({ list: list.filter((h) => h.id !== last.id), result: null }));
        const remaining = await readCollection('priceHistory');
        return json({ restored, label: last.label, percent: last.percent, last: summary(remaining[0]) });
      }

      const percent = Number(body.percent);
      if (!Number.isFinite(percent) || percent === 0 || percent < -90 || percent > 300) {
        throw new HttpError('El porcentaje tiene que ser distinto de 0, entre -90% y +300%.');
      }
      const round = Number(body.round) || 0;
      if (!ROUND_OPTIONS.includes(round)) throw new HttpError('Redondeo inválido.');
      const { test, label } = await matcher(body.scope);
      const now = new Date().toISOString();

      const items = await updateCollection('articles', (list) => {
        const changed = [];
        const next = list.map((a) => {
          if (!test(a)) return a;
          changed.push({ id: a.id, pricePack: a.pricePack || 0, priceUnit: a.priceUnit || 0, offerPrice: a.offerPrice || 0 });
          return { ...a, pricePack: applyPercent(a.pricePack, percent, round), priceUnit: applyPercent(a.priceUnit, percent, round), offerPrice: applyPercent(a.offerPrice, percent, round), updatedAt: now };
        });
        if (!changed.length) throw new HttpError('No hay artículos en ese alcance.');
        return { list: next, result: changed };
      });

      const entry = { id: `precios-${randomUUID()}`, at: now, percent, round, label, items };
      await updateCollection('priceHistory', (list) => ({ list: [entry, ...list].slice(0, MAX_HISTORY), result: null }));
      return json({ changed: items.length, label, last: summary(entry) });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
