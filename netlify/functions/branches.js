// GET    /api/branches          -> activas (público) o todas (admin); la Casa Central va primero
// POST   /api/branches          -> crea sucursal (admin)
// PUT    /api/branches?id=ID    -> edita datos / descripción / horarios / activa (admin)
// DELETE /api/branches?id=ID    -> elimina (admin)
// Regla: solo una sucursal puede ser Casa Central; marcar una desmarca las demás.
import { randomUUID } from 'node:crypto';
import { error, handle, HttpError, idParam, isAuthed, json, readJson, requireAuth } from '../lib/http.js';
import { readCollection, updateCollection } from '../lib/store.js';
import { validateBranch } from '../lib/validate.js';

function enforceSingleMain(list, keepId) {
  const keep = list.find((b) => b.id === keepId);
  if (!keep?.isMain) return list;
  return list.map((b) => (b.id !== keepId && b.isMain ? { ...b, isMain: false } : b));
}

const mainFirst = (list) => [...list].sort((a, b) => Number(b.isMain) - Number(a.isMain));

export default handle(async (req) => {
  switch (req.method) {
    case 'GET': {
      const list = mainFirst(await readCollection('branches'));
      return json(isAuthed(req) ? list : list.filter((b) => b.active));
    }

    case 'POST': {
      requireAuth(req);
      const data = validateBranch(await readJson(req));
      const branch = { id: `branch-${randomUUID()}`, ...data, updatedAt: new Date().toISOString() };
      await updateCollection('branches', (list) => {
        if (list.length >= 20) throw new HttpError('Se alcanzó el máximo de 20 sucursales.', 409);
        return { list: enforceSingleMain([...list, branch], branch.id), result: branch };
      });
      return json(branch, 201);
    }

    case 'PUT': {
      requireAuth(req);
      const id = idParam(req);
      const changes = validateBranch(await readJson(req), { partial: true });
      const branch = await updateCollection('branches', (list) => {
        const i = list.findIndex((b) => b.id === id);
        if (i === -1) throw new HttpError('Sucursal no encontrada.', 404);
        list[i] = { ...list[i], ...changes, updatedAt: new Date().toISOString() };
        const next = enforceSingleMain(list, id);
        return { list: next, result: next.find((b) => b.id === id) };
      });
      return json(branch);
    }

    case 'DELETE': {
      requireAuth(req);
      const id = idParam(req);
      await updateCollection('branches', (list) => {
        if (!list.some((b) => b.id === id)) throw new HttpError('Sucursal no encontrada.', 404);
        return { list: list.filter((b) => b.id !== id), result: null };
      });
      return json({ ok: true });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
