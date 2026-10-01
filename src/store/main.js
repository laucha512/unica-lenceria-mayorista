import { formatPrice } from '../config.js';
import { esc, safeImg, formatSizes, api, initials } from '../shared/utils.js';
import { initCart, qtyOf, setArticles, packPrice, refresh as refreshCart } from './cart.js';
import { initProduct, openProduct, setProducts } from './product.js';
import { initMenu, setTree } from './menu.js';
import { buildTreeFrom, slugify, normalizeName } from '../shared/tree.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const CATALOG_PAGE = 6;
const state = {
  articles: [],
  brands: [],
  tree: { categories: [], brands: [] },
  filter: { cat: null, sub: null, brand: null },
  catalogLimit: CATALOG_PAGE,
  search: '',
};

/* ---------------------------------------------------------------- Header */

const header = $('#siteHeader');
const headerHeight = () => header.offsetHeight;
function syncHeaderHeight() {
  document.documentElement.style.setProperty('--header-h', `${headerHeight()}px`);
}
new ResizeObserver(syncHeaderHeight).observe(header);
syncHeaderHeight();

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
/** Títulos largos (ej. con todos los colores y talles) se muestran un poco más chicos. */
const cardTitleSize = (t = '') => (t.length > 60 ? 'text-base' : 'text-lg');

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
    <h3 class="font-headline-sm ${cardTitleSize(a.title)} font-bold text-slate-900 leading-snug">${titleLink(a)}</h3>
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
    <h4 class="font-headline-sm ${cardTitleSize(a.title)} font-bold text-slate-900 leading-tight">${titleLink(a)}</h4>
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

/* ---------------------------------------------------------------- Filtros del catálogo */
// Filtro activo: categoría / subcategoría / marca (slugs). Se refleja en la URL:
// ?categoria=mujeres&subcategoria=conjuntos&marca=kaury

const brandSlug = (name) => slugify(name);

/** Categoría y subcategoría (del árbol) que corresponden al filtro actual. */
function scopeNodes() {
  const { cat, sub } = state.filter;
  const category = cat ? state.tree.categories.find((c) => c.slug === cat) : null;
  const subcategory = category && sub ? category.subcategories.find((s) => s.slug === sub) : null;
  return { category, subcategory };
}

/** Artículos dentro de la categoría/subcategoría elegida (sin aplicar la marca). */
function articlesInScope() {
  const { category, subcategory } = scopeNodes();
  if (subcategory) return state.articles.filter((a) => a.subcategoryId === subcategory.id);
  if (category) {
    const ids = new Set(category.subcategories.map((s) => s.id));
    return state.articles.filter((a) => ids.has(a.subcategoryId));
  }
  return state.articles;
}

/* ---------------------------------------------------------------- Buscador */
// Busca en título, código, marca, descripción, presentación, colores, talles y categoría.
// Sin distinguir mayúsculas ni acentos; todas las palabras tienen que aparecer.

function searchText(a) {
  const sub = state.tree.categories.flatMap((c) => c.subcategories.map((s) => ({ c, s }))).find((x) => x.s.id === a.subcategoryId);
  return normalizeName(
    [a.title, a.code, a.brand, a.description, a.saleType, a.presentation, a.tag, ...(a.colors || []), ...(a.sizes || []), sub?.c.name, sub?.s.name].join(' ')
  );
}

function matchesSearch(a) {
  const terms = normalizeName(state.search).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = searchText(a);
  return terms.every((t) => hay.includes(t));
}

let searchTimer;
function onSearchInput() {
  const input = $('#catalogSearch');
  $('#catalogSearchClear').classList.toggle('hidden', !input.value);
  $('#catalogSearchClear').classList.toggle('inline-flex', !!input.value);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = input.value.trim().slice(0, 80);
    state.catalogLimit = CATALOG_PAGE;
    writeFilterToUrl(false);
    renderCatalog();
  }, 150);
}

$('#catalogSearch').addEventListener('input', onSearchInput);
$('#catalogSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $('#catalogGrid').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  if (e.key === 'Escape' && e.currentTarget.value) {
    e.currentTarget.value = '';
    onSearchInput();
  }
});
$('#catalogSearchClear').addEventListener('click', () => {
  $('#catalogSearch').value = '';
  onSearchInput();
  $('#catalogSearch').focus();
});

