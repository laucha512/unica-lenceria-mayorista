// POST /api/stats  -> { id }: suma una vista a la ficha de un artículo (público, anónimo)
// GET  /api/stats  -> vistas de los últimos 30 días por artículo y por día (admin)
// Se guarda un archivo chico por día ("vistas-AAAA-MM-DD": { idArticulo: cantidad }) en el store "stats".
import { getStore } from '@netlify/blobs';
import { error, handle, HttpError, json, readJson, requireAuth } from '../lib/http.js';

const statsStore = () => getStore({ name: 'stats', consistency: 'strong' });
const DAYS = 30;
const MAX_IDS_PER_DAY = 3000;

/** Fecha en Argentina (AAAA-MM-DD), para que el día cambie a la medianoche de acá. */
const dayOf = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(date);

async function addView(id) {
  const store = statsStore();
  const key = `vistas-${dayOf(new Date())}`;
  // Varias personas pueden sumar a la vez: se reintenta si otro guardó primero.
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await store.getWithMetadata(key, { type: 'json' });
    const counts = current?.data || {};
    if (!(id in counts) && Object.keys(counts).length >= MAX_IDS_PER_DAY) return;
    counts[id] = (counts[id] || 0) + 1;
    const res = current
      ? await store.setJSON(key, counts, { onlyIfMatch: current.etag })
      : await store.setJSON(key, counts, { onlyIfNew: true });
    if (res.modified !== false) return;
  }
}

export default handle(async (req) => {
  switch (req.method) {
    case 'POST': {
      const { id } = await readJson(req, 512);
      if (!/^[\w-]{1,64}$/.test(String(id || ''))) throw new HttpError('Artículo inválido.');
      await addView(id);
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }

    case 'GET': {
      requireAuth(req);
      const store = statsStore();
      const days = Array.from({ length: DAYS }, (_, i) => dayOf(new Date(Date.now() - i * 86400000)));
      const files = await Promise.all(days.map((d) => store.get(`vistas-${d}`, { type: 'json' }).catch(() => null)));
      const byArticle = {};
      const byDay = {};
      files.forEach((counts, i) => {
        if (!counts) return;
        let total = 0;
        for (const [id, n] of Object.entries(counts)) {
          byArticle[id] = (byArticle[id] || 0) + n;
          total += n;
        }
        byDay[days[i]] = total;
      });
      const since = Object.keys(byDay).sort()[0] || null;
      return json({ days: DAYS, since, byArticle, byDay });
    }

    default:
      return error('Método no permitido.', 405);
  }
});
