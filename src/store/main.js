import { formatPrice } from '../config.js';
import { esc, safeImg, formatSizes, api, initials } from '../shared/utils.js';
import { initCart, qtyOf, setArticles, packPrice, refresh as refreshCart } from './cart.js';
import { initProduct, openProduct, setProducts } from './product.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const CATALOG_PAGE = 6;
const state = { articles: [], brands: [], brandFilter: 'all', catalogLimit: CATALOG_PAGE };

/* ---------------------------------------------------------------- Header */

const header = $('#siteHeader');
// Alto del header sin contar el menú móvil desplegado (que se superpone al contenido).
const headerHeight = () =>
  [...header.children].filter((el) => el.id !== 'mobileMenu').reduce((h, el) => h + el.offsetHeight, 0) + 1;
function syncHeaderHeight() {
  document.documentElement.style.setProperty('--header-h', `${headerHeight()}px`);
}
new ResizeObserver(syncHeaderHeight).observe(header);
syncHeaderHeight();

// Menú hamburguesa (móvil / tablet)
const menuBtn = $('#menuToggle');
const mobileMenu = $('#mobileMenu');
function setMenu(open) {
  mobileMenu.classList.toggle('hidden', !open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  menuBtn.querySelector('.material-symbols-outlined').textContent = open ? 'close' : 'menu';
}
menuBtn.addEventListener('click', () => setMenu(mobileMenu.classList.contains('hidden')));
mobileMenu.addEventListener('click', (e) => {
  if (e.target.closest('a')) setMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !mobileMenu.classList.contains('hidden')) {
    setMenu(false);
    menuBtn.focus();
  }
});
matchMedia('(min-width: 1024px)').addEventListener('change', (e) => e.matches && setMenu(false));

// Sección activa en el nav según el scroll
const ACTIVE = ['bg-[#be185d]', 'text-white', 'shadow-sm'];
const INACTIVE = ['text-slate-700', 'hover:text-[#be185d]', 'hover:bg-pink-100/60'];
function setActiveNav(id) {
  $$('.nav-link').forEach((a) => {
    const on = a.dataset.nav === id;
    a.classList.remove(...(on ? INACTIVE : ACTIVE));
    a.classList.add(...(on ? ACTIVE : INACTIVE));
    if (on) a.setAttribute('aria-current', 'location');
    else a.removeAttribute('aria-current');
  });
}
setActiveNav('inicio');

const visible = new Set();
let spy;
function createSpy() {
  spy?.disconnect();
  visible.clear();
  // La franja "activa" va desde el borde inferior del header hasta el 45% de la ventana.
  spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => (en.isIntersecting ? visible.add(en.target) : visible.delete(en.target)));
      const sections = $$('[data-spy]');
      const current = sections.find((s) => visible.has(s));
      if (current) setActiveNav(current.id);
    },
    { rootMargin: `-${headerHeight()}px 0px -55% 0px` }
  );
  $$('[data-spy]').forEach((s) => spy.observe(s));
}
createSpy();
let spyTimer;
window.addEventListener('resize', () => {
  clearTimeout(spyTimer);
  spyTimer = setTimeout(createSpy, 200);
});

$('#copyrightYear').textContent = new Date().getFullYear();

/* ---------------------------------------------------------------- Render */

const BTN =
  'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-full font-label-sm text-xs font-semibold transition-colors shrink-0';
const BTN_IDLE = 'bg-[#be185d] text-white hover:bg-[#970046]';
const BTN_IN_CART = 'bg-emerald-700 text-white hover:bg-emerald-800';
const BTN_NO_STOCK = 'bg-white border border-pink-300 text-slate-800 hover:bg-pink-50';

const productHref = (a) => `#producto/${encodeURIComponent(a.id)}`;

/** Botón que abre la ficha (elegir colores/talles); si ya hay packs en el pedido lo indica. */
function openButton(a) {
  return `<a href="${esc(productHref(a))}" data-product="${esc(a.id)}" data-title="${esc(a.title)}" data-stock="${a.inStock}" class="${BTN} ${a.inStock ? BTN_IDLE : BTN_NO_STOCK}">
      <span class="material-symbols-outlined text-[16px]" aria-hidden="true">${a.inStock ? 'add_shopping_cart' : 'chat'}</span> <span data-product-text>${a.inStock ? 'Elegir y pedir' : 'Ver y consultar'}</span>
    </a>`;
}

