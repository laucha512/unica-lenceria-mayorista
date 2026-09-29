// Validación de inputs del admin. Todo lo que llega del cliente pasa por acá.
import { HttpError } from './http.js';

const IMAGE_URL_RE = /^(\/img\/[\w.-]+|\/api\/images\?key=[\w.-]+)$/;

const clean = (v) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function text(obj, key, { label, min = 0, max, required = false }) {
  const raw = obj[key];
  if (raw === undefined || raw === null) {
    if (required) throw new HttpError(`${label} es obligatorio.`);
    return '';
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') throw new HttpError(`${label} no es válido.`);
  const v = clean(raw);
  if (required && !v) throw new HttpError(`${label} es obligatorio.`);
  if (v && v.length < min) throw new HttpError(`${label} debe tener al menos ${min} caracteres.`);
  if (v.length > max) throw new HttpError(`${label} admite hasta ${max} caracteres.`);
  return v;
}

function list(obj, key, { label, maxItems, maxLen }) {
  const raw = obj[key] ?? [];
  if (!Array.isArray(raw)) throw new HttpError(`${label} debe ser una lista.`);
  if (raw.length > maxItems) throw new HttpError(`${label}: máximo ${maxItems} elementos.`);
  const out = [];
  for (const item of raw) {
    if (typeof item !== 'string') throw new HttpError(`${label}: valor inválido.`);
    const v = clean(item);
    if (!v) continue;
    if (v.length > maxLen) throw new HttpError(`${label}: cada valor admite hasta ${maxLen} caracteres.`);
    if (!out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
}

function price(obj, key, label, { optional = false } = {}) {
  if (optional && (obj[key] === undefined || obj[key] === null || obj[key] === '')) return 0;
  const n = Number(obj[key]);
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000) throw new HttpError(`${label} debe ser un número entre 0 y 100.000.000.`);
  return Math.round(n);
}

function bool(obj, key, label) {
  if (typeof obj[key] !== 'boolean') throw new HttpError(`${label} debe ser verdadero o falso.`);
  return obj[key];
}

function images(obj, key, max) {
  const raw = obj[key] ?? [];
  if (!Array.isArray(raw)) throw new HttpError('Las imágenes deben ser una lista.');
  if (raw.length > max) throw new HttpError(`Máximo ${max} fotos.`);
  raw.forEach((u) => {
    if (typeof u !== 'string' || !IMAGE_URL_RE.test(u)) throw new HttpError('URL de imagen inválida.');
  });
  return [...new Set(raw)];
}

function imageUrl(obj, key, { required = false } = {}) {
  const v = obj[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError('La imagen es obligatoria.');
    return '';
  }
  if (typeof v !== 'string' || !IMAGE_URL_RE.test(v)) throw new HttpError('URL de imagen inválida.');
  return v;
}

/** Aplica solo los campos presentes (para PUT parcial); en creación exige los obligatorios. */
function pick(body, rules, { partial }) {
  const out = {};
  for (const [key, rule] of Object.entries(rules)) {
    if (partial && !(key in body)) continue;
    out[key] = rule(body);
  }
  return out;
}

export function validateArticle(body, { partial = false } = {}) {
  return pick(
    body,
    {
      brand: (b) => text(b, 'brand', { label: 'La marca', max: 60, required: true }),
      code: (b) => text(b, 'code', { label: 'El código de artículo', max: 30 }),
      title: (b) => text(b, 'title', { label: 'El título', min: 3, max: 200, required: true }),
      description: (b) => text(b, 'description', { label: 'La descripción', max: 1000 }),
      sizes: (b) => list(b, 'sizes', { label: 'Talles', maxItems: 20, maxLen: 20 }),
      colors: (b) => list(b, 'colors', { label: 'Colores', maxItems: 20, maxLen: 30 }),
      presentation: (b) => text(b, 'presentation', { label: 'La presentación', max: 40, required: true }),
      saleType: (b) => text(b, 'saleType', { label: 'El tipo de venta', max: 200 }),
      tag: (b) => text(b, 'tag', { label: 'La etiqueta', max: 30 }),
      priceUnit: (b) => price(b, 'priceUnit', 'El precio por unidad', { optional: true }),
      pricePack: (b) => price(b, 'pricePack', 'El precio del pack'),
      isNew: (b) => bool(b, 'isNew', 'Novedad'),
      inStock: (b) => bool(b, 'inStock', 'Stock'),
      images: (b) => images(b, 'images', 5),
      subcategoryId: (b) => optionalId(b, 'subcategoryId', 'La subcategoría'),
    },
    { partial }
  );
}

/** Id opcional ('' = sin asignar). La existencia real la verifica la función que lo usa. */
function optionalId(obj, key, label) {
  const v = obj[key];
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || !/^[\w-]{1,80}$/.test(v)) throw new HttpError(`${label} no es válida.`);
  return v;
}

function requiredId(obj, key, label) {
  const v = optionalId(obj, key, label);
  if (!v) throw new HttpError(`${label} es obligatoria.`);
  return v;
}

function order(obj, key) {
  const n = Number(obj[key]);
  if (!Number.isInteger(n) || n < 0 || n > 10000) throw new HttpError('El orden debe ser un número entero entre 0 y 10000.');
  return n;
}

function slugField(obj, key) {
  const v = obj[key];
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) || v.length > 60) {
    throw new HttpError('El slug solo admite minúsculas, números y guiones (máx. 60).');
  }
  return v;
}

