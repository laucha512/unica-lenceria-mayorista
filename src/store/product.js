// Ficha de producto: galería con todas las fotos, elección de colores y talles, cantidad y agregado al pedido.
// Tiene URL propia (#producto/<id>) para compartirla y cerrar con "atrás".
import { whatsappLink, formatPrice } from '../config.js';
import { esc, safeImg, formatSizes } from '../shared/utils.js';
import { swatchOf } from '../shared/colors.js';
import { add as addToCart, qtyOf, packPrice } from './cart.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const HASH_RE = /^#producto\/([\w-]{1,80})$/;
const MAX_QTY = 999;

/** Tamaño del título según su largo, para que los nombres largos entren en la ficha. */
const titleSize = (t = '') =>
  t.length > 90 ? 'text-lg md:text-xl' : t.length > 50 ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl';

let articles = new Map();
let current = null; // { article, colors:Set, sizes:Set, qty, photo }
let pushedHistory = false;
let lastFocus = null;
let notify = () => {};

const dialog = () => $('#productDialog');
const isOpen = () => !dialog().classList.contains('hidden');

/* ---------------------------------------------------------------- Render */

function chip(kind, value, on) {
  const hex = kind === 'color' ? swatchOf(value) : null;
  const dot =
    kind === 'color'
      ? hex
        ? `<span class="w-4 h-4 rounded-full border border-slate-300 shrink-0" style="background:${hex}" aria-hidden="true"></span>`
        : '<span class="w-4 h-4 rounded-full border border-dashed border-slate-400 bg-gradient-to-br from-white to-slate-200 shrink-0" aria-hidden="true"></span>'
      : '';
  const cls = on
    ? 'bg-[#be185d] border-[#be185d] text-white'
    : 'bg-white border-pink-200 text-slate-800 hover:border-[#be185d]';
  return `<button type="button" role="radio" data-${kind}="${esc(value)}" aria-checked="${on}" class="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border-2 text-sm font-semibold transition-colors ${cls}">${dot}${esc(value)}${on ? '<span class="material-symbols-outlined text-[18px]" aria-hidden="true">check</span>' : ''}</button>`;
}

function galleryHtml(a) {
  const imgs = (a.images?.length ? a.images : ['/img/logo-unica.webp']).map((u) => safeImg(u));
  const many = imgs.length > 1;
  return `
<div class="group/gallery relative bg-pink-50 md:rounded-l-3xl overflow-hidden min-w-0 md:self-start md:sticky md:top-0">
  <span class="pointer-events-none absolute top-3 right-16 md:right-3 z-10 hidden [@media(hover:hover)]:flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/95 text-slate-800 text-xs font-bold shadow opacity-80 group-hover/gallery:opacity-100 transition-opacity" aria-hidden="true">
    <span class="material-symbols-outlined text-[18px]">zoom_in</span> Pasá el mouse para ampliar
  </span>
  <ul id="productTrack" class="flex overflow-x-auto snap-x snap-mandatory h-[min(70vh,520px)] md:h-[min(85vh,680px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Fotos de ${esc(a.title)}" tabindex="0">
    ${imgs
      .map(
        (src, i) => `<li data-zoom class="relative w-full h-full shrink-0 snap-center overflow-hidden [@media(hover:hover)]:cursor-zoom-in" aria-label="Foto ${i + 1} de ${imgs.length}">
      <img src="${esc(src)}" alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50" ${i ? 'loading="lazy"' : ''} decoding="async">
      <img data-zoom-img src="${esc(src)}" alt="${esc(`${a.title} – ${a.brand}, foto ${i + 1}`)}" class="relative w-full h-full object-contain transition-transform duration-200 ease-out will-change-transform" ${i ? 'loading="lazy"' : ''} decoding="async" width="900" height="1125">
    </li>`
      )
      .join('')}
  </ul>
  ${
    many
      ? `<button type="button" data-photo-step="-1" class="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/95 text-slate-800 shadow-lg flex items-center justify-center hover:text-[#be185d]" aria-label="Foto anterior"><span class="material-symbols-outlined text-[24px]" aria-hidden="true">chevron_left</span></button>
  <button type="button" data-photo-step="1" class="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/95 text-slate-800 shadow-lg flex items-center justify-center hover:text-[#be185d]" aria-label="Foto siguiente"><span class="material-symbols-outlined text-[24px]" aria-hidden="true">chevron_right</span></button>
  <span id="productCounter" class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-slate-900/80 text-white text-xs font-bold" aria-live="polite">1 / ${imgs.length}</span>
  <div class="absolute bottom-3 inset-x-0 flex justify-center gap-2 px-3 overflow-x-auto" role="group" aria-label="Elegir foto">
    ${imgs
      .map(
        (src, i) => `<button type="button" data-photo="${i}" aria-label="Ver foto ${i + 1}" aria-current="${i === 0}" class="w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden border-2 shrink-0 ${i === 0 ? 'border-[#be185d]' : 'border-white/80'} bg-white shadow"><img src="${esc(src)}" alt="" class="w-full h-full object-cover" loading="lazy"></button>`
      )
      .join('')}
  </div>`
      : ''
  }
</div>`;
}

