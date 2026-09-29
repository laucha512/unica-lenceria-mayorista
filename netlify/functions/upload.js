// POST /api/upload  (admin)  body: bytes de la imagen, Content-Type: image/webp | image/jpeg | image/png
// -> { url: "/api/images?key=..." }
// El panel ya redimensiona a ~1200 px en el navegador; acá se valida tipo real (magic bytes) y peso.
import { randomBytes } from 'node:crypto';
import { error, handle, json, requireAuth } from '../lib/http.js';
import { imageStore } from '../lib/store.js';

const MAX_BYTES = 4 * 1024 * 1024;

const TYPES = {
  'image/webp': { ext: 'webp', check: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  'image/jpeg': { ext: 'jpg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', check: (b) => b.readUInt32BE(0) === 0x89504e47 },
};

export default handle(async (req) => {
  if (req.method !== 'POST') return error('Método no permitido.', 405);
  requireAuth(req);

  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const spec = TYPES[type];
  if (!spec) return error('Formato no permitido. Usá JPG, PNG o WebP.', 415);

  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) return error('La imagen supera los 4 MB.', 413);

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return error('No se recibió ninguna imagen.', 400);
  if (buf.length > MAX_BYTES) return error('La imagen supera los 4 MB.', 413);
  if (buf.length < 12 || !spec.check(buf)) return error('El archivo no es una imagen válida.', 415);

  const key = `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}.${spec.ext}`;
  await imageStore().set(key, buf, { metadata: { contentType: type, size: buf.length } });
  return json({ url: `/api/images?key=${key}` }, 201);
});
