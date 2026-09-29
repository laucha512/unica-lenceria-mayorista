// GET    /api/brands          -> lista pública (orden de alta)
// POST   /api/brands          -> agrega marca al carrusel (admin)
// DELETE /api/brands?id=ID    -> elimina marca (admin; el panel pide doble confirmación)
import { randomUUID } from 'node:crypto';
import { error, handle, HttpError, idParam, json, readJson, requireAuth } from '../lib/http.js';
import { deleteUploadedImages, normalizeName, readCollection, updateCollection } from '../lib/store.js';
import { validateBrand } from '../lib/validate.js';
import { initials as autoInitials } from '../../src/shared/utils.js';

export default handle(async (req) => {
  switch (req.method) {
    case 'GET':
      return json(await readCollection('brands'));

    case 'POST': {
      requireAuth(req);
      const data = validateBrand(await readJson(req));
      const brand = {
        id: `brand-${randomUUID()}`,
        ...data,
        initials: data.initials || autoInitials(data.name),
        createdAt: new Date().toISOString(),
      };
      await updateCollection('brands', (list) => {
        if (list.some((b) => b.name.toLowerCase() === brand.name.toLowerCase())) {
          throw new HttpError(`La marca "${brand.name}" ya está en el carrusel.`, 409);
        }
        if (list.length >= 60) throw new HttpError('Se alcanzó el máximo de 60 marcas.', 409);
        return { list: [...list, brand], result: brand };
      });
      // Los artículos que ya usaban ese nombre de marca quedan vinculados a la marca nueva.
      await updateCollection('articles', (arts) => ({
        list: arts.map((a) => (!a.brandId && normalizeName(a.brand) === normalizeName(brand.name) ? { ...a, brandId: brand.id } : a)),
        result: null,
      }));
      return json(brand, 201);
    }

    case 'DELETE': {
      requireAuth(req);
      const id = idParam(req);
      const removed = await updateCollection('brands', (list) => {
        const found = list.find((b) => b.id === id);
        if (!found) throw new HttpError('Marca no encontrada.', 404);
        return { list: list.filter((b) => b.id !== id), result: found };
      });
      await deleteUploadedImages([removed.logo]);
      await updateCollection('articles', (arts) => ({
        list: arts.map((a) => (a.brandId === id ? { ...a, brandId: '' } : a)),
        result: null,
      }));
      return json({ ok: true });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