function infoHtml(a) {
  const price = packPrice(a);
  const inCart = qtyOf(a.id);
  const tag = a.inStock
    ? a.tag
      ? `<span class="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">${esc(a.tag)}</span>`
      : ''
    : '<span class="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">Sin stock momentáneo</span>';
  const colorsBlock = a.colors.length
    ? `<fieldset class="mt-5">
      <legend class="text-sm font-bold text-slate-900" id="colorLegend">Elegí un color <span class="text-[#be185d]">*</span></legend>
      <p class="text-xs text-slate-600 mb-2">Para pedir otro color, agregá este y volvé a elegir.</p>
      <div class="flex flex-wrap gap-2" data-group="color" role="radiogroup" aria-labelledby="colorLegend" aria-required="true">${a.colors.map((c) => chip('color', c, current.color === c)).join('')}</div>
      <p class="hidden mt-2 text-sm font-semibold text-red-700" data-error="color" role="alert">Elegí un color para continuar.</p>
    </fieldset>`
    : '';
  const sizesBlock = a.sizes.length
    ? `<fieldset class="mt-5">
      <legend class="text-sm font-bold text-slate-900" id="sizeLegend">Elegí un talle <span class="text-[#be185d]">*</span></legend>
      <p class="text-xs text-slate-600 mb-2">Para pedir otro talle, agregá este y volvé a elegir.</p>
      <div class="flex flex-wrap gap-2" data-group="size" role="radiogroup" aria-labelledby="sizeLegend" aria-required="true">${a.sizes.map((s) => chip('size', s, current.size === s)).join('')}</div>
      <p class="hidden mt-2 text-sm font-semibold text-red-700" data-error="size" role="alert">Elegí un talle para continuar.</p>
    </fieldset>`
    : '';
  return `
<div class="p-5 sm:p-8 flex flex-col min-w-0">
  <div class="flex items-center gap-2 flex-wrap pr-12">
    <span class="text-xs font-bold uppercase tracking-wider text-[#be185d]">${esc(a.brand)}</span>
    ${a.code ? `<span class="text-xs font-semibold text-slate-600 uppercase tracking-wider">· Art. ${esc(a.code)}</span>` : ''}
    ${a.isNew ? '<span class="px-2 py-0.5 rounded-full bg-[#be185d] text-white font-bold text-[10px] uppercase tracking-wider">Novedad</span>' : ''}
    ${tag}
  </div>
  <h2 id="productTitle" class="mt-2 font-headline-sm ${titleSize(a.title)} font-bold text-slate-900 leading-tight break-words [overflow-wrap:anywhere] hyphens-auto">${esc(a.title)}</h2>
  <div class="mt-3 flex items-baseline gap-2 flex-wrap">
    <span class="font-headline-sm text-3xl font-bold text-[#be185d]">${esc(formatPrice(price))}</span>
    <span class="text-sm font-semibold text-slate-700">${esc(a.presentation)}</span>
  </div>
  ${a.description ? `<p class="mt-3 text-sm text-slate-700 leading-relaxed">${esc(a.description)}</p>` : ''}
  <dl class="mt-4 p-3 bg-[#fdf2f8] rounded-xl border border-pink-100 text-sm text-slate-700 space-y-1.5">
    <div class="flex justify-between gap-3"><dt class="font-bold text-slate-900 shrink-0">Curva de talles</dt><dd class="text-right min-w-0 [overflow-wrap:anywhere]">${esc(formatSizes(a.sizes))}</dd></div>
    <div class="flex justify-between gap-3"><dt class="font-bold text-slate-900 shrink-0">Presentación</dt><dd class="text-right min-w-0 [overflow-wrap:anywhere]">${esc(a.saleType || a.presentation)}</dd></div>
  </dl>
  ${colorsBlock}
  ${sizesBlock}
  <div class="mt-6 pt-5 border-t border-pink-100">
    ${
      a.inStock
        ? `<div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span class="block text-xs font-bold uppercase tracking-wider text-slate-600" id="productQtyLabel">Cantidad de packs de esta combinación</span>
          <div class="mt-1 inline-flex items-center rounded-full border-2 border-pink-200 bg-white">
            <button type="button" data-pqty="-1" class="w-11 h-11 inline-flex items-center justify-center rounded-full text-slate-700 hover:text-[#be185d]" aria-label="Un pack menos"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">remove</span></button>
            <input id="productQty" type="number" inputmode="numeric" min="1" max="${MAX_QTY}" value="${current.qty}" aria-labelledby="productQtyLabel" class="w-14 border-0 p-0 text-center text-lg font-bold text-slate-900 focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none">
            <button type="button" data-pqty="1" class="w-11 h-11 inline-flex items-center justify-center rounded-full text-slate-700 hover:text-[#be185d]" aria-label="Un pack más"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">add</span></button>
          </div>
        </div>
        <div class="text-right">
          <span class="block text-xs font-bold uppercase tracking-wider text-slate-600">Subtotal</span>
          <span id="productSubtotal" class="font-headline-sm text-2xl font-bold text-slate-900">${esc(formatPrice(price * current.qty))}</span>
        </div>
      </div>
      <p id="productSelection" class="mt-3 text-xs text-slate-600"></p>
      <button type="button" id="productAdd" class="mt-4 w-full flex items-center justify-center gap-2 min-h-[52px] rounded-full bg-[#be185d] hover:bg-[#970046] text-white font-bold text-base shadow-md transition-colors">
        <span class="material-symbols-outlined text-[22px]" aria-hidden="true">add_shopping_cart</span> <span>Agregar al pedido</span>
      </button>
      <p id="productAdded" class="hidden mt-3 text-sm font-semibold text-emerald-800 text-center" role="status"></p>
      <p id="productInCart" class="mt-2 text-sm text-center ${inCart ? '' : 'hidden'}">
        <span class="font-semibold text-emerald-800" data-in-cart-text>Ya tenés ${inCart} ${inCart === 1 ? 'pack' : 'packs'} en el pedido.</span>
        <button type="button" data-open-cart class="ml-1 font-bold text-[#be185d] underline">Ver pedido</button>
      </p>`
        : `<p class="text-sm text-slate-700">Este artículo no tiene stock en este momento. Consultanos por la reposición:</p>`
    }
    <a href="${esc(whatsappLink(`Hola ÚNICA LENCERÍA, quiero consultar por ${a.brand} Art. ${a.code || '-'} – ${a.title}.`))}" target="_blank" rel="noopener noreferrer" class="mt-3 w-full flex items-center justify-center gap-2 min-h-[48px] rounded-full bg-white border-2 border-pink-200 text-slate-800 hover:border-[#be185d] font-semibold text-sm">
      <span class="material-symbols-outlined text-[18px]" aria-hidden="true">chat</span> Consultar este artículo por WhatsApp
    </a>
  </div>
</div>`;
}

