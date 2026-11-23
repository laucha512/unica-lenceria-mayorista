// Detección de publicaciones repetidas en el admin.
// Compara las fotos (huella visual de 64 puntos: dos fotos iguales o casi iguales dan huellas casi iguales,
// aunque estén recortadas o comprimidas distinto) y los datos: título, descripción, marca, código,
// precio, curva de talles y colores. Las huellas se guardan en el navegador para no recalcularlas.

const HASH_CACHE_KEY = 'unica_huellas_fotos_v1';
const PHOTO_SAME = 4; // diferencia máxima (de 64) para "foto igual"
const PHOTO_SIMILAR = 10; // diferencia máxima para "foto muy parecida"
const PHOTOS_PER_ARTICLE = 2; // se comparan las 2 primeras fotos de cada publicación

/* ------------------------------------------------------------ Huella de las fotos */

let cache = null;
function hashCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(HASH_CACHE_KEY) || '{}');
  } catch {
    cache = {};
  }
  return cache;
}
function saveCache() {
  try {
    const entries = Object.entries(cache);
    // Tope para no llenar el almacenamiento del navegador.
    localStorage.setItem(HASH_CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(-3000))));
  } catch {
    /* sin almacenamiento: se recalcula la próxima vez */
  }
}

const isOwnImage = (src) => /^\/(api\/images\?|img\/)/.test(String(src || ''));
// Versión chiquita de la foto (la achica el servicio de imágenes de Netlify) para bajar poco.
const smallUrl = (src) => `/.netlify/images?url=${encodeURIComponent(src)}&w=32&h=32&fit=fill`;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Huella de 64 bits (en hexadecimal): compara el brillo de cada punto con el de al lado. */
async function computeHash(src) {
  let img;
  try {
    img = await loadImage(smallUrl(src));
  } catch {
    img = await loadImage(src); // sin servicio de imágenes (por ejemplo, en pruebas locales)
  }
  const canvas = document.createElement('canvas');
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 9, 8);
  const { data } = ctx.getImageData(0, 0, 9, 8);
  const gray = (x, y) => {
    const i = (y * 9 + x) * 4;
    return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  };
  let hex = '';
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (gray(x, y) > gray(x + 1, y) ? 1 : 0);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

const BITS = Array.from({ length: 16 }, (_, n) => (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1));
function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += BITS[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}

/** Calcula (o toma de lo guardado) la huella de cada foto. `onProgress(hechas, total)`. */
async function hashPhotos(srcs, onProgress) {
  const store = hashCache();
  const pending = srcs.filter((s) => !(s in store));
  let done = srcs.length - pending.length;
  onProgress?.(done, srcs.length);
  const queue = [...pending];
  const worker = async () => {
    while (queue.length) {
      const src = queue.shift();
      try {
        store[src] = await computeHash(src);
      } catch {
        store[src] = null; // foto que no se pudo leer: se compara solo por datos
      }
      done += 1;
      onProgress?.(done, srcs.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  if (pending.length) saveCache();
  return store;
}

/* ------------------------------------------------------------ Datos de texto */

const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set('de del la el los las y con sin para por en x un una pack packs unid unidad unidades art'.split(' '));
const words = (s) => new Set(plain(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));
const setOf = (list) => new Set((list || []).map((v) => plain(v).trim()).filter(Boolean));

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  a.forEach((x) => b.has(x) && common++);
  return common / (a.size + b.size - common);
}
const sameSet = (a, b) => a.size > 0 && a.size === b.size && [...a].every((x) => b.has(x));

/* ------------------------------------------------------------ Comparación */

export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Pares de publicaciones que parecen la misma, ordenados de más a menos parecidos.
 * `dismissed`: Set de pares marcados como "son distintas".
 */
export async function findDuplicates(articles, dismissed, onProgress) {
  const srcs = [...new Set(articles.flatMap((a) => (a.images || []).slice(0, PHOTOS_PER_ARTICLE)).filter(isOwnImage))];
  const hashes = await hashPhotos(srcs, onProgress);

  const items = articles.map((a) => ({
    a,
    brand: plain(a.brand).trim(),
    code: plain(a.code).trim(),
    title: words(a.title),
    desc: words(a.description),
    sizes: setOf(a.sizes),
    colors: setOf(a.colors),
    price: a.pricePack || a.priceUnit || 0,
    photos: (a.images || []).slice(0, PHOTOS_PER_ARTICLE).map((s) => hashes[s]).filter(Boolean),
  }));

  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const x = items[i];
      const y = items[j];
      if (dismissed.has(pairKey(x.a.id, y.a.id))) continue;

      let photo = Infinity;
      for (const h1 of x.photos) for (const h2 of y.photos) photo = Math.min(photo, hamming(h1, h2));
      const sameBrand = x.brand && x.brand === y.brand;
      const sameCode = sameBrand && x.code && x.code === y.code;
      const titleSim = jaccard(x.title, y.title);
      const descSim = x.desc.size >= 3 && y.desc.size >= 3 ? jaccard(x.desc, y.desc) : 0;
      const samePrice = x.price > 0 && x.price === y.price;
      const sameSizes = sameSet(x.sizes, y.sizes);
      const colorSim = jaccard(x.colors, y.colors);

      const photoMatch = photo <= PHOTO_SIMILAR;
      // Títulos genéricos ("Pack x 3 bombis") se repiten entre artículos distintos: si las dos tienen
      // código y es distinto, el parecido de datos no alcanza (solo avisa si la foto coincide).
      const differentCodes = x.code && y.code && x.code !== y.code;
      const dataMatch = !differentCodes && titleSim >= 0.75 && sameBrand && (samePrice || sameSizes || colorSim >= 0.8);
      if (!photoMatch && !sameCode && !dataMatch) continue;

      const reasons = [];
      if (photo <= PHOTO_SAME) reasons.push('Foto igual');
      else if (photoMatch) reasons.push('Foto muy parecida');
      if (sameCode) reasons.push('Mismo código');
      if (titleSim === 1) reasons.push('Mismo título');
      else if (titleSim >= 0.6) reasons.push('Título parecido');
      if (descSim >= 0.7) reasons.push('Descripción parecida');
      if (sameBrand) reasons.push('Misma marca');
      if (samePrice) reasons.push('Mismo precio');
      if (sameSizes) reasons.push('Misma curva de talles');
      if (colorSim >= 0.8) reasons.push('Mismos colores');

      // Puntaje para ordenar: la foto pesa más que todo lo demás.
      const score =
        (photoMatch ? 50 * (1 - photo / (PHOTO_SIMILAR + 1)) : 0) +
        (sameCode ? 20 : 0) +
        titleSim * 15 +
        descSim * 5 +
        (samePrice ? 5 : 0) +
        (sameSizes ? 3 : 0) +
        colorSim * 2;
      pairs.push({ a: x.a, b: y.a, key: pairKey(x.a.id, y.a.id), reasons, score });
    }
  }
  return pairs.sort((p, q) => q.score - p.score);
}