export function validateCategory(body, { partial = false } = {}) {
  return pick(
    body,
    {
      name: (b) => text(b, 'name', { label: 'El nombre de la categoría', min: 2, max: 40, required: true }),
      slug: (b) => slugField(b, 'slug'),
      order: (b) => order(b, 'order'),
      isActive: (b) => bool(b, 'isActive', 'Activa'),
    },
    { partial }
  );
}

export function validateSubcategory(body, { partial = false } = {}) {
  return pick(
    body,
    {
      categoryId: (b) => requiredId(b, 'categoryId', 'La categoría principal'),
      name: (b) => text(b, 'name', { label: 'El nombre de la subcategoría', min: 2, max: 40, required: true }),
      slug: (b) => slugField(b, 'slug'),
      order: (b) => order(b, 'order'),
      isActive: (b) => bool(b, 'isActive', 'Activa'),
    },
    { partial }
  );
}

/** Lista de ids para reordenar (se valida que coincidan con los existentes en la función). */
export function validateIdList(body, key = 'ids') {
  const v = body[key];
  if (!Array.isArray(v) || !v.length || v.length > 200 || v.some((x) => typeof x !== 'string' || !/^[\w-]{1,80}$/.test(x))) {
    throw new HttpError('Lista de orden inválida.');
  }
  if (new Set(v).size !== v.length) throw new HttpError('La lista de orden tiene elementos repetidos.');
  return v;
}

export function validateBrand(body) {
  const name = text(body, 'name', { label: 'El nombre de la marca', min: 2, max: 40, required: true });
  const category = text(body, 'category', { label: 'La categoría', min: 2, max: 50, required: true });
  const initials = text(body, 'initials', { label: 'Las siglas', max: 3 }).toUpperCase();
  if (initials && !/^[A-Z0-9ÁÉÍÓÚÑ]{1,3}$/.test(initials)) throw new HttpError('Las siglas deben ser de 1 a 3 letras o números.');
  return { name, category, initials, logo: imageUrl(body, 'logo') };
}

export function validateBanner(body, { partial = false } = {}) {
  return pick(
    body,
    {
      type: (b) => {
        if (!['hero', 'promo', 'category'].includes(b.type)) throw new HttpError('Tipo de portada inválido.');
        return b.type;
      },
      label: (b) => text(b, 'label', { label: 'La etiqueta', max: 40, required: true }),
      title: (b) => text(b, 'title', { label: 'El título', min: 3, max: 90, required: true }),
      description: (b) => text(b, 'description', { label: 'La descripción', max: 240 }),
      alt: (b) => text(b, 'alt', { label: 'El texto alternativo', max: 160 }),
      format: (b) => text(b, 'format', { label: 'El formato', max: 80 }),
      image: (b) => imageUrl(b, 'image', { required: true }),
      active: (b) => bool(b, 'active', 'Activo'),
    },
    { partial }
  );
}
