// Recuperar artículos desde una copia de seguridad (el Excel de "Descargar copia de seguridad").
// Lee la hoja "Artículos", la compara con el catálogo actual (marca + código + título) y devuelve
// los que están en la copia pero ya no en la web. Funciona también si el Excel se abrió y guardó con Excel.
import { SITE_URL } from '../config.js';

/* ------------------------------------------------------------ Leer el .xlsx (es un .zip) */

async function unzip(buffer) {
  const view = new DataView(buffer);
  let end = buffer.byteLength - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('El archivo no es un Excel válido.');
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buffer, p + 46, nameLen));
    files.set(name, { method, size, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const read = async (name) => {
    const f = files.get(name);
    if (!f) return null;
    const start = f.local + 30 + view.getUint16(f.local + 26, true) + view.getUint16(f.local + 28, true);
    const data = new Uint8Array(buffer, start, f.size);
    if (f.method === 0) return dec.decode(data);
    if (f.method === 8) return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    throw new Error('El Excel usa un formato que no se puede leer.');
  };
  return { files, read };
}

const xmlDoc = (text) => new DOMParser().parseFromString(text, 'application/xml');
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Devuelve { nombreDeHoja: [[celdas de cada fila]] }. */
async function readWorkbook(file) {
  const zip = await unzip(await file.arrayBuffer());
  const wb = xmlDoc((await zip.read('xl/workbook.xml')) || '');
  const rels = xmlDoc((await zip.read('xl/_rels/workbook.xml.rels')) || '');
  const target = new Map([...rels.getElementsByTagName('Relationship')].map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const sharedXml = await zip.read('xl/sharedStrings.xml');
  const shared = sharedXml ? [...xmlDoc(sharedXml).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent).join('')) : [];
  const sheets = {};
  for (const sh of wb.getElementsByTagName('sheet')) {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const path = `xl/${String(target.get(rid) || '').replace(/^\/?xl\//, '')}`;
    const text = await zip.read(path);
    if (!text) continue;
    sheets[sh.getAttribute('name')] = [...xmlDoc(text).getElementsByTagName('row')].map((row) => {
      const cells = [];
      for (const c of row.getElementsByTagName('c')) {
        const t = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        const value = t === 's' ? shared[Number(v)] ?? '' : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map((x) => x.textContent).join('') : v;
        cells[colIndex(c.getAttribute('r') || 'A1')] = value;
      }
      return cells;
    });
  }
  return sheets;
}

/* ------------------------------------------------------------ Comparar con el catálogo */

const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const keyOf = (brand, code, title) => `${plain(brand)}|${plain(code)}|${plain(title)}`;
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const num = (v) => Math.max(0, Math.round(Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0));

function bySize(text) {
  const out = {};
  for (const part of String(text || '').split('|')) {
    const [size, colors] = part.split(':');
    if (size?.trim() && colors) out[size.trim()] = list(colors);
  }
  return out;
}

/** Link de foto de la copia → dirección propia de la web (o null si es de otro sitio). */
function ownPhoto(url) {
  const u = String(url || '').trim();
  const rel = u.startsWith(SITE_URL) ? u.slice(SITE_URL.length) : u.startsWith(location.origin) ? u.slice(location.origin.length) : u;
  return /^\/(api\/images\?key=[\w.-]+|img\/[\w.-]+)$/.test(rel) ? rel : null;
}

/**
 * Lee la copia y devuelve los artículos que faltan en la web.
 * current: artículos actuales; subcategories/categories: para ubicar la categoría por su nombre.
 */
export async function findMissingArticles(file, { current, categories, subcategories }) {
  const sheets = await readWorkbook(file);
  const rows = sheets['Artículos'] || Object.values(sheets)[0];
  if (!rows) throw new Error('No se encontró la hoja "Artículos" en el archivo.');
  const h = rows.findIndex((r) => r?.includes('Marca') && r?.includes('Título'));
  if (h === -1) throw new Error('Este Excel no parece una copia de seguridad de la web.');
  const header = rows[h];
  const col = (name) => header.indexOf(name);
  const get = (r, name) => (col(name) === -1 ? '' : r[col(name)] ?? '');
  const date = String(rows[0]?.[0] || '').match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || '';

  const have = new Set(current.map((a) => keyOf(a.brand, a.code, a.title)));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const subByPath = new Map(subcategories.map((s) => [plain(`${catName.get(s.categoryId) || ''} › ${s.name}`), s.id]));

  const missing = rows
    .slice(h + 1)
    .filter((r) => r && get(r, 'Título'))
    .filter((r) => !have.has(keyOf(get(r, 'Marca'), get(r, 'Código'), get(r, 'Título'))))
    .map((r) => {
      const pricePack = num(get(r, 'Precio pack'));
      const offer = num(get(r, 'Precio oferta'));
      return {
        brand: String(get(r, 'Marca')).trim(),
        code: String(get(r, 'Código')).trim(),
        title: String(get(r, 'Título')).trim(),
        description: String(get(r, 'Descripción')).trim(),
        presentation: String(get(r, 'Presentación')).trim() || 'x Unid.',
        saleType: String(get(r, 'Tipo de venta')).trim(),
        sizes: list(get(r, 'Talles')),
        colors: list(get(r, 'Colores')),
        colorsBySize: bySize(get(r, 'Colores por talle')),
        pricePack,
        priceUnit: num(get(r, 'Precio unidad')),
        offerPrice: offer && offer < pricePack ? offer : 0,
        isNew: plain(get(r, 'Novedad')) === 'si',
        inStock: plain(get(r, 'Con stock')) !== 'no',
        photos: String(get(r, 'Fotos')).split(/\s+/).map(ownPhoto).filter(Boolean).slice(0, 5),
        subcategoryId: subByPath.get(plain(get(r, 'Categoría'))) || '',
      };
    });
  return { date, total: rows.length - h - 1, missing };
}

/** Vuelve a cargar un artículo de la copia. Usa solo las fotos que todavía existen. */
export async function restoreArticle(item, call) {
  const photos = [];
  for (const src of item.photos) {
    try {
      const res = await fetch(src, { method: 'HEAD', cache: 'no-store' });
      if (res.ok) photos.push(src);
    } catch {
      /* foto que ya no está */
    }
  }
  const { photos: _, ...body } = item;
  const created = await call('articles', { method: 'POST', body: { ...body, images: photos } });
  return { created, photos: photos.length, lostPhotos: item.photos.length - photos.length };
}