/** Refleja en los botones de las tarjetas cuántos packs de cada artículo hay en el pedido. */
function syncAddButtons() {
  $$('a[data-product][data-stock="true"]').forEach((btn) => {
    const qty = qtyOf(btn.dataset.product);
    btn.className = `${BTN} ${qty ? BTN_IN_CART : BTN_IDLE}`;
    btn.querySelector('.material-symbols-outlined').textContent = qty ? 'check' : 'add_shopping_cart';
    btn.querySelector('[data-product-text]').textContent = qty ? `En el pedido (${qty})` : 'Elegir y pedir';
    btn.setAttribute(
      'aria-label',
      qty
        ? `${btn.dataset.title}: ${qty} ${qty === 1 ? 'pack' : 'packs'} en el pedido. Abrir ficha para elegir colores y talles`
        : `${btn.dataset.title}: abrir ficha para elegir colores, talles y cantidad`
    );
  });
}

// Foto, título y botón de cada tarjeta abren la ficha del producto.
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-product]');
  if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
  e.preventDefault();
  openProduct(link.dataset.product);
});

const cardImage = (a) => safeImg(a.images?.[0]);

/** Precio único: el del pack (lo mismo que se cobra en el pedido). */
const priceBlock = (a, big) => `
    <div>
      <span class="text-[10px] text-slate-600 uppercase font-semibold block">Precio mayorista</span>
      <span class="${big ? 'font-headline-sm text-lg text-[#be185d]' : 'text-base text-slate-900'} font-bold">${esc(formatPrice(packPrice(a)))}</span>
      <span class="block text-[11px] text-slate-600">${esc(a.presentation)}</span>
    </div>`;

const photoCount = (a) =>
  a.images?.length > 1
    ? `<span class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-slate-900/75 text-white font-bold text-[10px]">${a.images.length} fotos</span>`
    : '';

/** Foto de la tarjeta: abre la ficha (para mouse/touch; el teclado usa el título y el botón). */
const photoLink = (a, cls, inner) =>
  `<a href="${esc(productHref(a))}" data-product="${esc(a.id)}" class="block relative ${cls}" tabindex="-1" aria-hidden="true">
      <img alt="" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500" src="${esc(cardImage(a))}" loading="lazy" decoding="async" width="600" height="450">
      ${inner}
    </a>`;

const titleLink = (a) =>
  `<a href="${esc(productHref(a))}" data-product="${esc(a.id)}" class="hover:text-[#be185d]">${esc(a.title)}</a>`;

function newArrivalCard(a) {
  return `
<article class="bg-white rounded-3xl p-4 border border-pink-200 shadow-sm hover:shadow-lg transition-all flex flex-col justify-between">
  <div>
    ${photoLink(
      a,
      'rounded-2xl overflow-hidden aspect-[4/3] mb-3 bg-pink-50',
      `<span class="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-[#be185d] text-white font-bold text-[10px] uppercase tracking-wider shadow-sm">Novedad</span>
      ${a.inStock ? photoCount(a) : '<span class="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-white font-bold text-[10px] uppercase tracking-wider shadow-sm">Sin stock</span>'}
      <span class="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-full bg-white/95 text-slate-800 font-bold text-[10px] shadow-sm">${esc(a.presentation)}</span>`
    )}
    <div class="flex items-center justify-between text-xs text-slate-600 mb-1">
      <span class="font-bold text-[#be185d]">${esc(a.brand)}</span>
      ${a.code ? `<span>Art. ${esc(a.code)}</span>` : ''}
    </div>
    <h3 class="font-headline-sm text-lg font-bold text-slate-900 leading-snug">${titleLink(a)}</h3>
    <dl class="mt-3 space-y-1.5 text-xs text-slate-600 bg-[#fdf2f8] p-2.5 rounded-xl border border-pink-100">
      <div class="flex justify-between gap-3"><dt class="font-bold text-slate-800 shrink-0">Curva de Talles:</dt> <dd class="text-right">${esc(formatSizes(a.sizes))}</dd></div>
      <div class="flex justify-between gap-3"><dt class="font-bold text-slate-800 shrink-0">Colores Surtidos:</dt> <dd class="text-right">${esc(a.colors.join(', ') || 'Consultar')}</dd></div>
      <div class="flex justify-between gap-3"><dt class="font-bold text-slate-800 shrink-0">Presentación:</dt> <dd class="text-right">${esc(a.saleType || a.presentation)}</dd></div>
    </dl>
  </div>
  <div class="pt-4 mt-3 border-t border-pink-100 flex items-center justify-between gap-3">
    ${priceBlock(a, false)}
    ${openButton(a)}
  </div>
</article>`;
}

