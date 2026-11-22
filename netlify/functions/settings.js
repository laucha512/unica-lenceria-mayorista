// GET /api/settings -> datos de contacto públicos (WhatsApp)
// PUT /api/settings -> cambia el WhatsApp (admin); se aplica en toda la web
import { error, handle, json, readJson, requireAuth } from '../lib/http.js';
import { readContact, updateCollection } from '../lib/store.js';
import { validateContact } from '../lib/validate.js';

export default handle(async (req) => {
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