function filteredArticles() {
  const brand = state.filter.brand;
  return articlesInScope().filter((a) => (!brand || brandSlug(a.brand) === brand) && matchesSearch(a));
}

/** Normaliza el filtro contra el árbol: descarta slugs que ya no existen. */
function sanitizeFilter() {
  const { category, subcategory } = scopeNodes();
  if (state.filter.cat && !category) state.filter.cat = null;
  if (state.filter.sub && !subcategory) state.filter.sub = null;
  if (!state.filter.cat) state.filter.sub = null;
}

function readFilterFromUrl() {
  const p = new URLSearchParams(location.search);
  state.filter = { cat: p.get('categoria'), sub: p.get('subcategoria'), brand: p.get('marca') };
  state.search = (p.get('buscar') || '').slice(0, 80);
  const input = $('#catalogSearch');
  if (input && input.value !== state.search) {
    input.value = state.search;
    $('#catalogSearchClear').classList.toggle('hidden', !state.search);
    $('#catalogSearchClear').classList.toggle('inline-flex', !!state.search);
  }
}

function writeFilterToUrl(push = true) {
  const p = new URLSearchParams(location.search);
  const set = (k, v) => (v ? p.set(k, v) : p.delete(k));
  set('categoria', state.filter.cat);
  set('subcategoria', state.filter.sub);
  set('marca', state.filter.brand);
  set('buscar', state.search);
  const qs = p.toString();
  // Al reemplazar (carga inicial) se conserva el #producto/… de un enlace directo.
  const url = `${location.pathname}${qs ? `?${qs}` : ''}${push ? '' : location.hash}`;
  if (push) history.pushState({ filter: { ...state.filter } }, '', url);
  else history.replaceState(history.state, '', url);
}

/** Aplica un filtro nuevo (desde el menú, los chips o los botones de marca). */
function applyFilter(next, { scroll = true, push = true } = {}) {
  state.filter = { cat: next.cat || null, sub: next.sub || null, brand: next.brand || null };
  sanitizeFilter();
  state.catalogLimit = CATALOG_PAGE;
  writeFilterToUrl(push);
  renderFilterBar();
  renderFilters();
  renderCatalog();
  if (scroll) {
    const section = $('#articulos-marcas');
    section.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    $('#catalogFilterBar button, #brandFilters button[aria-pressed="true"]')?.focus({ preventScroll: true });
  }
}

function renderFilterBar() {
  const bar = $('#catalogFilterBar');
  const { category, subcategory } = scopeNodes();
  const brandName = state.filter.brand
    ? state.tree.brands.find((b) => b.slug === state.filter.brand)?.name ||
      state.articles.find((a) => brandSlug(a.brand) === state.filter.brand)?.brand ||
      state.filter.brand
    : null;
  if (!category && !brandName) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }
  const crumb = (label, filter, current) =>
    current
      ? `<span class="px-3 py-1.5 rounded-full bg-[#be185d] text-white text-xs font-bold" aria-current="true">${esc(label)}</span>`
      : `<button type="button" data-filter='${esc(JSON.stringify(filter))}' class="px-3 py-1.5 rounded-full bg-pink-50 border border-pink-200 text-slate-800 text-xs font-semibold hover:bg-pink-100">${esc(label)}</button>`;
  const parts = [];
  if (category) parts.push(crumb(category.name, { cat: category.slug }, !subcategory && !brandName));
  if (subcategory) parts.push(crumb(subcategory.name, { cat: category.slug, sub: subcategory.slug }, !brandName));
  if (brandName) parts.push(crumb(brandName, state.filter, true));
  bar.innerHTML = `
    <span class="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-600"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">filter_alt</span> Filtrando:</span>
    ${parts.join('<span class="material-symbols-outlined text-[16px] text-slate-400" aria-hidden="true">chevron_right</span>')}
    <button type="button" data-filter='{}' class="ml-1 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-[#be185d] hover:bg-pink-50 underline">
      <span class="material-symbols-outlined text-[16px]" aria-hidden="true">close</span> Quitar filtros
    </button>`;
  bar.classList.remove('hidden');
}

