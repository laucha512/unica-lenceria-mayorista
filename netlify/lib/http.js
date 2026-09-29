// Helpers HTTP compartidos por las Netlify Functions.
import { verifyToken } from './auth.js';

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...headers } });

export const error = (message, status = 400) => json({ error: message }, status);

export class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Devuelve true si la request trae un token de admin válido. */
export function isAuthed(req) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return !!(m && verifyToken(m[1]));
}

export function requireAuth(req) {
  if (!isAuthed(req)) throw new HttpError('Sesión inválida o vencida. Volvé a ingresar.', 401);
}

/** Lee y parsea JSON del body con límite de tamaño. */
export async function readJson(req, maxBytes = 64 * 1024) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError('El cuerpo de la solicitud es demasiado grande.', 413);
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError('El cuerpo de la solicitud es demasiado grande.', 413);
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new HttpError('JSON inválido.', 400);
  }
}

/** Envuelve un handler para convertir HttpError (y errores inesperados) en respuestas JSON. */
export const handle = (fn) => async (req, context) => {
  try {
    return await fn(req, context);
  } catch (err) {
    if (err instanceof HttpError) return error(err.message, err.status);
    console.error(err);
    return error('Error interno del servidor.', 500);
  }
};

export const idParam = (req) => {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[\w-]{1,64}$/.test(id)) throw new HttpError('Parámetro id inválido.', 400);
  return id;
};