function catalogCard(a) {
  const tag = a.inStock
    ? a.tag
      ? `<span class="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">${esc(a.tag)}</span>`
      : ''
    : '<span class="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">Sin stock momentáneo</span>';
  return `
<article class="p-space-md rounded-3xl bg-[#fdf8fa] border border-pink-200 hover:border-[#be185d] transition-all flex flex-col justify-between group">
  <div>
    ${photoLink(
      a,
      'rounded-2xl overflow-hidden aspect-[4/3] mb-4 bg-white',
      `<span class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 font-label-sm text-[10px] text-[#be185d] font-bold border border-pink-200">Marca: ${esc(a.brand)}</span>
      ${photoCount(a)}
      <span class="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-slate-900/80 text-white font-bold text-[10px]">${esc(a.presentation)}</span>`
    )}
    <div class="flex items-center justify-between gap-2 mb-1">
      <span class="font-label-sm text-xs text-slate-600 uppercase tracking-wider font-semibold">${a.code ? `Art. ${esc(a.code)}` : ''}</span>
      ${tag}
    </div>
    <h3 class="font-headline-sm text-lg font-bold text-slate-900 leading-tight">${titleLink(a)}</h3>
    <dl class="mt-3 p-3 bg-white rounded-xl border border-pink-100 text-xs text-slate-600 space-y-1">
      <div class="flex justify-between gap-3"><dt class="font-bold text-slate-800 shrink-0">Curva de Talles:</dt> <dd class="text-right">${esc(formatSizes(a.sizes))}</dd></div>
      <div class="flex justify-between gap-3"><dt class="font-bold text-slate-800 shrink-0">Colores Disponibles:</dt> <dd class="text-right">${esc(a.colors.join(', ') || 'Consultar')}</dd></div>
      <div class="flex justify-between gap-3"><dt class="font-bold text-slate-800 shrink-0">Tipo de Venta:</dt> <dd class="text-right">${esc(a.saleType || a.presentation)}</dd></div>
    </dl>
  </div>
  <div class="mt-4 pt-3 border-t border-pink-200 flex items-center justify-between gap-3">
    ${priceBlock(a, true)}
    ${openButton(a)}
  </div>
</article>`;
}

function brandChip(b, clone) {
  const badge = b.logo
    ? `<img src="${esc(safeImg(b.logo))}" alt="" class="w-8 h-8 rounded-full object-contain bg-white border border-pink-100" width="32" height="32" loading="lazy">`
    : `<span class="w-8 h-8 rounded-full bg-pink-100 text-[#be185d] flex items-center justify-center font-bold text-xs" aria-hidden="true">${esc(b.initials || initials(b.name))}</span>`;
  return `
<li class="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white border border-pink-200 shadow-sm min-w-[200px]"${clone ? ' data-clone aria-hidden="true"' : ''}>
  ${badge}
  <div>
    <span class="font-headline-sm text-base text-slate-900 font-bold block leading-none">${esc(b.name)}</span>
    <span class="text-[10px] text-[#be185d] font-semibold uppercase tracking-wider">Distribución Directa</span>
  </div>
</li>`;
}

function renderBrands() {
  const track = $('#brandsMarquee');
  const brands = state.brands;
  if (!brands.length) {
    track.innerHTML = '';
    return;
  }
  const chips = (clone) => brands.map((b) => brandChip(b, clone)).join('');
  const group = (content, clone) =>
    `<ul class="flex items-center gap-4 pr-4 flex-shrink-0"${clone ? ' data-clone aria-hidden="true"' : ''}>${content}</ul>`;
  // Si un set no llena el ancho de la pantalla, se repite dentro del grupo hasta cubrirlo.
  track.innerHTML = group(chips(false), false);
  const reps = Math.max(1, Math.ceil(window.innerWidth / Math.max(track.firstElementChild.offsetWidth, 1)));
  const content = chips(false) + chips(true).repeat(reps - 1);
  // Dos grupos idénticos: la animación se desplaza -50% y vuelve a empezar sin salto.
  track.innerHTML = group(content, false) + group(content, true);
  track.style.setProperty('--marquee-duration', `${Math.max(20, brands.length * reps * 3)}s`);
}

function renderNewArrivals() {
  const grid = $('#newArrivalsGrid');
  const items = state.articles.filter((a) => a.isNew);
  grid.innerHTML = items.length
    ? items.map(newArrivalCard).join('')
    : '<p class="col-span-full text-center text-sm text-slate-600 py-10">Pronto vas a ver acá los nuevos ingresos de temporada.</p>';
  grid.setAttribute('aria-busy', 'false');
}

function renderFilters() {
  const box = $('#brandFilters');
  const withArticles = new Set(state.articles.map((a) => a.brand));
  // Orden del carrusel; se agregan marcas de artículos que no estén en el carrusel.
  const names = state.brands.map((b) => b.name).filter((n) => withArticles.has(n));
  withArticles.forEach((n) => !names.includes(n) && names.push(n));
  if (state.brandFilter !== 'all' && !names.includes(state.brandFilter)) state.brandFilter = 'all';
  const btn = (value, label) => {
    const on = state.brandFilter === value;
    const cls = on
      ? 'bg-[#be185d] text-white font-bold shadow-sm border border-[#be185d]'
      : 'bg-pink-50 hover:bg-pink-100 text-slate-700 font-semibold border border-pink-200';
    return `<button type="button" data-brand="${esc(value)}" aria-pressed="${on}" class="px-4 py-2 rounded-full font-label-sm text-xs transition-all ${cls}">${esc(label)}</button>`;
  };
  box.innerHTML = btn('all', 'Todas las Marcas') + names.map((n) => btn(n, n)).join('');
}

function renderCatalog() {
  const grid = $('#catalogGrid');
  // Las novedades ya se ven arriba: en el catálogo van después del resto (orden estable).
  const list = state.articles
    .filter((a) => state.brandFilter === 'all' || a.brand === state.brandFilter)
    .sort((a, b) => Number(a.isNew) - Number(b.isNew));
  const shown = list.slice(0, state.catalogLimit);
  grid.innerHTML = shown.length
    ? shown.map(catalogCard).join('')
    : '<p class="col-span-full text-center text-sm text-slate-600 py-10">No hay artículos cargados para esta marca por el momento.</p>';
  grid.setAttribute('aria-busy', 'false');
  syncAddButtons();
  const more = $('#catalogMore');
  const rest = list.length - shown.length;
  more.classList.toggle('hidden', rest <= 0);
  more.classList.toggle('inline-flex', rest > 0);
  more.querySelector('span:last-child').textContent = `Ver más artículos (${rest})`;
  $('#catalogStatus').textContent = `Mostrando ${shown.length} de ${list.length} artículos${state.brandFilter === 'all' ? '' : ` de ${state.brandFilter}`}.`;
}

$('#brandFilters').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-brand]');
  if (!b) return;
  state.brandFilter = b.dataset.brand;
  state.catalogLimit = CATALOG_PAGE;
  renderFilters();
  renderCatalog();
  $(`#brandFilters button[data-brand="${CSS.escape(state.brandFilter)}"]`)?.focus();
});

