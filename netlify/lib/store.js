// Persistencia en Netlify Blobs. Cada colección es un array JSON bajo una clave del store "catalog".
// Colecciones: articles, brands, banners, categories, subcategories.
import { getStore } from '@netlify/blobs';
import {
  seedArticles,
  seedBanners,
  seedBrands,
  seedCategories,
  seedSubcategories,
  SEED_ARTICLE_SUBCATEGORY,
} from '../../src/data/seed.js';
import { normalizeName } from '../../src/shared/tree.js';

const SEEDS = {
  articles: seedArticles,
  brands: seedBrands,
  banners: seedBanners,
  categories: seedCategories,
  subcategories: seedSubcategories,
};

export const dataStore = () => getStore({ name: 'catalog', consistency: 'strong' });
export const imageStore = () => getStore({ name: 'images', consistency: 'strong' });

export { normalizeName };

/**
 * Migración de artículos creados antes de las categorías: agrega subcategoryId (según el
 * diseño para los artículos semilla, vacío para el resto) y brandId (por nombre de marca).
 */
async function migrateArticles(store, list) {
  if (list.every((a) => 'subcategoryId' in a && 'brandId' in a)) return list;
  const brands = await readCollection('brands');
  const brandByName = new Map(brands.map((b) => [normalizeName(b.name), b.id]));
  const migrated = list.map((a) => ({
    ...a,
    subcategoryId: 'subcategoryId' in a ? a.subcategoryId : SEED_ARTICLE_SUBCATEGORY[a.id] || '',
    brandId: 'brandId' in a ? a.brandId : brandByName.get(normalizeName(a.brand)) || '',
  }));
  const { etag } = (await store.getWithMetadata('articles', { type: 'json' })) || {};
  if (etag) await store.setJSON('articles', migrated, { onlyIfMatch: etag });
  return migrated;
}

/** Lee una colección; si el store está vacío la siembra con los datos del diseño. */
export async function readCollection(name) {
  const store = dataStore();
  let current = await store.get(name, { type: 'json' });
  if (!current) {
    const seed = SEEDS[name]();
    // onlyIfNew evita pisar datos si dos requests siembran a la vez.
    await store.setJSON(name, seed, { onlyIfNew: true });
    current = (await store.get(name, { type: 'json' })) || seed;
  }
  if (name === 'articles') current = await migrateArticles(store, current);
  return current;
}

/**
 * Lee-modifica-escribe con control de concurrencia optimista (ETag).
 * `mutate` recibe una copia del array y devuelve { list, result }.
 */
export async function updateCollection(name, mutate) {
  const store = dataStore();
  for (let attempt = 0; attempt < 4; attempt++) {
    await readCollection(name); // garantiza que exista (y esté migrada)
    const { data, etag } = await store.getWithMetadata(name, { type: 'json' });
    const { list, result } = await mutate(structuredClone(data));
    const res = await store.setJSON(name, list, { onlyIfMatch: etag });
    if (res.modified !== false) return result;
  }
  throw new Error(`No se pudo guardar "${name}" por escrituras concurrentes.`);
}

const UPLOADED_RE = /^\/api\/images\?key=([\w.-]+)$/;

/** Borra del store de imágenes las subidas por el admin (las de /img/ son estáticas). */
export async function deleteUploadedImages(urls = []) {
  const store = imageStore();
  await Promise.all(
    urls.map((u) => {
      const m = String(u).match(UPLOADED_RE);
      return m ? store.delete(m[1]).catch(() => {}) : null;
    })
  );
}
