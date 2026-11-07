// Páginas livianas para buscadores: HTML completo desde el servidor, con los datos del admin.
// La tienda (index.html) sigue siendo donde se arma el pedido; estas páginas llevan hasta ahí.
import { formatPrice, INSTAGRAM_URL, INSTAGRAM_USER, SITE_URL, WHATSAPP_DISPLAY, WHATSAPP_NUMBER, whatsappLink } from '../../src/config.js';
import { openingHours } from '../../src/shared/opening-hours.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** JSON dentro de <script>: "<" escapado para que un texto del admin no pueda cerrar la etiqueta. */
const ldJson = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

const abs = (path) => `${SITE_URL}${path}`;
const clip = (s, max = 155) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const directionsUrl = (b) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.mapQuery || `${b.name}, Rosario, Santa Fe`)}`;

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#fcf8fa;color:#334155;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;overflow-wrap:anywhere}
a{color:#be185d}
img{display:block;max-width:100%;height:auto}
h1,h2,h3{color:#0f172a;line-height:1.2;font-family:Georgia,"Times New Roman",serif}
h1{font-size:clamp(1.8rem,5vw,2.6rem);margin:.25rem 0 .75rem}
h2{font-size:1.45rem;margin:2.25rem 0 .75rem}
h3{font-size:1.1rem;margin:0 0 .25rem}
.wrap{max-width:1120px;margin:0 auto;padding:0 16px}
.top{background:#fff;border-bottom:1px solid #fbcfe8}
.top .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 20px;padding-top:10px;padding-bottom:10px}
.logo{display:flex;align-items:center;gap:10px;color:#0f172a;font-weight:700;text-decoration:none}
.logo img{width:40px;height:40px;border-radius:50%}
.logo small{display:block;color:#be185d;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase}
.nav{display:flex;flex-wrap:wrap;gap:0 16px}
.nav a{display:block;padding:10px 0;color:#334155;font-size:.9rem;font-weight:600;text-decoration:none}
.nav a:hover,.nav a[aria-current]{color:#be185d}
main{padding:20px 0 48px}
.crumbs{font-size:.82rem}
.lead{max-width:760px}
.btn{display:inline-block;margin:6px 8px 6px 0;padding:12px 22px;border-radius:999px;background:#be185d;color:#fff;font-weight:700;text-decoration:none}
.btn:hover{background:#970046}
.btn.alt{background:#fff;color:#be185d;border:1px solid #f9a8d4}
.chips{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0;list-style:none}
.chips a{display:block;padding:8px 14px;border-radius:999px;background:#fff;border:1px solid #fbcfe8;font-size:.9rem;font-weight:600;text-decoration:none}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:14px;padding:0;margin:0;list-style:none}
.card{display:block;height:100%;background:#fff;border:1px solid #fbcfe8;border-radius:16px;overflow:hidden;color:inherit;text-decoration:none}
.card img{width:100%;aspect-ratio:4/5;object-fit:cover;background:#fdf2f8}
.card div{padding:10px 12px;font-size:.88rem;line-height:1.35}
.card b{display:block;color:#0f172a}
.card span{display:block;margin-top:4px;color:#be185d;font-weight:700}
.boxes{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.box{background:#fff;border:1px solid #fbcfe8;border-radius:16px;padding:18px}
.box p{margin:.4rem 0}
.product{display:grid;gap:24px}
.product img{width:100%;border-radius:16px;background:#fdf2f8}
.price{color:#be185d;font-size:1.8rem;font-weight:700}
dl{margin:1rem 0;padding:12px 14px;background:#fdf2f8;border-radius:12px}
dt{font-weight:700;color:#0f172a}
dd{margin:0 0 .5rem}
.foot{padding:24px 0 32px;background:#fdf2f8;border-top:1px solid #fbcfe8;font-size:.88rem}
@media(min-width:760px){.product{grid-template-columns:minmax(0,5fr) minmax(0,6fr)}}
`;

const NAV = [
  ['/', 'Inicio'],
  ['/catalogo', 'Catálogo'],
  ['/sucursales', 'Sucursales y contacto'],
  ['/como-comprar', 'Cómo comprar'],
];

