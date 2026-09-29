// POST /api/auth  { password }  -> { token, expiresAt }
// GET  /api/auth  (Authorization: Bearer ...) -> { ok: true } si el token sigue siendo válido
import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { createToken, passwordMatches } from '../lib/auth.js';
import { error, handle, isAuthed, json, readJson } from '../lib/http.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;

// Límite de intentos fallidos por IP (ventana de 15 min) guardado en Blobs.
const limits = () => getStore({ name: 'auth-limits', consistency: 'strong' });
const ipKey = (ip) => createHash('sha256').update(String(ip || 'desconocida')).digest('hex').slice(0, 32);

async function getFails(key) {
  const rec = await limits().get(key, { type: 'json' });
  if (!rec || Date.now() - rec.first > WINDOW_MS) return { count: 0, first: Date.now() };
  return rec;
}

export default handle(async (req, context) => {
  if (req.method === 'GET') {
    return isAuthed(req) ? json({ ok: true }) : error('Sesión inválida o vencida.', 401);
  }
  if (req.method !== 'POST') return error('Método no permitido.', 405);

  const key = ipKey(context?.ip);
  const fails = await getFails(key);
  if (fails.count >= MAX_FAILS) {
    return error('Demasiados intentos. Esperá unos minutos y volvé a probar.', 429);
  }

  const { password } = await readJson(req, 2048);
  if (typeof password !== 'string' || !password || password.length > 200) {
    return error('Ingresá la contraseña.', 400);
  }

  if (!passwordMatches(password)) {
    await limits().setJSON(key, { count: fails.count + 1, first: fails.first });
    await new Promise((r) => setTimeout(r, 400)); // frena ataques de fuerza bruta
    return error('Contraseña incorrecta.', 401);
  }

  await limits().delete(key);
  return json(createToken());
});