$('#catalogMore').addEventListener('click', () => {
  const before = state.catalogLimit;
  state.catalogLimit += CATALOG_PAGE;
  renderCatalog();
  // Lleva el foco al primer artículo nuevo.
  $$('#catalogGrid article')[before]?.querySelector('h3 a')?.focus({ preventScroll: false });
});

function applyHero(banners) {
  const hero = banners.find((b) => b.type === 'hero' && b.active);
  if (!hero) return;
  const img = $('#heroImage');
  const src = safeImg(hero.image, img.getAttribute('src'));
  if (img.getAttribute('src') !== src) img.src = src;
  if (hero.alt || hero.title) img.alt = hero.alt || hero.title;
}

/* ---------------------------------------------------------------- Datos */

async function load() {
  let articles, brands, banners;
  try {
    [articles, brands, banners] = await Promise.all([api('articles'), api('brands'), api('banners')]);
  } catch (err) {
    console.warn('API no disponible, se muestran los datos iniciales.', err.message);
    const seed = await import('../data/seed.js');
    articles = seed.seedArticles();
    brands = seed.seedBrands();
    banners = seed.seedBanners();
  }
  state.articles = articles;
  state.brands = brands;
  renderBrands();
  renderNewArrivals();
  renderFilters();
  renderCatalog();
  applyHero(banners);
  setArticles(articles);
  setProducts(articles);
  syncAddButtons();
}

let resizeTimer;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderBrands, 250);
});

initCart({ onUpdate: syncAddButtons });
initProduct({ onChange: refreshCart });
load();