function layout({ path, title, description, body, image = '/og-image.jpg', ogType = 'website', schema = [] }) {
  const nav = NAV.map(([href, label]) => `<a href="${href}"${href === path ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(clip(description))}">
<link rel="canonical" href="${esc(abs(path))}">
<meta name="theme-color" content="#be185d">
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="es_AR">
<meta property="og:site_name" content="ÚNICA LENCERÍA Mayorista">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(clip(description))}">
<meta property="og:url" content="${esc(abs(path))}">
<meta property="og:image" content="${esc(abs(image))}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>${CSS}</style>
${schema.map(ldJson).join('\n')}
</head>
<body>
<header class="top"><div class="wrap">
  <a class="logo" href="/"><img src="/img/logo-unica.webp" alt="" width="40" height="40"><span>ÚNICA LENCERÍA<small>Mayorista • Rosario</small></span></a>
  <nav class="nav" aria-label="Secciones">${nav}</nav>
</div></header>
<main><div class="wrap">
${body}
</div></main>
<footer class="foot"><div class="wrap">
  <p><strong>ÚNICA LENCERÍA</strong>: lencería y ropa interior por mayor en Rosario, Santa Fe, sin compra mínima y con envíos a toda la Argentina.</p>
  <p>WhatsApp: <a href="${esc(whatsappLink('Hola Única Mayorista, quiero hacer una consulta'))}" rel="noopener noreferrer">${esc(WHATSAPP_DISPLAY)}</a> • Instagram: <a href="${esc(INSTAGRAM_URL)}" rel="noopener noreferrer">@${esc(INSTAGRAM_USER)}</a></p>
</div></footer>
</body>
</html>`;
}

/* ------------------------------------------------------------ Componentes */

const crumbsSchema = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(path) })),
});

const crumbs = (items) =>
  `<nav class="crumbs" aria-label="Ruta de navegación">${items
    .map(([name, path], i) => (i === items.length - 1 ? esc(name) : `<a href="${esc(path)}">${esc(name)}</a> › `))
    .join('')}</nav>`;

const productCard = (a) => `<li><a class="card" href="/producto/${esc(a.id)}">
  <img src="${esc(a.images[0] || '/og-image.jpg')}" alt="${esc(`${a.title} ${a.brand} por mayor`)}" width="400" height="500" loading="lazy" decoding="async">
  <div><b>${esc(a.title)}</b>${esc(a.brand)}<span>${esc(formatPrice(a.pricePack))}</span></div>
</a></li>`;

const brandChips = (brands) =>
  `<ul class="chips">${brands
    .map((b) => `<li><a href="/marca/${esc(b.slug)}">${esc(b.name)} (${b.count})</a></li>`)
    .join('')}</ul>`;

/* ----------------------------------------------------------------- Páginas */

export function catalogPage({ articles, brands }) {
  const names = brands.slice(0, 6).map((b) => b.name).join(', ');
  return layout({
    path: '/catalogo',
    title: 'Catálogo de Lencería por Mayor en Rosario | ÚNICA',
    description: `Catálogo mayorista de lencería y ropa interior: ${plural(articles.length, 'artículo', 'artículos')} en packs y por unidad de ${names} y más. Sin compra mínima.`,
    schema: [crumbsSchema([['Inicio', '/'], ['Catálogo', '/catalogo']])],
    body: `${crumbs([['Inicio', '/'], ['Catálogo', '/catalogo']])}
<h1>Catálogo de lencería y ropa interior por mayor</h1>
<p class="lead">${plural(articles.length, 'artículo disponible', 'artículos disponibles')} de ${plural(brands.length, 'marca', 'marcas')}, en packs cerrados y por unidad, sin compra mínima. Desde la tienda podés filtrar por categoría y armar tu pedido.</p>
<p><a class="btn" href="/#articulos-marcas">Armar mi pedido</a></p>
<h2>Marcas</h2>
${brandChips(brands)}
<h2>Todos los artículos</h2>
<ul class="grid">${articles.map(productCard).join('')}</ul>`,
  });
}

export function brandPage({ brand, articles }) {
  const path = `/marca/${brand.slug}`;
  const trail = [['Inicio', '/'], ['Catálogo', '/catalogo'], [brand.name, path]];
  return layout({
    path,
    title: `${brand.name} por Mayor en Rosario | ÚNICA Lencería Mayorista`,
    description: `Comprá ${brand.name} por mayor en Rosario: ${plural(articles.length, 'artículo disponible', 'artículos disponibles')} en packs y por unidad. Sin compra mínima y con envíos a toda la Argentina.`,
    schema: [crumbsSchema(trail)],
    body: `${crumbs(trail)}
<h1>${esc(brand.name)} por mayor en Rosario</h1>
<p class="lead">${plural(articles.length, 'artículo', 'artículos')} de ${esc(brand.name)} para revendedoras y comercios, sin compra mínima y con envíos a toda la Argentina.</p>
<p><a class="btn" href="/?marca=${esc(brand.slug)}">Pedir ${esc(brand.name)} en la tienda</a></p>
<h2>Artículos de ${esc(brand.name)}</h2>
<ul class="grid">${articles.map(productCard).join('')}</ul>`,
  });
}

