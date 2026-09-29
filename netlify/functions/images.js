// GET /api/images?key=KEY -> sirve una imagen subida desde el store de Blobs.
// Las claves son únicas e inmutables (un reemplazo genera otra clave), así que se cachean 1 año.
import { handle, error } from '../lib/http.js';
import { imageStore } from '../lib/store.js';

const ALLOWED = new Set(['image/webp', 'image/jpeg', 'image/png']);

export default handle(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return error('Método no permitido.', 405);
  const key = new URL(req.url).searchParams.get('key') || '';
  if (!/^[\w.-]{1,80}$/.test(key)) return error('Clave inválida.', 400);

  const entry = await imageStore().getWithMetadata(key, { type: 'arrayBuffer' });
  if (!entry) return error('Imagen no encontrada.', 404);

  const type = ALLOWED.has(entry.metadata?.contentType) ? entry.metadata.contentType : 'application/octet-stream';
  return new Response(req.method === 'HEAD' ? null : entry.data, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Netlify-CDN-Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      ...(entry.etag ? { ETag: entry.etag } : {}),
    },
  });
});
