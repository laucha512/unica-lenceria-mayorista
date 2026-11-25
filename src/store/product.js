// Ficha de producto: galería con todas las fotos, elección de colores y talles, cantidad y agregado al pedido.
// Tiene URL propia (#producto/<id>) para compartirla y cerrar con "atrás".
import { whatsappLink, formatPrice } from '../config.js';
import { esc, safeImg, formatSizes } from '../shared/utils.js';
import { swatchOf } from '../shared/colors.js';
import { availableColors, availableSizes, colorAvailable, combos, comboKey, isSoldOut, sizeAvailable, soldOutCount } from '../shared/stock.js';
import { add as addToCart, qtyOf, packPrice } from './cart.js';
import { hasOffer, regularPrice } from '../shared/prices.js';

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

/** Colores distintos por talle: se elige un talle y después un color de ese talle. */
const bySize = (a) => Object.keys(a.colorsBySize || {}).length > 0;
const chosenSize = () => [...current.sizes][0] || null;
function colorList(a) {
  if (!bySize(a)) return a.colors;
  const size = chosenSize();
  return size ? a.colorsBySize[size] || [] : [];
}
function colorHint(a) {
  if (!bySize(a)) return 'Para pedir otro color, agregá este y volvé a elegir.';
  const size = chosenSize();
  if (!size) return 'Primero elegí un talle: cada talle tiene sus propios colores.';
  return colorList(a).length ? `Colores disponibles en talle ${size}.` : `El talle ${size} no tiene colores para elegir.`;
}

/** ¿Se puede elegir este talle/color con lo que ya está elegido? (lo agotado se muestra tachado) */
function canPick(kind, value) {
  const a = current.article;
  if (kind === 'size') return sizeAvailable(a, value, bySize(a) ? null : current.color);
  return colorAvailable(a, value, bySize(a) ? chosenSize() : null);
}

function chip(kind, value, on) {
  const disabled = !on && !canPick(kind, value);
  const hex = kind === 'color' ? swatchOf(value) : null;
  const dot =
    kind === 'color'
      ? hex
        ? `<span class="w-4 h-4 rounded-full border border-slate-300 shrink-0" style="background:${hex}" aria-hidden="true"></span>`
        : '<span class="w-4 h-4 rounded-full border border-dashed border-slate-400 bg-gradient-to-br from-white to-slate-200 shrink-0" aria-hidden="true"></span>'
      : '';
  const cls = on
    ? 'bg-[#be185d] border-[#be185d] text-white'
    : disabled
      ? 'bg-slate-50 border-slate-200 text-slate-400 line-through cursor-not-allowed'
      : 'bg-white border-pink-200 text-slate-800 hover:border-[#be185d]';
  const role = kind === 'size' && !bySize(current.article) ? 'checkbox' : 'radio';
  return `<button type="button" role="${role}" data-${kind}="${esc(value)}" aria-checked="${on}"${disabled ? ` disabled aria-label="${esc(value)} (agotado)" title="Agotado"` : ''} class="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border-2 text-sm font-semibold transition-colors ${cls}">${dot}${esc(value)}${on ? '<span class="material-symbols-outlined text-[18px]" aria-hidden="true">check</span>' : ''}</button>`;
}