function render() {
  const a = current.article;
  $('#productContent').innerHTML = galleryHtml(a) + infoHtml(a);
  updateSummary();
  const track = $('#productTrack');
  track.addEventListener('scroll', onTrackScroll, { passive: true });
  wireZoom(track);
}

/* ---------------------------------------------------------------- Zoom con el mouse */
// En dispositivos con mouse: al pasar sobre la foto se amplía 2x siguiendo el cursor.
const ZOOM = 2;
const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

function wireZoom(track) {
  track.querySelectorAll('[data-zoom]').forEach((slide) => {
    const img = slide.querySelector('[data-zoom-img]');
    const move = (e) => {
      if (!canHover()) return;
      const r = slide.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
      const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
      img.style.transformOrigin = `${x}% ${y}%`;
      img.style.transform = `scale(${ZOOM})`;
    };
    const reset = () => {
      img.style.transform = '';
      img.style.transformOrigin = '';
    };
    slide.addEventListener('mouseenter', move);
    slide.addEventListener('mousemove', move);
    slide.addEventListener('mouseleave', reset);
  });
}

function renderGroup(group) {
  const box = $(`[data-group="${group}"]`);
  if (!box) return;
  const list = group === 'color' ? current.article.colors : current.article.sizes;
  box.innerHTML = list.map((v) => chip(group, v, current[group] === v)).join('');
}

