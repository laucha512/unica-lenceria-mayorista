// Subcategorías (Conjuntos, Bikinis…), cada una dentro de una categoría principal.
// GET    /api/subcategories[?categoryId=]   -> lista ordenada (admin: todas; público: activas)
// POST   /api/subcategories                 -> crea                                   (admin)
// POST   /api/subcategories?action=reorder  -> { categoryId, ids: [...] }              (admin)
// PUT    /api/subcategories?id=ID           -> renombra / mueve de categoría / orden / activa (admin)
// DELETE /api/subcategories?id=ID           -> elimina; sus productos quedan sin categoría (admin)
import { randomUUID } from 'node:crypto';
import { error, handle, HttpError, idParam, isAuthed, json, readJson, requireAuth } from '../lib/http.js';
import { readCollection, updateCollection } from '../lib/store.js';
import { uniqueSlug } from '../lib/taxonomy.js';
import { validateIdList, validateSubcategory } from '../lib/validate.js';

const byOrder = (a, b) => a.order - b.order;

async function assertCategory(categoryId) {
  const cats = await readCollection('categories');
  if (!cats.some((c) => c.id === categoryId)) throw new HttpError('La categoría principal no existe.', 400);
}

export default handle(async (req) => {
  const params = new URL(req.url).searchParams;

  switch (req.method) {
    case 'GET': {
      const categoryId = params.get('categoryId');
      let list = (await readCollection('subcategories')).sort(byOrder);
      if (categoryId) list = list.filter((s) => s.categoryId === categoryId);
      return json(isAuthed(req) ? list : list.filter((s) => s.isActive));
    }

    case 'POST': {
      requireAuth(req);
      const body = await readJson(req);

      if (params.get('action') === 'reorder') {
        const ids = validateIdList(body);
        const categoryId = String(body.categoryId || '');
        const list = await updateCollection('subcategories', (subs) => {
          const group = subs.filter((s) => s.categoryId === categoryId);
          if (!group.length || ids.length !== group.length || !group.every((s) => ids.includes(s.id))) {
            throw new HttpError('La lista de orden no coincide con las subcategorías de esa categoría.', 409);
          }
          const next = subs.map((s) => (s.categoryId === categoryId ? { ...s, order: ids.indexOf(s.id) + 1 } : s));
          return { list: next, result: next.filter((s) => s.categoryId === categoryId).sort(byOrder) };
        });
        return json(list);
      }

      const data = validateSubcategory({ isActive: true, order: 0, ...body });
      await assertCategory(data.categoryId);
      const sub = await updateCollection('subcategories', (subs) => {
        if (subs.length >= 500) throw new HttpError('Se alcanzó el máximo de 500 subcategorías.', 409);
        const siblings = subs.filter((s) => s.categoryId === data.categoryId);
        if (siblings.some((s) => s.name.toLowerCase() === data.name.toLowerCase())) {
          throw new HttpError(`"${data.name}" ya existe en esa categoría.`, 409);
        }
        const item = {
          id: `sub-${randomUUID()}`,
          categoryId: data.categoryId,
          name: data.name,
          slug: uniqueSlug(data.slug || data.name, siblings),
          order: body.order !== undefined ? data.order : Math.max(0, ...siblings.map((s) => s.order)) + 1,
          isActive: data.isActive,
        };
        return { list: [...subs, item], result: item };
      });
      return json(sub, 201);
    }

    case 'PUT': {
      requireAuth(req);
      const id = idParam(req);
      const changes = validateSubcategory(await readJson(req), { partial: true });
      if (changes.categoryId) await assertCategory(changes.categoryId);
      const sub = await updateCollection('subcategories', (subs) => {
        const i = subs.findIndex((s) => s.id === id);
        if (i === -1) throw new HttpError('Subcategoría no encontrada.', 404);
        const prev = subs[i];
        const next = { ...prev, ...changes };
        const siblings = subs.filter((s) => s.categoryId === next.categoryId && s.id !== id);
        if (siblings.some((s) => s.name.toLowerCase() === next.name.toLowerCase())) {
          throw new HttpError(`"${next.name}" ya existe en esa categoría.`, 409);
        }
        const moved = next.categoryId !== prev.categoryId;
        // Al mover de categoría va al final de la nueva, salvo que se indique el orden.
        if (moved && !('order' in changes)) next.order = Math.max(0, ...siblings.map((s) => s.order)) + 1;
        if (moved || 'slug' in changes || 'name' in changes) next.slug = uniqueSlug(changes.slug || next.name, siblings);
        subs[i] = next;
        return { list: subs, result: next };
      });
      return json(sub);
    }

    case 'DELETE': {
      requireAuth(req);
      const id = idParam(req);
      const removed = await updateCollection('subcategories', (subs) => {
        const found = subs.find((s) => s.id === id);
        if (!found) throw new HttpError('Subcategoría no encontrada.', 404);
        return { list: subs.filter((s) => s.id !== id), result: found };
      });
      const unassigned = await updateCollection('articles', (arts) => {
        let n = 0;
        const next = arts.map((a) => (a.subcategoryId === id ? (n++, { ...a, subcategoryId: '' }) : a));
        return { list: next, result: n };
      });
      return json({ ok: true, removed: removed.name, productsUnassigned: unassigned });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
