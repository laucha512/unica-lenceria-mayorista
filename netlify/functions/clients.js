// GET /api/clients               -> datos cargados a mano para cada cliente (admin)
// GET /api/clients?phone=549...  -> { name, city } de ese cliente, si el admin los cargó (público, para la tienda)
// PUT /api/clients?phone=549...  -> { name, city, notes }: los guarda (admin). Tienen prioridad sobre lo que escribió en el pedido.
import { error, handle, HttpError, json, readJson, requireAuth } from '../lib/http.js';
import { readCollection, updateCollection } from '../lib/store.js';

const field = (v, max, label) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (s.length > max) throw new HttpError(`${label} admite hasta ${max} caracteres.`);
  return s;
};

export default handle(async (req) => {
  // Público: la tienda completa nombre y localidad con lo que cargó el admin para ese WhatsApp.
  const lookup = req.method === 'GET' && new URL(req.url).searchParams.get('phone');
  if (lookup) {
    if (!/^\d{8,15}$/.test(lookup)) throw new HttpError('WhatsApp inválido.');
    // Primero lo editado en Clientes; si no, lo de su último pedido.
    const edited = (await readCollection('clients')).find((x) => x.phone === lookup) || {};
    const last = (await readCollection('orders'))
      .filter((o) => o.phone === lookup)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]?.info || {};
    const name = edited.name || last.name || '';
    const city = edited.city || last.city || '';
    return json(name || city ? { name, city } : {});
  }
  requireAuth(req);
  switch (req.method) {
    case 'GET':
      return json(await readCollection('clients'));

    case 'PUT': {
      const phone = new URL(req.url).searchParams.get('phone') || '';
      if (!/^\d{8,15}$/.test(phone)) throw new HttpError('WhatsApp inválido.');
      const body = await readJson(req, 4096);
      const data = {
        phone,
        name: field(body.name, 80, 'El nombre'),
        city: field(body.city, 80, 'La localidad'),
        notes: field(body.notes, 1000, 'Las notas'),
        updatedAt: new Date().toISOString(),
      };
      await updateCollection('clients', (list) => {
        const rest = list.filter((c) => c.phone !== phone);
        if (rest.length >= 5000) throw new HttpError('Se alcanzó el máximo de clientes guardados.', 409);
        return { list: [...rest, data], result: data };
      });
      return json(data);
    }

    default:
      return error('Método no permitido.', 405);
  }
});