$('#catalogFilterBar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-filter]');
  if (b) applyFilter(JSON.parse(b.dataset.filter), { scroll: false });
});

/** Botones de marca: las marcas con artículos dentro de la categoría/subcategoría elegida. */
function renderFilters() {
  const box = $('#brandFilters');
  const scope = articlesInScope();
  const names = [];
  const seen = new Set();
  // Orden del carrusel primero; después las marcas que no estén en el carrusel.
  const inScope = new Set(scope.map((a) => brandSlug(a.brand)));
  for (const b of state.brands) {
    const s = brandSlug(b.name);
    if (inScope.has(s) && !seen.has(s)) (seen.add(s), names.push({ slug: s, name: b.name }));
  }
  for (const a of scope) {
    const s = brandSlug(a.brand);
    if (!seen.has(s)) (seen.add(s), names.push({ slug: s, name: a.brand }));
  }
  if (state.filter.brand && !seen.has(state.filter.brand)) names.push({ slug: state.filter.brand, name: state.filter.brand });
  const btn = (value, label) => {
    const on = (state.filter.brand || 'all') === value;
    const cls = on
      ? 'bg-[#be185d] text-white font-bold shadow-sm border border-[#be185d]'
      : 'bg-pink-50 hover:bg-pink-100 text-slate-700 font-semibold border border-pink-200';
    return `<button type="button" data-brand="${esc(value)}" aria-pressed="${on}" class="px-4 py-2 rounded-full font-label-sm text-xs transition-all ${cls}">${esc(label)}</button>`;
  };
  box.innerHTML = btn('all', 'Todas las Marcas') + names.map((n) => btn(n.slug, n.name)).join('');
}

/* ---------------------------------------------------------------- Orden automático por grupos */
// El catálogo se ordena solo según el menú: categoría → subcategoría (orden del admin).
// Dentro de cada grupo: primero con stock, después por marca y los más nuevos primero.

const NO_GROUP = { rank: Number.MAX_SAFE_INTEGER, cat: null, sub: null };

function subcategoryIndex() {
  const map = new Map();
  let rank = 0;
  for (const cat of state.tree.categories) for (const sub of cat.subcategories) map.set(sub.id, { rank: rank++, cat, sub });
  return map;
}

function sortByGroup(list) {
  const idx = subcategoryIndex();
  const groupOf = (a) => idx.get(a.subcategoryId) || NO_GROUP;
  return list
    .map((a) => ({ article: a, group: groupOf(a) }))
    .sort(
      (x, y) =>
        x.group.rank - y.group.rank ||
        Number(y.article.inStock) - Number(x.article.inStock) ||
        String(x.article.brand).localeCompare(String(y.article.brand), 'es') ||
        String(y.article.createdAt || '').localeCompare(String(x.article.createdAt || ''))
    );
}

function groupHeading(group, count, first) {
  const { cat, sub } = group;
  const inSameCategory = state.filter.cat && cat && state.filter.cat === cat.slug;
  const title = sub ? (inSameCategory ? sub.name : `${cat.name} · ${sub.name}`) : 'Otros artículos';
  const canNarrow = sub && state.filter.sub !== sub.slug;
  return `
<div class="col-span-full flex flex-wrap items-end justify-between gap-2 pb-2 border-b-2 border-pink-200 ${first ? '' : 'mt-space-md'}">
  <h3 class="font-headline-sm text-xl md:text-2xl font-bold text-slate-900">${esc(title)} <span class="font-body-md text-sm font-semibold text-slate-600">(${count})</span></h3>
  ${
    canNarrow
      ? `<button type="button" data-filter='${esc(JSON.stringify({ cat: cat.slug, sub: sub.slug, brand: state.filter.brand }))}' class="text-xs font-bold text-[#be185d] hover:underline">Ver solo ${esc(sub.name)}</button>`
      : ''
  }
</div>`;
}

