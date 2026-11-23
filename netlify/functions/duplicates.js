// GET  /api/duplicates  -> pares de publicaciones marcados como "son distintas" (admin)
// POST /api/duplicates  -> { a, b }: marca un par como distinto, para que no vuelva a avisar (admin)
// La detección de repetidas se hace en el admin (src/admin/duplicates.js); acá solo se guarda la decisión.
import { error, handle, HttpError, json, readJson, requireAuth } from '../lib/http.js';
import { readCollection, updateCollection } from '../lib/store.js';

const ID_RE = /^[\w-]{1,64}$/;
const MAX_PAIRS = 5000;

export default handle(async (req) => {
  requireAuth(req);
  switch (req.method) {
    case 'GET':
      return json(await readCollection('duplicateDismissals'));

    case 'POST': {
      const { a, b } = await readJson(req, 1024);
      if (!ID_RE.test(String(a || '')) || !ID_RE.test(String(b || '')) || a === b) throw new HttpError('Par de publicaciones inválido.');
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      await updateCollection('duplicateDismissals', (list) => ({
        list: list.includes(key) ? list : [...list, key].slice(-MAX_PAIRS),
        result: null,
      }));
      return json({ ok: true, key });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
