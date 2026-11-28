// GET /api/settings            -> datos de contacto públicos (WhatsApp e Instagram)
// PUT /api/settings            -> cambia el WhatsApp y el Instagram (admin); se aplica en toda la web
// GET /api/settings?social=1   -> temporada de ideas de Redes en uso (admin)
// PUT /api/settings?social=1   -> { season }: pasa a otra temporada y reinicia el contador de semanas (admin)
import { error, handle, HttpError, json, readJson, requireAuth } from '../lib/http.js';
import { readCollection, readContact, updateCollection } from '../lib/store.js';
import { validateContact } from '../lib/validate.js';

export default handle(async (req) => {
  const social = new URL(req.url).searchParams.has('social');
  if (social) {
    requireAuth(req);
    if (req.method === 'GET') {
      const row = (await readCollection('settings')).find((r) => r.id === 'social');
      return json(row || { id: 'social', season: 0, startedAt: null });
    }
    if (req.method === 'PUT') {
      const season = Number((await readJson(req, 1024)).season);
      if (!Number.isInteger(season) || season < 0 || season > 50) throw new HttpError('Temporada inválida.');
      const row = { id: 'social', season, startedAt: new Date().toISOString() };
      await updateCollection('settings', (list) => ({ list: [...list.filter((r) => r.id !== 'social'), row], result: row }));
      return json(row);
    }
    return error('Método no permitido.', 405);
  }
  switch (req.method) {
    case 'GET':
      return json(await readContact());

    case 'PUT': {
      requireAuth(req);
      const data = validateContact(await readJson(req));
      const contact = { id: 'contact', ...data, updatedAt: new Date().toISOString() };
      await updateCollection('settings', (list) => ({ list: [contact, ...list.filter((r) => r.id !== 'contact')], result: contact }));
      return json(data);
    }

    default:
      return error('Método no permitido.', 405);
  }
});