function renderCatalog() {
  const grid = $('#catalogGrid');
  const sorted = sortByGroup(filteredArticles());
  const list = sorted.map((x) => x.article);
  const shown = sorted.slice(0, state.catalogLimit);
  const counts = new Map();
  sorted.forEach((x) => counts.set(x.group, (counts.get(x.group) || 0) + 1));
  let html = '';
  let current = null;
  shown.forEach((x, i) => {
    if (x.group !== current) {
      current = x.group;
      html += groupHeading(x.group, counts.get(x.group), i === 0);
    }
    html += catalogCard(x.article);
  });
  const filtering = state.filter.cat || state.filter.brand || state.search;
  const emptyMsg = state.search
    ? `No encontramos artículos para “${esc(state.search)}”${state.filter.cat || state.filter.brand ? ' con los filtros elegidos' : ''}. Probá con otra palabra.`
    : filtering
      ? 'Todavía no hay artículos cargados con este filtro.'
      : 'No hay artículos cargados por el momento.';
  grid.innerHTML = shown.length
    ? html
    : `<div class="col-span-full text-center py-10">
        <p class="text-sm text-slate-600">${emptyMsg}</p>
        ${filtering ? '<button type="button" data-clear-filter class="mt-3 px-5 py-2.5 rounded-full bg-[#be185d] text-white text-sm font-semibold hover:bg-[#970046]">Ver todo el catálogo</button>' : ''}
      </div>`;
  grid.setAttribute('aria-busy', 'false');
  syncAddButtons();
  const more = $('#catalogMore');
  const rest = list.length - shown.length;
  more.classList.toggle('hidden', rest <= 0);
  more.classList.toggle('inline-flex', rest > 0);
  more.querySelector('span:last-child').textContent = `Ver más artículos (${rest})`;
  $('#catalogStatus').textContent = `Mostrando ${shown.length} de ${list.length} artículos.`;
}

$('#catalogGrid').addEventListener('click', (e) => {
  if (e.target.closest('[data-clear-filter]')) {
    $('#catalogSearch').value = '';
    state.search = '';
    $('#catalogSearchClear').classList.add('hidden');
    return applyFilter({}, { scroll: false });
  }
  const narrow = e.target.closest('button[data-filter]');
  if (narrow) applyFilter(JSON.parse(narrow.dataset.filter), { scroll: true });
});

$('#brandFilters').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-brand]');
  if (!b) return;
  const brand = b.dataset.brand === 'all' ? null : b.dataset.brand;
  applyFilter({ ...state.filter, brand }, { scroll: false });
  $(`#brandFilters button[data-brand="${CSS.escape(b.dataset.brand)}"]`)?.focus();
});

// Atrás / adelante del navegador entre filtros
window.addEventListener('popstate', () => {
  readFilterFromUrl();
  sanitizeFilter();
  state.catalogLimit = CATALOG_PAGE;
  renderFilterBar();
  renderFilters();
  renderCatalog();
});

$('#catalogMore').addEventListener('click', () => {
  const before = state.catalogLimit;
  state.catalogLimit += CATALOG_PAGE;
  renderCatalog();
  // Lleva el foco al primer artículo nuevo.
  $$('#catalogGrid article')[before]?.querySelector('h4 a')?.focus({ preventScroll: false });
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
  let articles, brands, banners, tree;
  try {
    [articles, brands, banners, tree] = await Promise.all([api('articles'), api('brands'), api('banners'), api('categories/tree')]);
  } catch (err) {
    console.warn('API no disponible, se muestran los datos iniciales.', err.message);
    const seed = await import('../data/seed.js');
    articles = seed.seedArticles();
    brands = seed.seedBrands();
    banners = seed.seedBanners();
    tree = buildTreeFrom({ categories: seed.seedCategories(), subcategories: seed.seedSubcategories(), articles, brands });
  }
  state.articles = articles;
  state.brands = brands;
  state.tree = tree;
  setTree(tree);
  readFilterFromUrl();
  sanitizeFilter();
  writeFilterToUrl(false);
  renderBrands();
  renderNewArrivals();
  renderFilterBar();
  renderFilters();
  renderCatalog();
  applyHero(banners);
  setArticles(articles);
  setProducts(articles);
  syncAddButtons();
  // Si se entró con un filtro en la URL, se muestra el catálogo filtrado.
  if ((state.filter.cat || state.filter.brand) && !location.hash) {
    setTimeout(() => $('#articulos-marcas').scrollIntoView({ behavior: 'instant' }), 0);
  }
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
initMenu({ onSelect: (f) => applyFilter(f) });
load();
