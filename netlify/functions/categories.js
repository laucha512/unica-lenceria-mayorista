// Categorías principales (Mujeres, Hombre, Niño/a…)
// GET    /api/categories                  -> todas (admin) o activas (público), ordenadas
// POST   /api/categories                  -> crea                          (admin)
// POST   /api/categories?action=reorder   -> { ids: [...] } nuevo orden     (admin)
// PUT    /api/categories?id=ID            -> renombra / slug / orden / activa (admin)
// DELETE /api/categories?id=ID            -> elimina con sus subcategorías; los productos
//                                            quedan sin categoría          (admin)
import { randomUUID } from 'node:crypto';
import { error, handle, HttpError, idParam, isAuthed, json, readJson, requireAuth } from '../lib/http.js';
import { readCollection, updateCollection } from '../lib/store.js';
import { uniqueSlug } from '../lib/taxonomy.js';
import { validateCategory, validateIdList } from '../lib/validate.js';

const byOrder = (a, b) => a.order - b.order;

export default handle(async (req) => {
  const params = new URL(req.url).searchParams;

  switch (req.method) {
    case 'GET': {
      const list = (await readCollection('categories')).sort(byOrder);
      return json(isAuthed(req) ? list : list.filter((c) => c.isActive));
    }

    case 'POST': {
      requireAuth(req);
      const body = await readJson(req);

      if (params.get('action') === 'reorder') {
        const ids = validateIdList(body);
        const list = await updateCollection('categories', (cats) => {
          if (ids.length !== cats.length || !cats.every((c) => ids.includes(c.id))) {
            throw new HttpError('La lista de orden no coincide con las categorías actuales.', 409);
          }
          const next = cats.map((c) => ({ ...c, order: ids.indexOf(c.id) + 1 }));
          return { list: next, result: next.sort(byOrder) };
        });
        return json(list);
      }

      const data = validateCategory({ isActive: true, order: 0, ...body });
      const category = await updateCollection('categories', (cats) => {
        if (cats.length >= 50) throw new HttpError('Se alcanzó el máximo de 50 categorías.', 409);
        if (cats.some((c) => c.name.toLowerCase() === data.name.toLowerCase())) {
          throw new HttpError(`Ya existe la categoría "${data.name}".`, 409);
        }
        const item = {
          id: `cat-${randomUUID()}`,
          name: data.name,
          slug: uniqueSlug(data.slug || data.name, cats),
          order: body.order !== undefined ? data.order : Math.max(0, ...cats.map((c) => c.order)) + 1,
          isActive: data.isActive,
        };
        return { list: [...cats, item], result: item };
      });
      return json(category, 201);
    }

    case 'PUT': {
      requireAuth(req);
      const id = idParam(req);
      const changes = validateCategory(await readJson(req), { partial: true });
      const category = await updateCollection('categories', (cats) => {
        const i = cats.findIndex((c) => c.id === id);
        if (i === -1) throw new HttpError('Categoría no encontrada.', 404);
        if (changes.name && cats.some((c) => c.id !== id && c.name.toLowerCase() === changes.name.toLowerCase())) {
          throw new HttpError(`Ya existe la categoría "${changes.name}".`, 409);
        }
        const next = { ...cats[i], ...changes };
        // El slug se regenera al renombrar salvo que se envíe uno explícito.
        if ('slug' in changes || 'name' in changes) next.slug = uniqueSlug(changes.slug || next.name, cats, id);
        cats[i] = next;
        return { list: cats, result: next };
      });
      return json(category);
    }

    case 'DELETE': {
      requireAuth(req);
      const id = idParam(req);
      const removed = await updateCollection('categories', (cats) => {
        const found = cats.find((c) => c.id === id);
        if (!found) throw new HttpError('Categoría no encontrada.', 404);
        return { list: cats.filter((c) => c.id !== id), result: found };
      });
      // Cascada: se eliminan sus subcategorías y los productos quedan "sin categoría".
      const subIds = await updateCollection('subcategories', (subs) => {
        const gone = subs.filter((s) => s.categoryId === id).map((s) => s.id);
        return { list: subs.filter((s) => s.categoryId !== id), result: gone };
      });
      let unassigned = 0;
      if (subIds.length) {
        unassigned = await updateCollection('articles', (arts) => {
          let n = 0;
          const next = arts.map((a) => (subIds.includes(a.subcategoryId) ? (n++, { ...a, subcategoryId: '' }) : a));
          return { list: next, result: n };
        });
      }
      return json({ ok: true, removed: removed.name, subcategoriesRemoved: subIds.length, productsUnassigned: unassigned });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
