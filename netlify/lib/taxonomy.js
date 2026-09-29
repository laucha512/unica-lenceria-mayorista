// Categorías, subcategorías y marcas derivadas de los productos (lado servidor).
import { buildTreeFrom, slugify } from '../../src/shared/tree.js';
import { readCollection } from './store.js';

export { slugify };

/** Slug único dentro de `siblings` (ignorando el propio `selfId`): "conjuntos", "conjuntos-2"… */
export function uniqueSlug(base, siblings, selfId = null) {
  const root = slugify(base);
  const taken = new Set(siblings.filter((s) => s.id !== selfId).map((s) => s.slug));
  if (!taken.has(root)) return root;
  for (let n = 2; n < 1000; n++) if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
  return `${root}-${Date.now().toString(36)}`;
}

/** Árbol del menú; `includeInactive` devuelve también lo inactivo (para el panel). */
export async function buildTree({ includeInactive = false } = {}) {
  const [categories, subcategories, articles, brands] = await Promise.all([
    readCollection('categories'),
    readCollection('subcategories'),
    readCollection('articles'),
    readCollection('brands'),
  ]);
  return buildTreeFrom({ categories, subcategories, articles, brands, includeInactive });
}