export function productPage({ article: a, brand }) {
  const path = `/producto/${a.id}`;
  const trail = [['Inicio', '/'], ['Catálogo', '/catalogo'], [brand.name, `/marca/${brand.slug}`], [a.title, path]];
  const facts = [
    a.code && ['Artículo', a.code],
    a.presentation && ['Presentación', a.presentation],
    a.sizes?.length && ['Talles', a.sizes.join(', ')],
    a.colors?.length && ['Colores', a.colors.join(', ')],
  ].filter(Boolean);
  const summary = a.description || `${a.title} de ${brand.name} por mayor.`;
  return layout({
    path,
    ogType: 'product',
    image: a.images[0] || '/og-image.jpg',
    title: `${clip(`${a.title} ${brand.name}`, 50)} por Mayor | ÚNICA`,
    description: `${summary} ${a.presentation || ''}. Lencería mayorista en Rosario, sin compra mínima y con envíos a toda la Argentina.`.replace(/\s*\.(\s*\.)+/g, '.'),
    schema: [
      crumbsSchema(trail),
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: a.title,
        brand: { '@type': 'Brand', name: brand.name },
        ...(a.code ? { sku: a.code } : {}),
        description: summary,
        image: a.images.map((src) => abs(src)),
        offers: {
          '@type': 'Offer',
          url: abs(path),
          price: a.pricePack,
          priceCurrency: 'ARS',
          availability: `https://schema.org/${a.inStock ? 'InStock' : 'OutOfStock'}`,
        },
      },
    ],
    body: `${crumbs(trail)}
<div class="product">
  <img src="${esc(a.images[0] || '/og-image.jpg')}" alt="${esc(`${a.title} ${brand.name}`)}" width="800" height="1000" fetchpriority="high">
  <div>
    <h1>${esc(a.title)}</h1>
    <p><a href="/marca/${esc(brand.slug)}">${esc(brand.name)}</a></p>
    <p class="price">${esc(formatPrice(a.pricePack))} <small>${esc(a.presentation)}</small></p>
    ${a.description ? `<p>${esc(a.description)}</p>` : ''}
    ${facts.length ? `<dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
    ${
      a.inStock
        ? `<a class="btn" href="/#producto/${esc(a.id)}">Pedir este artículo</a>`
        : '<p><strong>Sin stock por el momento.</strong></p>'
    }
    <a class="btn alt" href="/marca/${esc(brand.slug)}">Más de ${esc(brand.name)}</a>
  </div>
</div>`,
  });
}

export function branchesPage({ branches }) {
  const n = branches.length;
  const schema = branches.map((b) => {
    const [street, city = 'Rosario', region = 'Santa Fe'] = (b.mapQuery || b.name).split(',').map((s) => s.trim());
    return {
      '@context': 'https://schema.org',
      '@type': ['LocalBusiness', 'ClothingStore'],
      '@id': `${SITE_URL}/#${b.id}`,
      name: `ÚNICA LENCERÍA – ${b.isMain ? 'Casa Central ' : ''}${b.name}`,
      description: b.description,
      url: abs('/sucursales'),
      image: abs('/og-image.jpg'),
      telephone: `+${WHATSAPP_NUMBER}`,
      priceRange: '$$',
      address: { '@type': 'PostalAddress', streetAddress: street, addressLocality: city, addressRegion: region, addressCountry: 'AR' },
      openingHoursSpecification: openingHours(b.hours),
    };
  });
  const cards = branches
    .map(
      (b) => `<section class="box">
  <h2 style="margin:0 0 .25rem">${esc(b.name)}</h2>
  ${b.subtitle ? `<p><strong>${esc(b.subtitle)}</strong></p>` : ''}
  ${b.description ? `<p>${esc(b.description)}</p>` : ''}
  ${b.hours.map((r) => `<p>${r.days ? `<strong>${esc(r.days)}:</strong> ` : ''}${esc(r.hours)}</p>`).join('')}
  ${b.highlight ? `<p>${esc(b.highlight)}</p>` : ''}
  <a class="btn alt" href="${esc(directionsUrl(b))}" rel="noopener noreferrer">Cómo llegar</a>
</section>`
    )
    .join('');
  return layout({
    path: '/sucursales',
    title: 'Sucursales y Contacto | ÚNICA Lencería Mayorista en Rosario',
    description: `Dónde comprar lencería por mayor en Rosario: direcciones, horarios y WhatsApp de ${n === 1 ? 'nuestro local' : `nuestros ${n} locales`}${n ? ` (${branches.map((b) => b.name).join(', ')})` : ''}.`,
    schema,
    body: `<h1>Locales de lencería mayorista en Rosario</h1>
<p class="lead">Visitanos o escribinos para coordinar tu pedido, retiro o envío.</p>
<p><a class="btn" href="${esc(whatsappLink('Hola Única Mayorista, quiero hacer una consulta'))}" rel="noopener noreferrer">WhatsApp ${esc(WHATSAPP_DISPLAY)}</a>
<a class="btn alt" href="${esc(INSTAGRAM_URL)}" rel="noopener noreferrer">Instagram @${esc(INSTAGRAM_USER)}</a></p>
${n ? `<div class="boxes">${cards}</div>` : '<p>Por el momento no hay sucursales disponibles. Escribinos por WhatsApp y coordinamos tu pedido.</p>'}`,
  });
}

