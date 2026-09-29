// Árbol de navegación: categorías → subcategorías → marcas derivadas de los productos.
// Función pura: la usa la API (/api/categories/tree) y la tienda como respaldo sin conexión.

export const slugify = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';

export const normalizeName = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

const byOrder = (a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es');
const byName = (a, b) => a.name.localeCompare(b.name, 'es');

/** Marcas de una lista de productos: solo cuentan los activos (con stock). */
function brandsOf(products, brandIndex) {
  const counts = new Map();
  for (const p of products) {
    if (!p.inStock) continue;
    const key = normalizeName(p.brand);
    if (!key) continue;
    const entry = counts.get(key) || { name: p.brand, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.entries()]
    .map(([key, { name, count }]) => {
      const b = brandIndex.get(key);
      const display = b?.name || name;
      return { id: b?.id || '', name: display, slug: slugify(display), logo: b?.logo || '', initials: b?.initials || '', count };
    })
    .sort(byName);
}

export function buildTreeFrom({ categories = [], subcategories = [], articles = [], brands = [], includeInactive = false }) {
  const brandIndex = new Map(brands.map((b) => [normalizeName(b.name), b]));
  const visible = (x) => includeInactive || x.isActive;

  const tree = categories
    .filter(visible)
    .sort(byOrder)
    .map((cat) => {
      const subs = subcategories.filter((s) => s.categoryId === cat.id && visible(s)).sort(byOrder);
      const subIds = new Set(subs.map((s) => s.id));
      const catProducts = articles.filter((a) => subIds.has(a.subcategoryId));
      return {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        order: cat.order,
        isActive: cat.isActive,
        productCount: catProducts.filter((p) => p.inStock).length,
        brands: brandsOf(catProducts, brandIndex),
        subcategories: subs.map((s) => {
          const products = articles.filter((a) => a.subcategoryId === s.id);
          return {
            id: s.id,
            categoryId: s.categoryId,
            name: s.name,
            slug: s.slug,
            order: s.order,
            isActive: s.isActive,
            productCount: products.filter((p) => p.inStock).length,
            brands: brandsOf(products, brandIndex),
          };
        }),
      };
    });

  // Marcador global: todas las marcas registradas + las que aparezcan en productos.
  const all = new Map(brandsOf(articles, brandIndex).map((b) => [normalizeName(b.name), b]));
  for (const b of brands) {
    const key = normalizeName(b.name);
    if (!all.has(key)) all.set(key, { id: b.id, name: b.name, slug: slugify(b.name), logo: b.logo || '', initials: b.initials || '', count: 0 });
  }
  return { categories: tree, brands: [...all.values()].sort(byName) };
}
