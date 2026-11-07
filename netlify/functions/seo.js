// Páginas para buscadores y sitemap. Salen de los mismos datos del admin (cambios visibles en hasta 10 minutos).
import { normalizeName, slugify } from '../../src/shared/tree.js';
import { handle } from '../lib/http.js';
import { brandPage, branchesPage, catalogPage, howToBuyPage, notFoundPage, productPage, sitemapXml } from '../lib/seo-pages.js';
import { readCollection } from '../lib/store.js';

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const respond = (body, { status = 200, type = 'text/html; charset=utf-8' } = {}) =>
  new Response(body, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': type,
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': status === 200 ? 'public, max-age=600, stale-while-revalidate=86400, durable' : 'public, max-age=60',
    },
  });

/** Artículos con stock, más nuevos primero, y sus marcas (con el nombre registrado en el admin). */
async function loadCatalog() {
  const [articles, registered] = await Promise.all([readCollection('articles'), readCollection('brands')]);
  const names = new Map(registered.map((b) => [normalizeName(b.name), b.name]));
  const brandOf = (a) => {
    const name = names.get(normalizeName(a.brand)) || a.brand;
    return { name, slug: slugify(name) };
  };
  const inStock = articles
    .filter((a) => a.inStock)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const brands = new Map();
  for (const a of inStock) {
    const { name, slug } = brandOf(a);
    if (!brands.has(slug)) brands.set(slug, { name, slug, count: 0, articles: [] });
    const entry = brands.get(slug);
    entry.count += 1;
    entry.articles.push(a);
  }
  return { all: articles, articles: inStock, brandOf, brands: [...brands.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')) };
}

export default handle(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
  const [, section, param] = path.split('/');
  const notFound = () => respond(notFoundPage(path), { status: 404 });

  if (path === '/como-comprar') return respond(howToBuyPage());

  if (path === '/sucursales') {
    const branches = (await readCollection('branches')).filter((b) => b.active);
    return respond(branchesPage({ branches: branches.sort((a, b) => Number(b.isMain) - Number(a.isMain)) }));
  }

  const catalog = await loadCatalog();

  if (path === '/sitemap.xml') return respond(sitemapXml(catalog), { type: 'application/xml; charset=utf-8' });
  if (path === '/catalogo') return respond(catalogPage(catalog));

  if (section === 'marca' && param) {
    const brand = catalog.brands.find((b) => b.slug === param);
    return brand ? respond(brandPage({ brand, articles: brand.articles })) : notFound();
  }

  if (section === 'producto' && param) {
    const article = catalog.all.find((a) => a.id === param);
    return article ? respond(productPage({ article, brand: catalog.brandOf(article) })) : notFound();
  }

  return notFound();
});

export const config = {
  path: ['/catalogo', '/sucursales', '/como-comprar', '/sitemap.xml', '/marca/:slug', '/producto/:id'],
};