export function howToBuyPage() {
  const faq = [
    ['¿Hay compra mínima?', 'No. Podés hacer tu pedido por cualquier monto y combinar marcas y líneas en una sola compra.'],
    ['¿Cómo se venden los artículos?', 'Cada artículo indica su presentación: por unidad o en packs, como packs x3, con sus talles y colores disponibles.'],
    ['¿Hacen envíos?', 'Sí. Despachamos por expresos y transporte a toda la Argentina en 24/48 hs. También podés coordinar el retiro en nuestros locales de Rosario.'],
    ['¿Cómo se paga?', 'Por transferencia o depósito.'],
    ['¿Cómo pido la lista de precios?', 'Pedila por WhatsApp y te la enviamos en Excel o PDF con fotos.'],
  ];
  return layout({
    path: '/como-comprar',
    title: 'Cómo Comprar Lencería por Mayor | ÚNICA Rosario',
    description: 'Cómo comprar lencería y ropa interior por mayor en ÚNICA: sin compra mínima, packs y curvas de talles, pago por transferencia y envíos a toda la Argentina.',
    body: `<h1>Cómo comprar lencería por mayor</h1>
<p class="lead">Comprar en ÚNICA es simple, ya sea para tu comercio o para reventa.</p>
<div class="boxes">
  <section class="box"><h2 style="margin:0 0 .25rem;font-size:1.15rem">1. Elegí</h2><p>Mirá el <a href="/catalogo">catálogo</a> o pedí la lista de precios por WhatsApp.</p></section>
  <section class="box"><h2 style="margin:0 0 .25rem;font-size:1.15rem">2. Armá tu pedido</h2><p>Combiná marcas, talles y colores, sin monto mínimo.</p></section>
  <section class="box"><h2 style="margin:0 0 .25rem;font-size:1.15rem">3. Recibilo</h2><p>Abonás por transferencia o depósito y despachamos en 24/48 hs a tu localidad.</p></section>
</div>
<p style="margin-top:1rem"><a class="btn" href="/#articulos-marcas">Armar mi pedido</a></p>
<h2>Preguntas frecuentes</h2>
${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('\n')}`,
  });
}

export function notFoundPage(path) {
  return layout({
    path,
    title: 'Página no encontrada | ÚNICA Lencería Mayorista',
    description: 'La página que buscás no existe o el artículo ya no está disponible.',
    body: `<h1>No encontramos esta página</h1>
<p>Puede que el artículo o la marca ya no estén disponibles.</p>
<p><a class="btn" href="/catalogo">Ver el catálogo</a></p>`,
  }).replace('<meta name="theme-color"', '<meta name="robots" content="noindex">\n<meta name="theme-color"');
}

export function sitemapXml({ articles, brands }) {
  const newest = (list) => list.map((a) => String(a.updatedAt || a.createdAt || '')).sort().pop() || '';
  const entry = (path, lastmod = '') =>
    `<url><loc>${esc(abs(path))}</loc>${lastmod ? `<lastmod>${esc(lastmod)}</lastmod>` : ''}</url>`;
  const urls = [
    entry('/', newest(articles)),
    entry('/catalogo', newest(articles)),
    entry('/sucursales'),
    entry('/como-comprar'),
    ...brands.map((b) => entry(`/marca/${b.slug}`, newest(b.articles))),
    ...articles.map((a) => entry(`/producto/${a.id}`, a.updatedAt || a.createdAt)),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
}
