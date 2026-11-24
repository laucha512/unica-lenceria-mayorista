// GET    /api/staff          -> personal (empleadas que arman pedidos) (admin)
// POST   /api/staff          -> { name }: agrega (admin)
// PUT    /api/staff?id=ID    -> { name }: cambia el nombre (admin)
// DELETE /api/staff?id=ID    -> quita (admin). Los pedidos que armó conservan su nombre.
import { randomUUID } from 'node:crypto';
import { error, handle, HttpError, idParam, json, readJson, requireAuth } from '../lib/http.js';
import { readCollection, updateCollection } from '../lib/store.js';

const cleanName = (v) => {
  const name = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 40) throw new HttpError('El nombre tiene que tener entre 2 y 40 letras.');
  return name;
};

export default handle(async (req) => {
  requireAuth(req);
  switch (req.method) {
    case 'GET':
      return json(await readCollection('staff'));

    case 'POST': {
      const name = cleanName((await readJson(req, 1024)).name);
      const person = { id: `staff-${randomUUID()}`, name, createdAt: new Date().toISOString() };
      await updateCollection('staff', (list) => {
        if (list.length >= 50) throw new HttpError('Se alcanzó el máximo de 50 personas.', 409);
        if (list.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new HttpError('Ya hay alguien con ese nombre.', 409);
        return { list: [...list, person], result: person };
      });
      return json(person, 201);
    }

    case 'PUT': {
      const id = idParam(req);
      const name = cleanName((await readJson(req, 1024)).name);
      const person = await updateCollection('staff', (list) => {
        const i = list.findIndex((p) => p.id === id);
        if (i === -1) throw new HttpError('No se encontró a esa persona.', 404);
        if (list.some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) throw new HttpError('Ya hay alguien con ese nombre.', 409);
        list[i] = { ...list[i], name };
        return { list, result: list[i] };
      });
      return json(person);
    }

    case 'DELETE': {
      const id = idParam(req);
      await updateCollection('staff', (list) => {
        if (!list.some((p) => p.id === id)) throw new HttpError('No se encontró a esa persona.', 404);
        return { list: list.filter((p) => p.id !== id), result: null };
      });
      return json({ ok: true });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
