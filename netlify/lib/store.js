// Persistencia en Netlify Blobs. Cada colección es un array JSON bajo una clave del store "catalog".
import { getStore } from '@netlify/blobs';
import { seedArticles, seedBanners, seedBrands } from '../../src/data/seed.js';

const SEEDS = { articles: seedArticles, brands: seedBrands, banners: seedBanners };

export const dataStore = () => getStore({ name: 'catalog', consistency: 'strong' });
export const imageStore = () => getStore({ name: 'images', consistency: 'strong' });

/** Lee una colección; si el store está vacío la siembra con los datos del diseño. */
export async function readCollection(name) {
  const store = dataStore();
  const current = await store.get(name, { type: 'json' });
  if (current) return current;
  const seed = SEEDS[name]();
  // onlyIfNew evita pisar datos si dos requests siembran a la vez.
  await store.setJSON(name, seed, { onlyIfNew: true });
  return (await store.get(name, { type: 'json' })) || seed;
}

/**
 * Lee-modifica-escribe con control de concurrencia optimista (ETag).
 * `mutate` recibe una copia del array y devuelve { list, result }.
 */
export async function updateCollection(name, mutate) {
  const store = dataStore();
  for (let attempt = 0; attempt < 4; attempt++) {
    await readCollection(name); // garantiza que exista
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