function updateSummary() {
  const a = current.article;
  const sub = $('#productSubtotal');
  if (sub) sub.textContent = formatPrice(packPrice(a) * current.qty);
  const sel = $('#productSelection');
  if (sel) {
    const parts = [`${current.qty} ${current.qty === 1 ? 'pack' : 'packs'}`];
    if (a.colors.length) parts.push(`Color: ${current.color || '— elegí uno —'}`);
    if (a.sizes.length) parts.push(`Talle: ${current.size || '— elegí uno —'}`);
    sel.textContent = parts.join(' · ');
  }
  const inCart = qtyOf(a.id);
  const note = $('#productInCart');
  if (note) {
    note.classList.toggle('hidden', !inCart);
    $('[data-in-cart-text]', note).textContent = `Ya tenés ${inCart} ${inCart === 1 ? 'pack' : 'packs'} en el pedido.`;
  }
}

/* ---------------------------------------------------------------- Galería */

let scrollRaf;
function onTrackScroll() {
  cancelAnimationFrame(scrollRaf);
  scrollRaf = requestAnimationFrame(() => {
    const track = $('#productTrack');
    if (!track) return;
    const i = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
    setActivePhoto(i, false);
  });
}

function setActivePhoto(i, scroll = true) {
  const track = $('#productTrack');
  const total = track.children.length;
  const idx = Math.max(0, Math.min(total - 1, i));
  current.photo = idx;
  if (scroll) {
    const left = idx * track.clientWidth;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' });
    // Respaldo: si el scroll suave no llega (pestaña en segundo plano, navegadores viejos), salta directo.
    setTimeout(() => {
      if (Math.abs(track.scrollLeft - left) > 4) track.scrollTo({ left, behavior: 'auto' });
    }, 450);
  }
  const counter = $('#productCounter');
  if (counter) counter.textContent = `${idx + 1} / ${total}`;
  $$('[data-photo]').forEach((b, n) => {
    b.setAttribute('aria-current', String(n === idx));
    b.classList.toggle('border-[#be185d]', n === idx);
    b.classList.toggle('border-white/80', n !== idx);
  });
}

/* ---------------------------------------------------------------- Abrir / cerrar */

