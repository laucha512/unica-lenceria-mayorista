// Utilidades compartidas entre la tienda y el panel admin.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** Escapa texto para insertarlo en HTML (contenido o atributos entre comillas). */
export const esc = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);

// Solo se aceptan imágenes locales (/img/...), subidas (/api/images?key=...) o blobs de previsualización.
const IMG_RE = /^(\/img\/[\w.-]+|\/api\/images\?key=[\w.-]+|blob:[\w:/.-]+)$/;
export const safeImg = (url, fallback = '/img/logo-unica.webp') => (IMG_RE.test(String(url || '')) ? url : fallback);

/**
 * Resume talles: listas largas de números se muestran "90 al 120";
 * el resto separadas por guiones como en el diseño.
 */
export function formatSizes(sizes = []) {
  if (!sizes.length) return 'Consultar';
  // Talles con número (85, 1(S), 80/85) forman el rango; palabras como "Especiales" van aparte.
  const core = sizes.filter((s) => /\d/.test(s));
  if (sizes.length > 4 && core.length >= 4) {
    const extra = sizes.filter((s) => !/\d/.test(s));
    return `${core[0]} al ${core[core.length - 1]}${extra.length ? ` (${extra.join(', ')})` : ''}`;
  }
  return sizes.join(' - ');
}

/** Siglas autom\u00e1ticas: "Lara Teens" -> "LT", "Sigry" -> "SI". */
export function initials(name = '') {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const out = words.length === 1 ? words[0].slice(0, 2) : words.map((w) => w[0]).join('').slice(0, 2);
  return (out || name.slice(0, 2) || 'MA').toUpperCase();
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** fetch a la API con JSON y token opcional. Lanza ApiError con el mensaje del servidor. */
export async function api(path, { method = 'GET', body, token, headers = {}, raw = false } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body !== undefined && !raw) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api/${path}`, { method, headers: h, body: payload });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Revisá tu conexión.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || `Error ${res.status}`, res.status);
  return data;
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
