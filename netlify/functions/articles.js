// GET    /api/articles           -> lista pública (más recientes primero)
// POST   /api/articles           -> crea (admin)
// PUT    /api/articles?id=ID     -> actualiza campos enviados (admin)
// DELETE /api/articles?id=ID     -> elimina (admin)
// Cada artículo guarda subcategoryId (verificada) y brandId (derivado del nombre de la marca):
// así la marca aparece sola en el menú de esa subcategoría.
import { randomUUID } from 'node:crypto';
import { error, handle, HttpError, idParam, json, readJson, requireAuth } from '../lib/http.js';
import { deleteUploadedImages, normalizeName, readCollection, updateCollection } from '../lib/store.js';
import { validateArticle } from '../lib/validate.js';

const byNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

/** Verifica la subcategoría y resuelve el id de marca por nombre. */
async function resolveRelations(data) {
  const out = {};
  if ('subcategoryId' in data && data.subcategoryId) {
    const subs = await readCollection('subcategories');
    if (!subs.some((s) => s.id === data.subcategoryId)) throw new HttpError('La subcategoría elegida no existe.', 400);
  }
  if ('brand' in data) {
    const brands = await readCollection('brands');
    out.brandId = brands.find((b) => normalizeName(b.name) === normalizeName(data.brand))?.id || '';
  }
  return out;
}

export default handle(async (req) => {
  switch (req.method) {
    case 'GET': {
      const list = await readCollection('articles');
      return json(list.sort(byNewest));
    }

    case 'POST': {
      requireAuth(req);
      const data = validateArticle(await readJson(req));
      const relations = await resolveRelations(data);
      const now = new Date().toISOString();
      const article = { id: `art-${randomUUID()}`, ...data, ...relations, createdAt: now, updatedAt: now };
      await updateCollection('articles', (list) => {
        if (list.length >= 1000) throw new HttpError('Se alcanzó el máximo de 1000 artículos.', 409);
        return { list: [article, ...list], result: article };
      });
      return json(article, 201);
    }

    case 'PUT': {
      requireAuth(req);
      const id = idParam(req);
      const changes = validateArticle(await readJson(req), { partial: true });
      const relations = await resolveRelations(changes);
      let removedImages = [];
      const article = await updateCollection('articles', (list) => {
        const i = list.findIndex((a) => a.id === id);
        if (i === -1) throw new HttpError('Artículo no encontrado.', 404);
        const prev = list[i];
        if (changes.images) removedImages = (prev.images || []).filter((u) => !changes.images.includes(u));
        list[i] = { ...prev, ...changes, ...relations, updatedAt: new Date().toISOString() };
        return { list, result: list[i] };
      });
      await deleteUploadedImages(removedImages);
      return json(article);
    }

    case 'DELETE': {
      requireAuth(req);
      const id = idParam(req);
      const removed = await updateCollection('articles', (list) => {
        const found = list.find((a) => a.id === id);
        if (!found) throw new HttpError('Artículo no encontrado.', 404);
        return { list: list.filter((a) => a.id !== id), result: found };
      });
      await deleteUploadedImages(removed.images);
      return json({ ok: true });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