function show(article) {
  if (!isOpen()) lastFocus = document.activeElement;
  current = { article, color: null, size: null, qty: 1, photo: 0 };
  render();
  dialog().classList.remove('hidden');
  $('#productOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.body.dataset.productOpen = 'true';
  dialog().scrollTop = 0;
  document.title = `${article.title} – ${article.brand} | ÚNICA LENCERÍA Mayorista`;
  $('#productClose').focus();
  notify();
}

function hide() {
  if (!isOpen()) return;
  dialog().classList.add('hidden');
  $('#productOverlay').classList.add('hidden');
  document.body.style.overflow = '';
  delete document.body.dataset.productOpen;
  document.title = BASE_TITLE;
  current = null;
  notify();
  lastFocus?.focus?.({ preventScroll: true });
}

const BASE_TITLE = document.title;

export function openProduct(id) {
  const a = articles.get(id);
  if (!a) return;
  if (location.hash !== `#producto/${id}`) {
    history.pushState({ product: id }, '', `#producto/${id}`);
    pushedHistory = true;
  }
  show(a);
}

function closeProduct() {
  if (pushedHistory) {
    pushedHistory = false;
    history.back(); // popstate cierra la ficha
  } else {
    history.replaceState(null, '', location.pathname + location.search);
    hide();
  }
}

function syncWithHash() {
  const m = location.hash.match(HASH_RE);
  const a = m && articles.get(m[1]);
  if (a) show(a);
  else hide();
}

/* ---------------------------------------------------------------- Inicialización */

export function initProduct({ onChange } = {}) {
  if (onChange) notify = onChange;

  $('#productClose').addEventListener('click', closeProduct);
  $('#productOverlay').addEventListener('click', closeProduct);
  dialog().addEventListener('click', (e) => {
    if (e.target === dialog() || e.target.id === 'productWrap') closeProduct();
  });
  window.addEventListener('popstate', () => {
    pushedHistory = false;
    syncWithHash();
  });

  document.addEventListener('keydown', (e) => {
    if (!isOpen() || !$('#cartDrawer').classList.contains('hidden')) return;
    if (e.key === 'Escape') closeProduct();
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.activeElement?.closest('#productTrack, [data-photo], [data-photo-step]')) {
      e.preventDefault();
      setActivePhoto(current.photo + (e.key === 'ArrowRight' ? 1 : -1));
    }
    if (e.key === 'Tab') {
      const items = [...dialog().querySelectorAll('a[href],button:not([disabled]),input,[tabindex="0"]')].filter((n) => n.offsetParent !== null);
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  $('#productContent').addEventListener('click', (e) => {
    if (!current) return;
    const photo = e.target.closest('[data-photo]');
    if (photo) return setActivePhoto(Number(photo.dataset.photo));
    const step = e.target.closest('[data-photo-step]');
    if (step) return setActivePhoto(current.photo + Number(step.dataset.photoStep));

    const color = e.target.closest('[data-color]');
    const size = e.target.closest('[data-size]');
    if (color || size) {
      const group = color ? 'color' : 'size';
      const value = (color || size).dataset[group];
      current[group] = value;
      renderGroup(group);
      $(`[data-group="${group}"] [data-${group}="${CSS.escape(value)}"]`)?.focus();
      $(`[data-error="${group}"]`)?.classList.add('hidden');
      return updateSummary();
    }

    const q = e.target.closest('[data-pqty]');
    if (q) {
      current.qty = Math.max(1, Math.min(MAX_QTY, current.qty + Number(q.dataset.pqty)));
      $('#productQty').value = current.qty;
      return updateSummary();
    }

    if (e.target.closest('#productAdd')) {
      const a = current.article;
      const missing = [a.colors.length && !current.color && 'color', a.sizes.length && !current.size && 'size'].filter(Boolean);
      missing.forEach((g) => $(`[data-error="${g}"]`)?.classList.remove('hidden'));
      if (missing.length) {
        $(`[data-group="${missing[0]}"] button`)?.focus();
        return;
      }
      addToCart(a.id, current.qty, {
        colors: current.color ? [current.color] : [],
        sizes: current.size ? [current.size] : [],
      });
      const added = [current.color, current.size].filter(Boolean).join(' / ');
      // Selección nueva para la próxima combinación
      current.color = null;
      current.size = null;
      current.qty = 1;
      renderGroup('color');
      renderGroup('size');
      if ($('#productQty')) $('#productQty').value = 1;
      const note = $('#productAdded');
      if (note) {
        note.textContent = `Agregado${added ? `: ${added}` : ''}. Si querés otro color o talle, elegilo y volvé a agregar.`;
        note.classList.remove('hidden');
      }
      const btn = $('#productAdd');
      btn.classList.replace('bg-[#be185d]', 'bg-emerald-700');
      btn.querySelector('span:last-child').textContent = '¡Agregado al pedido!';
      btn.querySelector('.material-symbols-outlined').textContent = 'check';
      setTimeout(() => {
        if (!$('#productAdd')) return;
        btn.classList.replace('bg-emerald-700', 'bg-[#be185d]');
        btn.querySelector('span:last-child').textContent = 'Agregar al pedido';
        btn.querySelector('.material-symbols-outlined').textContent = 'add_shopping_cart';
      }, 1600);
      updateSummary();
    }
  });

  $('#productContent').addEventListener('change', (e) => {
    if (e.target.id !== 'productQty' || !current) return;
    current.qty = Math.max(1, Math.min(MAX_QTY, Math.floor(Number(e.target.value) || 1)));
    e.target.value = current.qty;
    updateSummary();
  });
  // "Ver pedido" dentro de la ficha usa [data-open-cart]: el carrito lo maneja y se abre encima.
}

/** Recibe los artículos cargados y, si la URL apunta a una ficha, la abre. */
export function setProducts(list) {
  articles = new Map(list.map((a) => [a.id, a]));
  syncWithHash();
}

export const productIsOpen = isOpen;
