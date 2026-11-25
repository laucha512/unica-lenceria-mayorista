// POST   /api/restock          -> { articleId, phone, name?, combo? }: "avisame cuando vuelva" (público)
// GET    /api/restock          -> lista de pedidos de aviso (admin)
// DELETE /api/restock?id=ID    -> ya se avisó / borrar (admin)
// combo: "talle|color" agotado que espera (vacío = el artículo entero sin stock).
import { randomUUID } from 'node:crypto';
import { formatWhatsapp, normalizeWhatsapp } from '../../src/shared/phone.js';
import { error, handle, HttpError, idParam, json, readJson, requireAuth } from '../lib/http.js';
import { readCollection, updateCollection } from '../lib/store.js';

const MAX = 3000;

export default handle(async (req) => {
  switch (req.method) {
    case 'POST': {
      const body = await readJson(req, 2048);
      const articleId = String(body.articleId || '');
      if (!/^[\w-]{1,64}$/.test(articleId)) throw new HttpError('Artículo inválido.');
      const phone = normalizeWhatsapp(body.phone);
      if (!phone) throw new HttpError('Revisá tu WhatsApp: con código de área, sin 0 ni 15 (ej. 341 555-1234).');
      const combo = String(body.combo || '').slice(0, 100);
      if (combo && (combo.match(/\|/g) || []).length !== 1) throw new HttpError('Talle o color inválido.');
      const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      const article = (await readCollection('articles')).find((a) => a.id === articleId);
      if (!article) throw new HttpError('El artículo ya no existe.', 404);

      await updateCollection('restockRequests', (list) => {
        if (list.some((r) => r.phone === phone && r.articleId === articleId && r.combo === combo)) return { list, result: null }; // ya estaba anotada
        if (list.filter((r) => r.phone === phone).length >= 30) throw new HttpError('Ya tenés muchos avisos pedidos.', 429);
        const entry = { id: `aviso-${randomUUID()}`, articleId, combo, phone, phoneDisplay: formatWhatsapp(phone), name, createdAt: new Date().toISOString() };
        return { list: [entry, ...list].slice(0, MAX), result: entry };
      });
      return json({ ok: true }, 201);
    }

    case 'GET':
      requireAuth(req);
      return json(await readCollection('restockRequests'));

    case 'DELETE': {
      requireAuth(req);
      const id = idParam(req);
      await updateCollection('restockRequests', (list) => ({ list: list.filter((r) => r.id !== id), result: null }));
      return json({ ok: true });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