function galleryHtml(a) {
  const imgs = (a.images?.length ? a.images : ['/img/logo-unica.webp']).map((u) => safeImg(u));
  const many = imgs.length > 1;
  return `
<div class="group/gallery relative bg-pink-50 md:rounded-l-3xl overflow-hidden min-w-0 md:self-start md:sticky md:top-6">
  <span class="pointer-events-none absolute top-3 right-16 md:right-3 z-10 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/95 text-slate-800 text-xs font-bold shadow opacity-80 group-hover/gallery:opacity-100 transition-opacity" aria-hidden="true">
    <span class="material-symbols-outlined text-[18px]">zoom_in</span>
    <span class="hidden [@media(hover:hover)]:inline">Pasá el mouse para ampliar</span>
    <span class="[@media(hover:hover)]:hidden" data-zoom-hint>Pellizcá con dos dedos para ampliar</span>
  </span>
  <ul id="productTrack" class="flex overflow-hidden h-[min(70svh,520px)] md:h-[min(85svh,680px)] touch-pan-y select-none" aria-label="Fotos de ${esc(a.title)}" tabindex="0">
    ${imgs
      .map(
        (src, i) => `<li data-zoom class="relative w-full h-full shrink-0 overflow-hidden [@media(hover:hover)]:cursor-zoom-in" aria-label="Foto ${i + 1} de ${imgs.length}">
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
  const colorsBlock = a.colors.length || bySize(a)
    ? `<fieldset class="mt-5">
      <legend class="text-sm font-bold text-slate-900" id="colorLegend">Elegí un color <span class="text-[#be185d]">*</span></legend>
      <p class="text-xs text-slate-600 mb-2" data-color-hint aria-live="polite">${esc(colorHint(a))}</p>
      <div class="flex flex-wrap gap-2" data-group="color" role="radiogroup" aria-labelledby="colorLegend" aria-required="true">${colorList(a).map((c) => chip('color', c, current.color === c)).join('')}</div>
      <p class="hidden mt-2 text-sm font-semibold text-red-700" data-error="color" role="alert">Elegí un color para continuar.</p>
    </fieldset>`
    : '';
  const one = bySize(a);
  const sizesBlock = a.sizes.length
    ? `<fieldset class="mt-5">
      <legend class="text-sm font-bold text-slate-900" id="sizeLegend">${one ? 'Elegí un talle' : 'Elegí uno o más talles'} <span class="text-[#be185d]">*</span></legend>
      <p class="text-xs text-slate-600 mb-2">${one ? 'Según el talle vas a ver sus colores. Para otro talle, agregá este y volvé a elegir.' : 'Podés marcar varios: se agrega la cantidad elegida de cada talle.'}</p>
      <div class="flex flex-wrap gap-2" data-group="size" role="${one ? 'radiogroup' : 'group'}" aria-labelledby="sizeLegend">${a.sizes.map((s) => chip('size', s, current.sizes.has(s))).join('')}</div>
      <p class="hidden mt-2 text-sm font-semibold text-red-700" data-error="size" role="alert">${one ? 'Elegí un talle para continuar.' : 'Elegí al menos un talle para continuar.'}</p>
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
    ${hasOffer(a) ? `<span class="px-2 py-0.5 rounded-full bg-[#be185d] text-white text-xs font-bold self-center">Oferta</span><s class="text-lg text-slate-500">${esc(formatPrice(regularPrice(a)))}</s>` : ''}<span class="font-headline-sm text-3xl font-bold text-[#be185d]">${esc(formatPrice(price))}</span>
    <span class="text-sm font-semibold text-slate-700">${esc(a.presentation)}</span>
  </div>
  ${a.description ? `<p class="mt-3 text-sm text-slate-700 leading-relaxed">${esc(a.description)}</p>` : ''}
  <dl class="mt-4 p-3 bg-[#fdf2f8] rounded-xl border border-pink-100 text-sm text-slate-700 space-y-1.5">
    <div class="flex justify-between gap-3"><dt class="font-bold text-slate-900 shrink-0">Curva de talles</dt><dd class="text-right min-w-0 [overflow-wrap:anywhere]">${esc(formatSizes(availableSizes(a)))}</dd></div>
    ${soldOutCount(a) ? '<div class="text-xs text-slate-600">Lo que aparece <span class="line-through">tachado</span> está agotado por ahora.</div>' : ''}
    <div class="flex justify-between gap-3"><dt class="font-bold text-slate-900 shrink-0">Presentación</dt><dd class="text-right min-w-0 [overflow-wrap:anywhere]">${esc(a.saleType || a.presentation)}</dd></div>
  </dl>
  ${bySize(a) ? sizesBlock + colorsBlock : colorsBlock + sizesBlock}
  <div class="mt-6 pt-5 border-t border-pink-100">
    ${
      a.inStock
        ? `<div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span class="block text-xs font-bold uppercase tracking-wider text-slate-600" id="productQtyLabel">${bySize(a) ? 'Cantidad de packs' : 'Cantidad de packs por talle'}</span>
          <div class="mt-1 inline-flex items-center rounded-full border-2 border-pink-200 bg-white">
            <button type="button" data-pqty="-1" class="w-11 h-11 inline-flex items-center justify-center rounded-full text-slate-700 hover:text-[#be185d]" aria-label="Un pack menos"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">remove</span></button>
            <input id="productQty" type="number" inputmode="numeric" min="1" max="${MAX_QTY}" value="${current.qty}" aria-labelledby="productQtyLabel" class="w-14 border-0 p-0 text-center text-lg font-bold text-slate-900 focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none">
            <button type="button" data-pqty="1" class="w-11 h-11 inline-flex items-center justify-center rounded-full text-slate-700 hover:text-[#be185d]" aria-label="Un pack más"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">add</span></button>
          </div>
        </div>
        <div class="text-right">
          <span class="block text-xs font-bold uppercase tracking-wider text-slate-600">Subtotal</span>
          <span id="productSubtotal" class="font-headline-sm text-2xl font-bold text-slate-900">${esc(formatPrice(price * current.qty * Math.max(1, current.sizes.size)))}</span>
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
    ${restockHtml(a)}
    <div class="mt-3 grid grid-cols-2 gap-2">
      <button type="button" data-share class="flex items-center justify-center gap-2 min-h-[44px] rounded-full bg-pink-50 border border-pink-200 text-slate-800 hover:border-[#be185d] font-semibold text-sm">
        <span class="material-symbols-outlined text-[18px]" aria-hidden="true">share</span> <span data-share-label>Compartir</span>
      </button>
      <button type="button" data-download-photos class="flex items-center justify-center gap-2 min-h-[44px] rounded-full bg-pink-50 border border-pink-200 text-slate-800 hover:border-[#be185d] font-semibold text-sm">
        <span class="material-symbols-outlined text-[18px]" aria-hidden="true">download</span> ${a.images?.length > 1 ? 'Descargar fotos' : 'Descargar foto'}
      </button>
    </div>
    <p id="productShareMsg" class="hidden mt-2 text-xs text-center font-semibold text-emerald-800" role="status"></p>
  </div>
</div>`;
}

/* ---------------------------------------------------------------- Avisame cuando vuelva */
// Si el artículo no tiene stock (o tiene talles/colores agotados), la clienta deja su WhatsApp
// y el admin le avisa cuando se repone (admin → Esperando stock).

function savedCartInfo() {
  try {
    return JSON.parse(localStorage.getItem('unica_pedido_v2') || '{}').info || {};
  } catch {
    return {};
  }
}

const comboLabel = (c) => [c.size && `Talle ${c.size}`, c.color].filter(Boolean).join(' · ');

function restockHtml(a) {
  const soldOut = a.inStock ? combos(a).filter((c) => isSoldOut(a, c.size, c.color)) : [];
  if (a.inStock && !soldOut.length) return '';
  const info = savedCartInfo();
  return `<form data-restock class="mt-4 p-4 rounded-2xl bg-pink-50 border border-pink-200" novalidate>
    <p class="text-sm font-bold text-slate-900">Avisame cuando vuelva</p>
    <p class="text-xs text-slate-600 mt-0.5">Dejanos tu WhatsApp y te escribimos apenas haya stock.</p>
    ${
      soldOut.length
        ? `<label class="block mt-3 text-xs font-semibold text-slate-700">¿Qué estás esperando?
            <select name="combo" class="mt-1 w-full rounded-xl border-pink-200 focus:border-[#be185d] focus:ring-[#be185d] text-base">${soldOut
              .map((c) => `<option value="${esc(comboKey(c.size, c.color))}">${esc(comboLabel(c) || 'Este artículo')}</option>`)
              .join('')}</select></label>`
        : ''
    }
    <label class="block mt-3 text-xs font-semibold text-slate-700">Tu WhatsApp
      <input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" value="${esc(info.phone || '')}" placeholder="Ej. 341 555-1234" class="mt-1 w-full rounded-xl border-pink-200 focus:border-[#be185d] focus:ring-[#be185d] text-base">
    </label>
    <input type="hidden" name="name" value="${esc(info.name || '')}">
    <button type="submit" class="mt-3 w-full min-h-[44px] rounded-full bg-[#be185d] hover:bg-[#970046] text-white font-bold text-sm">Avisame</button>
    <p data-restock-msg class="hidden mt-2 text-sm font-semibold text-center" role="status"></p>
  </form>`;
}

async function onRestockSubmit(form) {
  const msg = form.querySelector('[data-restock-msg]');
  const say = (text, ok) => {
    msg.textContent = text;
    msg.className = `mt-2 text-sm font-semibold text-center ${ok ? 'text-emerald-800' : 'text-red-700'}`;
  };
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const res = await fetch('/api/restock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId: current.article.id, phone: form.phone.value, name: form.name.value, combo: form.combo?.value || '' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return say(data.error || 'No se pudo guardar. Probá de nuevo.', false);
    say('¡Listo! Te avisamos por WhatsApp cuando vuelva.', true);
  } catch {
    say('No se pudo guardar. Revisá tu conexión.', false);
  } finally {
    btn.disabled = false;
  }
}

/* ---------------------------------------------------------------- Compartir (para revendedoras) */
// Comparte las fotos y un texto del artículo SIN el precio mayorista: es para mandarle a sus clientas.

function shareText(a) {
  const colors = availableColors(a).join(', ');
  return [
    a.title,
    `${a.brand}${a.code ? ` · Art. ${a.code}` : ''}`,
    availableSizes(a).length ? `Talles: ${formatSizes(availableSizes(a))}` : '',
    colors ? `Colores: ${colors}` : '',
    a.presentation ? `Presentación: ${a.presentation}` : '',
    '',
    '¡Consultame por disponibilidad!',
  ]
    .filter((l, i, all) => l || (i > 0 && all[i - 1]))
    .join('\n');
}

// Fotos en JPG (WhatsApp e Instagram las toman mejor que WebP), hasta 5.
const shareCache = new Map(); // id del artículo -> File[]
async function photoFiles(a) {
  if (shareCache.has(a.id)) return shareCache.get(a.id);
  const srcs = (a.images || []).slice(0, 5).map((s) => safeImg(s)).filter((s) => /^\/(api\/images\?|img\/)/.test(s));
  const base = `${a.brand}-${a.code || a.id}`.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const files = (
    await Promise.all(
      srcs.map(async (src, i) => {
        try {
          let res = await fetch(`/.netlify/images?url=${encodeURIComponent(src)}&w=1200&fm=jpg&q=85`);
          if (!res.ok) res = await fetch(src);
          const blob = await res.blob();
          const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1] || 'jpg';
          return new File([blob], `${base}-${i + 1}.${ext}`, { type: blob.type || 'image/jpeg' });
        } catch {
          return null;
        }
      })
    )
  ).filter(Boolean);
  shareCache.set(a.id, files);
  return files;
}

function shareMessage(msg) {
  const el = $('#productShareMsg');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function downloadFiles(files) {
  files.forEach((file, i) =>
    setTimeout(() => {
      const url = URL.createObjectURL(file);
      const link = Object.assign(document.createElement('a'), { href: url, download: file.name });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, i * 400)
  );
}

async function onShare(btn) {
  const a = current.article;
  const text = shareText(a);
  const label = btn.querySelector('[data-share-label]');
  const prepared = shareCache.has(a.id);
  if (!prepared) label.textContent = 'Preparando…';
  btn.disabled = true;
  try {
    const files = await photoFiles(a);
    if (navigator.share && navigator.canShare?.({ files, text })) {
      await navigator.share({ files, text, title: a.title });
      shareMessage('');
    } else if (navigator.share) {
      await navigator.share({ text, title: a.title });
    } else {
      // Computadora sin menú de compartir: se copia el texto y se descargan las fotos.
      const copied = await copyText(text);
      downloadFiles(files);
      shareMessage(`${copied ? 'Texto copiado. ' : ''}Se descargaron las fotos para que las compartas.`);
    }
  } catch (err) {
    if (err?.name === 'NotAllowedError' && !prepared) {
      // Algunos celulares piden tocar de nuevo después de preparar las fotos.
      shareMessage('Las fotos ya están listas: tocá “Compartir” otra vez.');
    } else if (err?.name !== 'AbortError') {
      shareMessage('No se pudo compartir. Probá con “Descargar fotos”.');
    }
  } finally {
    btn.disabled = false;
    label.textContent = 'Compartir';
  }
}

async function onDownloadPhotos(btn) {
  const a = current.article;
  btn.disabled = true;
  try {
    const files = await photoFiles(a);
    if (!files.length) return shareMessage('No se pudieron descargar las fotos.');
    downloadFiles(files);
    shareMessage(files.length > 1 ? `Descargando ${files.length} fotos…` : 'Descargando la foto…');
  } finally {
    btn.disabled = false;
  }
}

function render() {
  const a = current.article;
  $('#productContent').innerHTML = galleryHtml(a) + infoHtml(a);
  updateSummary();
  const track = $('#productTrack');
  track.addEventListener('scroll', onTrackScroll, { passive: true });
  wireZoom(track);
}

/* ---------------------------------------------------------------- Zoom y gestos de la galería */
// Mouse: al pasar sobre la foto se amplía 2x siguiendo el cursor.
// Celular: se amplía pellizcando con dos dedos (hasta 4x); con zoom se arrastra con un dedo para
// recorrer la foto, y al achicarla del todo vuelve a su tamaño. El carrusel solo cambia de foto con
// un deslizamiento claramente horizontal: al scrollear arriba/abajo la foto queda quieta y entera.
const ZOOM = 2;
const MAX_PINCH = 4;
const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

let touchZoom = null; // { slide, s, tx, ty } de la foto ampliada con los dedos

const pct = (v, min, size) => Math.min(100, Math.max(0, ((v - min) / size) * 100));
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function zoomAt(slide, clientX, clientY) {
  const img = slide.querySelector('[data-zoom-img]');
  const r = slide.getBoundingClientRect();
  img.style.transformOrigin = `${pct(clientX, r.left, r.width)}% ${pct(clientY, r.top, r.height)}%`;
  img.style.transform = `scale(${ZOOM})`;
}

function unzoom(slide) {
  const img = slide.querySelector('[data-zoom-img]');
  img.style.transform = '';
  img.style.transformOrigin = '';
  img.style.transition = '';
}

// Aplica escala y desplazamiento sin dejar bordes vacíos dentro del cuadro.
function applyPinch(z) {
  const w = z.slide.clientWidth;
  const h = z.slide.clientHeight;
  z.tx = clamp(z.tx, w - z.s * w, 0);
  z.ty = clamp(z.ty, h - z.s * h, 0);
  const img = z.slide.querySelector('[data-zoom-img]');
  img.style.transformOrigin = '0 0';
  img.style.transform = `translate(${z.tx}px, ${z.ty}px) scale(${z.s})`;
}

function setZoomHint(zoomed) {
  const hint = $('[data-zoom-hint]');
  if (hint) hint.textContent = zoomed ? 'Pellizcá para achicar' : 'Pellizcá con dos dedos para ampliar';
}

function resetTouchZoom() {
  if (!touchZoom) return;
  unzoom(touchZoom.slide);
  touchZoom.slide.style.touchAction = '';
  touchZoom = null;
  setZoomHint(false);
}

function wireZoom(track) {
  // Mouse
  track.querySelectorAll('[data-zoom]').forEach((slide) => {
    const move = (e) => canHover() && zoomAt(slide, e.clientX, e.clientY);
    slide.addEventListener('mouseenter', move);
    slide.addEventListener('mousemove', move);
    slide.addEventListener('mouseleave', () => canHover() && unzoom(slide));
  });

  // Táctil
  let swipe = null; // un dedo sin zoom: posible deslizamiento a otra foto
  let pan = null; // un dedo con zoom: recorrer la foto
  let pinch = null; // dos dedos: ampliar/achicar

  const local = (slide, x, y) => {
    const r = slide.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  };
  const mid = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  function beginOneFinger(t) {
    if (touchZoom) pan = { x: t.clientX, y: t.clientY, tx: touchZoom.tx, ty: touchZoom.ty };
    else swipe = { x: t.clientX, y: t.clientY };
  }

  track.addEventListener(
    'touchstart',
    (e) => {
      const slide = e.target.closest('[data-zoom]');
      if (!slide) return;
      if (e.touches.length === 2) {
        swipe = pan = null;
        if (touchZoom && touchZoom.slide !== slide) resetTouchZoom();
        if (!touchZoom) touchZoom = { slide, s: 1, tx: 0, ty: 0 };
        const m = local(slide, ...Object.values(mid(e.touches[0], e.touches[1])));
        pinch = { d: dist(e.touches[0], e.touches[1]) || 1, s: touchZoom.s, px: (m.x - touchZoom.tx) / touchZoom.s, py: (m.y - touchZoom.ty) / touchZoom.s };
        slide.querySelector('[data-zoom-img]').style.transition = 'none';
        slide.style.touchAction = 'none';
      } else if (e.touches.length === 1) {
        beginOneFinger(e.touches[0]);
      }
    },
    { passive: true }
  );

  track.addEventListener(
    'touchmove',
    (e) => {
      if (pinch && e.touches.length === 2 && touchZoom) {
        e.preventDefault(); // el pellizco amplía la foto, no la página
        const z = touchZoom;
        z.s = clamp(pinch.s * (dist(e.touches[0], e.touches[1]) / pinch.d), 1, MAX_PINCH);
        const m = local(z.slide, ...Object.values(mid(e.touches[0], e.touches[1])));
        z.tx = m.x - z.s * pinch.px;
        z.ty = m.y - z.s * pinch.py;
        applyPinch(z);
      } else if (pan && e.touches.length === 1 && touchZoom) {
        e.preventDefault(); // con zoom, arrastrar recorre la foto (y no scrollea la página)
        const t = e.touches[0];
        touchZoom.tx = pan.tx + (t.clientX - pan.x);
        touchZoom.ty = pan.ty + (t.clientY - pan.y);
        touchZoom.slide.querySelector('[data-zoom-img]').style.transition = 'none';
        applyPinch(touchZoom);
      }
    },
    { passive: false }
  );

  const end = (e) => {
    if (pinch && e.touches.length < 2) {
      pinch = null;
      if (touchZoom && touchZoom.s < 1.05) resetTouchZoom();
      else setZoomHint(true);
      // Si queda un dedo apoyado, sigue recorriendo la foto (nunca cambia de foto).
      if (e.touches.length === 1 && touchZoom) beginOneFinger(e.touches[0]);
      return;
    }
    if (swipe && !touchZoom && e.touches.length === 0) {
      const t = e.changedTouches[0];
      const dx = t.clientX - swipe.x;
      const dy = t.clientY - swipe.y;
      // Deslizamiento horizontal claro: foto anterior/siguiente.
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) setActivePhoto(current.photo + (dx < 0 ? 1 : -1));
    }
    if (e.touches.length === 0) swipe = pan = null;
  };
  track.addEventListener('touchend', end);
  track.addEventListener('touchcancel', end);

  // Si cambia el ancho (rotar el celular), la foto actual queda centrada en su cuadro.
  new ResizeObserver(() => {
    resetTouchZoom();
    if (current) track.scrollLeft = current.photo * track.clientWidth;
  }).observe(track);
}

function renderGroup(group) {
  const box = $(`[data-group="${group}"]`);
  if (!box) return;
  const list = group === 'color' ? colorList(current.article) : current.article.sizes;
  if (group === 'color') {
    const hint = $('[data-color-hint]');
    if (hint) hint.textContent = colorHint(current.article);
  }
  box.innerHTML = list.map((v) => chip(group, v, group === 'size' ? current.sizes.has(v) : current.color === v)).join('');
}

function updateSummary() {
  const a = current.article;
  const sub = $('#productSubtotal');
  const sizeCount = Math.max(1, current.sizes.size);
  if (sub) sub.textContent = formatPrice(packPrice(a) * current.qty * sizeCount);
  const sel = $('#productSelection');
  if (sel) {
    const parts = [`${current.qty} ${current.qty === 1 ? 'pack' : 'packs'}`];
    if (colorList(a).length) parts.push(`Color: ${current.color || '— elegí uno —'}`);
    if (a.sizes.length) {
      const chosen = a.sizes.filter((x) => current.sizes.has(x));
      parts.push(chosen.length ? `Talle${chosen.length > 1 ? 's' : ''}: ${chosen.join(', ')}` : 'Talle: — elegí uno o más —');
      if (chosen.length > 1) parts.push(`${current.qty * chosen.length} packs en total`);
    }
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
  if (idx !== current.photo) resetTouchZoom();
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

let savedScroll = null; // posición de la página al abrir la ficha

/** Cuenta una vista de la ficha (una por artículo y por visita), para las estadísticas del admin. */
function countView(id) {
  try {
    const key = 'unica_fichas_vistas';
    const seen = new Set(JSON.parse(sessionStorage.getItem(key) || '[]'));
    if (seen.has(id)) return;
    seen.add(id);
    sessionStorage.setItem(key, JSON.stringify([...seen].slice(-300)));
  } catch {
    /* sin almacenamiento: se cuenta igual */
  }
  fetch('/api/stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    keepalive: true,
  }).catch(() => {});
}

function show(article) {
  countView(article.id);
  if (!isOpen()) {
    lastFocus = document.activeElement;
    savedScroll = window.scrollY;
  }
  current = { article, color: null, sizes: new Set(), qty: 1, photo: 0 };
  touchZoom = null;
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
  // Al cerrar, la página queda exactamente donde estaba (el celular a veces la mueve).
  if (savedScroll !== null) {
    const y = savedScroll;
    savedScroll = null;
    window.scrollTo({ top: y, behavior: 'instant' });
    requestAnimationFrame(() => Math.abs(window.scrollY - y) > 2 && window.scrollTo({ top: y, behavior: 'instant' }));
  }
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
    const share = e.target.closest('[data-share]');
    if (share) return onShare(share);
    const download = e.target.closest('[data-download-photos]');
    if (download) return onDownloadPhotos(download);
    const photo = e.target.closest('[data-photo]');
    if (photo) return setActivePhoto(Number(photo.dataset.photo));
    const step = e.target.closest('[data-photo-step]');
    if (step) return setActivePhoto(current.photo + Number(step.dataset.photoStep));

    const color = e.target.closest('[data-color]');
    const size = e.target.closest('[data-size]');
    if (color || size) {
      const group = color ? 'color' : 'size';
      const value = (color || size).dataset[group];
      const a = current.article;
      if (color) {
        current.color = value;
        if (!bySize(a)) {
          // Los talles que no hay en este color se desmarcan y quedan tachados.
          const dropped = [...current.sizes].filter((s) => !sizeAvailable(a, s, value));
          dropped.forEach((s) => current.sizes.delete(s));
          renderGroup('size');
          if (dropped.length) {
            const note = $('#productAdded');
            note.textContent = `En ${value} no hay talle ${dropped.join(', ')}: lo sacamos de tu elección.`;
            note.classList.remove('hidden');
          }
        }
      } else if (bySize(a)) {
        current.sizes = new Set([value]);
        if (!colorList(a).includes(current.color) || !colorAvailable(a, current.color, value)) current.color = null;
        renderGroup('color');
      } else current.sizes.has(value) ? current.sizes.delete(value) : current.sizes.add(value);
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
      const needColor = colorList(a).length && !current.color;
      const needSize = a.sizes.length && !current.sizes.size;
      const missing = bySize(a) ? [needSize && 'size', !needSize && needColor && 'color'].filter(Boolean) : [needColor && 'color', needSize && 'size'].filter(Boolean);
      missing.forEach((g) => $(`[data-error="${g}"]`)?.classList.remove('hidden'));
      if (missing.length) {
        $(`[data-group="${missing[0]}"] button`)?.focus();
        return;
      }
      // Última verificación: nunca se agrega una combinación agotada.
      const chosenSizes = a.sizes.filter((x) => current.sizes.has(x) && sizeAvailable(a, x, current.color));
      if (current.sizes.size && !chosenSizes.length) return;
      const colors = current.color ? [current.color] : [];
      if (chosenSizes.length) chosenSizes.forEach((sz) => addToCart(a.id, current.qty, { colors, sizes: [sz] }));
      else addToCart(a.id, current.qty, { colors, sizes: [] });
      const added = [current.color, chosenSizes.join(', ')].filter(Boolean).join(' / ');
      // Selección nueva para la próxima combinación
      current.color = null;
      current.sizes = new Set();
      current.qty = 1;
      renderGroup('color');
      renderGroup('size');
      if ($('#productQty')) $('#productQty').value = 1;
      const note = $('#productAdded');
      if (note) {
        note.textContent = `Agregado${added ? `: ${added}` : ''}. ${bySize(a) ? 'Para otro talle o color, elegilo y volvé a agregar.' : 'Para otro color, elegilo y volvé a agregar.'}`;
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

  $('#productContent').addEventListener('submit', (e) => {
    const form = e.target.closest('[data-restock]');
    if (!form || !current) return;
    e.preventDefault();
    onRestockSubmit(form);
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
