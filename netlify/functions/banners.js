// GET    /api/banners          -> activos (público) o todos (admin)
// POST   /api/banners          -> crea portada (admin)
// PUT    /api/banners?id=ID    -> edita / reemplaza imagen / activa (admin)
// DELETE /api/banners?id=ID    -> elimina (admin)
// Regla: solo puede haber una portada "hero" activa; activar una desactiva las demás.
import { randomUUID } from 'node:crypto';
import { error, handle, HttpError, idParam, isAuthed, json, readJson, requireAuth } from '../lib/http.js';
import { deleteUploadedImages, readCollection, updateCollection } from '../lib/store.js';
import { validateBanner } from '../lib/validate.js';

function enforceSingleHero(list, keepId) {
  const keep = list.find((b) => b.id === keepId);
  if (!keep || keep.type !== 'hero' || !keep.active) return list;
  return list.map((b) => (b.id !== keepId && b.type === 'hero' && b.active ? { ...b, active: false } : b));
}

export default handle(async (req) => {
  switch (req.method) {
    case 'GET': {
      const list = await readCollection('banners');
      return json(isAuthed(req) ? list : list.filter((b) => b.active));
    }

    case 'POST': {
      requireAuth(req);
      const data = validateBanner(await readJson(req));
      const banner = { id: `banner-${randomUUID()}`, ...data, updatedAt: new Date().toISOString() };
      await updateCollection('banners', (list) => {
        if (list.length >= 30) throw new HttpError('Se alcanzó el máximo de 30 portadas.', 409);
        return { list: enforceSingleHero([...list, banner], banner.id), result: banner };
      });
      return json(banner, 201);
    }

    case 'PUT': {
      requireAuth(req);
      const id = idParam(req);
      const changes = validateBanner(await readJson(req), { partial: true });
      let oldImage = null;
      const banner = await updateCollection('banners', (list) => {
        const i = list.findIndex((b) => b.id === id);
        if (i === -1) throw new HttpError('Portada no encontrada.', 404);
        if (changes.image && changes.image !== list[i].image) oldImage = list[i].image;
        list[i] = { ...list[i], ...changes, updatedAt: new Date().toISOString() };
        const next = enforceSingleHero(list, id);
        return { list: next, result: next.find((b) => b.id === id) };
      });
      if (oldImage) await deleteUploadedImages([oldImage]);
      return json(banner);
    }

    case 'DELETE': {
      requireAuth(req);
      const id = idParam(req);
      const removed = await updateCollection('banners', (list) => {
        const found = list.find((b) => b.id === id);
        if (!found) throw new HttpError('Portada no encontrada.', 404);
        return { list: list.filter((b) => b.id !== id), result: found };
      });
      await deleteUploadedImages([removed.image]);
      return json({ ok: true });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
