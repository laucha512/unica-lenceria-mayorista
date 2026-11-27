// Carrito de pedido mayorista: se guarda en el navegador y se envía como mensaje de WhatsApp.
// Cada línea es un artículo + la selección de colores y talles elegida en su ficha.
import { whatsappLink, formatPrice } from '../config.js';
import { formatWhatsapp, normalizeWhatsapp } from '../shared/phone.js';
import { isSoldOut } from '../shared/stock.js';
import { esc, safeImg } from '../shared/utils.js';

// v2: una línea = un color + un talle (se descartan pedidos guardados con selección múltiple).
const STORE_KEY = 'unica_pedido_v2';
const MAX_QTY = 999;

const $ = (sel) => document.querySelector(sel);

const state = {
  items: [], // [{ key, id, qty, colors: [], sizes: [] }]
  info: { phone: '', name: '', city: '', delivery: '', notes: '' },
  articles: new Map(), // id -> artículo (datos actuales de la API)
};

const cleanList = (v) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.slice(0, 40)).slice(0, 30) : [];
const keyOf = (id, colors, sizes) => `${id}::${colors.join('|')}::${sizes.join('|')}`;

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (data && Array.isArray(data.items)) {
      state.items = data.items
        .filter((i) => i && typeof i.id === 'string' && Number.isInteger(i.qty) && i.qty > 0)
        .map((i) => {
          const colors = cleanList(i.colors);
          const sizes = cleanList(i.sizes);
          return { key: keyOf(i.id, colors, sizes), id: i.id, qty: Math.min(i.qty, MAX_QTY), colors, sizes };
        });
    }
    if (data?.info && typeof data.info === 'object') {
      for (const k of Object.keys(state.info)) state.info[k] = String(data.info[k] || '').slice(0, 400);
    }
  } catch {
    /* almacenamiento no disponible: el pedido vive mientras la página esté abierta */
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ items: state.items, info: state.info }));
  } catch {
    /* ignore */
  }
}

// Precio que se cobra: el de oferta si tiene, si no el normal.
export { salePrice as packPrice } from '../shared/prices.js';
import { salePrice as packPrice } from '../shared/prices.js';

/** Líneas del pedido con los datos actuales de cada artículo (ignora los que ya no existen). */
function lines() {
  return state.items.map((i) => ({ ...i, article: state.articles.get(i.id) })).filter((l) => l.article);
}

export const totals = () => {
  const ls = lines();
  return {
    count: ls.reduce((n, l) => n + l.qty, 0),
    total: ls.reduce((t, l) => t + l.qty * packPrice(l.article), 0),
    lines: ls,
  };
};

/** Packs de un artículo en el pedido, sumando todas sus combinaciones de colores/talles. */
export const qtyOf = (id) => state.items.filter((i) => i.id === id).reduce((n, i) => n + i.qty, 0);

/** Agrega packs de un artículo con la selección dada (se ordena según el artículo). */
export function add(id, qty = 1, { colors = [], sizes = [] } = {}) {
  const a = state.articles.get(id);
  const order = (sel, all = []) => [...sel].sort((x, y) => all.indexOf(x) - all.indexOf(y));
  const c = order(colors, a?.colors);
  const s = order(sizes, a?.sizes);
  const key = keyOf(id, c, s);
  const item = state.items.find((i) => i.key === key);
  if (item) item.qty = Math.min(item.qty + qty, MAX_QTY);
  else state.items.push({ key, id, qty: Math.min(qty, MAX_QTY), colors: c, sizes: s });
  sentNotice = ''; // ya está armando algo nuevo
  save();
  render();
}

function setQty(key, qty) {
  const q = Math.max(0, Math.min(MAX_QTY, Math.floor(Number(qty) || 0)));
  state.items = q ? state.items.map((i) => (i.key === key ? { ...i, qty: q } : i)) : state.items.filter((i) => i.key !== key);
  save();
  render();
}

function clear() {
  state.items = [];
  save();
  render();
}

const selectionText = (l) => [
  l.colors.length === 1 ? `Color: ${l.colors[0]}` : `Colores: ${l.colors.length ? l.colors.join(', ') : 'surtidos'}`,
  l.sizes.length === 1 ? `Talle: ${l.sizes[0]}` : `Talles: ${l.sizes.length ? l.sizes.join(', ') : 'curva completa'}`,
];

/** Mensaje de WhatsApp. Con `code` (lo da el servidor) lo incluye; `merged` = se suma a un pedido abierto. */
export function buildMessage({ code = '', merged = false } = {}) {
  const { lines: ls, total, count } = totals();
  const out = merged
    ? [`¡Hola ÚNICA LENCERÍA! Quiero sumar esto a mi pedido ${code}:`, '']
    : ['¡Hola ÚNICA LENCERÍA! Quiero hacer este pedido mayorista:', ...(code ? [`Código de pedido: ${code}`] : []), ''];
  ls.forEach((l, n) => {
    const a = l.article;
    const price = packPrice(a);
    out.push(`${n + 1}. ${a.brand}${a.code ? ` – Art. ${a.code}` : ''} – ${a.title}`);
    out.push(`   ${selectionText(l).join(' · ')}`);
    out.push(`   ${l.qty} x ${a.presentation} a ${formatPrice(price)} = ${formatPrice(l.qty * price)}`);
  });
  out.push('', `${merged ? 'Total de lo que sumo' : 'Total estimado'}: ${formatPrice(total)} (${count} ${count === 1 ? 'pack' : 'packs'})`);
  const { name, city, delivery, notes } = state.info;
  const extra = [
    name && `Nombre / comercio: ${name}`,
    city && `Localidad: ${city}`,
    `Entrega: ${delivery || 'A coordinar'}`,
    notes && `Aclaraciones: ${notes}`,
  ].filter(Boolean);
  out.push('', ...extra, '', 'Quedo atenta/o a la confirmación de stock y precios. ¡Gracias!');
  return out.join('\n');
}

/* ---------------------------------------------------------------- UI */

let onChange = () => {};
let sentNotice = ''; // aviso "pedido registrado" que se muestra hasta que se agregue algo nuevo

function showSendError(msg) {
  const el = $('#cartSendError');
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

function setSendBusy(busy) {
  const btn = $('#cartSend');
  btn.setAttribute('aria-busy', String(busy));
  btn.classList.toggle('opacity-70', busy);
  btn.querySelector('[data-send-label]').textContent = busy ? 'Registrando pedido…' : 'Enviar pedido por WhatsApp';
}

/** La combinación de esta línea (un talle y un color) se agotó después de agregarla. */
const lineSoldOut = (l) => (l.sizes.length <= 1 && l.colors.length <= 1 ? isSoldOut(l.article, l.sizes[0], l.colors[0]) : false);

function lineItem(l) {
  const a = l.article;
  const price = packPrice(a);
  const [colorsTxt, sizesTxt] = selectionText(l);
  return `
<li class="flex gap-3 p-3 rounded-2xl border border-pink-100 bg-[#fdf8fa]" data-key="${esc(l.key)}">
  <a href="#producto/${esc(a.id)}" data-close-cart class="shrink-0" aria-label="Ver ficha de ${esc(a.title)}">
    <img src="${esc(safeImg(a.images?.[0]))}" alt="" class="w-20 h-20 rounded-xl object-cover bg-pink-50" width="80" height="80" loading="lazy">
  </a>
  <div class="flex-1 min-w-0">
    <p class="text-[11px] font-bold uppercase tracking-wider text-[#be185d]">${esc(a.brand)}${a.code ? ` · Art. ${esc(a.code)}` : ''}</p>
    <p class="text-sm font-bold text-slate-900 leading-snug">${esc(a.title)}</p>
    <p class="text-xs text-slate-600">${esc(colorsTxt)}</p>
    <p class="text-xs text-slate-600">${esc(sizesTxt)}</p>
    <p class="text-xs text-slate-600">${esc(a.presentation)} · ${esc(formatPrice(price))}</p>
    ${a.inStock ? '' : '<p class="text-xs font-semibold text-amber-800">Sin stock momentáneo: se consulta reposición.</p>'}
    ${a.inStock && lineSoldOut(l) ? '<p class="text-xs font-semibold text-amber-800">Se agotó este talle o color: podés quitarlo o elegir otro en la ficha.</p>' : ''}
    <div class="mt-2 flex items-center justify-between gap-2">
      <div class="inline-flex items-center rounded-full border border-pink-200 bg-white">
        <button type="button" data-qty="-1" class="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-700 hover:text-[#be185d]" aria-label="Quitar un pack de ${esc(a.title)}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">remove</span></button>
        <input type="number" inputmode="numeric" min="1" max="${MAX_QTY}" value="${l.qty}" data-qty-input class="w-12 border-0 p-0 text-center text-base font-bold text-slate-900 focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" aria-label="Cantidad de packs de ${esc(a.title)}">
        <button type="button" data-qty="1" class="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-700 hover:text-[#be185d]" aria-label="Sumar un pack de ${esc(a.title)}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span></button>
      </div>
      <span class="text-sm font-bold text-slate-900">${esc(formatPrice(l.qty * price))}</span>
      <button type="button" data-remove class="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-500 hover:text-red-700 hover:bg-red-50" aria-label="Quitar ${esc(a.title)} del pedido"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span></button>
    </div>
  </div>
</li>`;
}

function render() {
  const { count, total, lines: ls } = totals();
  const empty = ls.length === 0;

  // Contadores del header y píldora flotante
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = count > 99 ? '99+' : String(count);
    el.classList.toggle('hidden', !count);
  });
  document.querySelectorAll('[data-open-cart]').forEach((b) => {
    if (b.id !== 'cartPill') b.setAttribute('aria-label', `Ver mi pedido (${count} ${count === 1 ? 'pack' : 'packs'})`);
  });
  document.querySelectorAll('[data-cart-summary]').forEach((el) => (el.textContent = `· ${count} · ${formatPrice(total)}`));
  const pill = $('#cartPill');
  const hidePill = empty || isOpen() || document.body.dataset.productOpen === 'true';
  pill.classList.toggle('hidden', hidePill);
  pill.classList.toggle('inline-flex', !hidePill);

  // Panel
  $('#cartItems').innerHTML = ls.map(lineItem).join('');
  $('#cartEmpty').classList.toggle('hidden', !empty);
  $('#cartNotice').textContent = sentNotice;
  $('#cartNotice').classList.toggle('hidden', !sentNotice);
  $('#cartForm').classList.toggle('hidden', empty);
  $('#cartFooter').classList.toggle('hidden', empty);
  $('#cartSubtitle').textContent = empty
    ? 'Sumá artículos y enviá el pedido por WhatsApp.'
    : `${ls.length} ${ls.length === 1 ? 'línea' : 'líneas'} · ${count} ${count === 1 ? 'pack' : 'packs'}`;
  $('#cartTotal').textContent = formatPrice(total);
  // Sin compra mínima: se puede enviar con cualquier pedido.
  $('#cartSend').href = empty ? '#' : whatsappLink(buildMessage());

  onChange();
}

export const refresh = () => render();

/* ---------------------------------------------------------------- Apertura del panel */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
let lastFocus = null;
const isOpen = () => !$('#cartDrawer').classList.contains('hidden');

export function open() {
  lastFocus = document.activeElement;
  $('#cartDrawer').classList.remove('hidden');
  $('#cartDrawer').classList.add('flex');
  $('#cartOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.querySelectorAll('[data-open-cart]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
  render();
  $('#cartClose').focus();
}

function close({ restoreFocus = true } = {}) {
  if (!isOpen()) return;
  $('#cartDrawer').classList.add('hidden');
  $('#cartDrawer').classList.remove('flex');
  $('#cartOverlay').classList.add('hidden');
  if (document.body.dataset.productOpen !== 'true') document.body.style.overflow = '';
  document.querySelectorAll('[data-open-cart]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  render();
  if (restoreFocus) lastFocus?.focus?.();
}

/* ---------------------------------------------------------------- Inicialización */

export function initCart({ onUpdate } = {}) {
  load();
  if (onUpdate) onChange = onUpdate;

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-cart]')) open();
    if (e.target.closest('[data-close-cart]')) close({ restoreFocus: false });
  });
  $('#cartClose').addEventListener('click', () => close());
  $('#cartOverlay').addEventListener('click', () => close());
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      close();
    }
    if (e.key === 'Tab') {
      const items = [...$('#cartDrawer').querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
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

  const qtyByKey = (key) => state.items.find((i) => i.key === key)?.qty || 0;
  $('#cartItems').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-key]');
    if (!li) return;
    const key = li.dataset.key;
    const step = e.target.closest('[data-qty]');
    if (step) {
      setQty(key, qtyByKey(key) + Number(step.dataset.qty));
      $(`#cartItems li[data-key="${CSS.escape(key)}"] [data-qty="${step.dataset.qty}"]`)?.focus();
    }
    if (e.target.closest('[data-remove]')) {
      setQty(key, 0);
      ($('#cartItems [data-qty-input]') || $('#cartClose')).focus();
    }
  });
  $('#cartItems').addEventListener('change', (e) => {
    const input = e.target.closest('[data-qty-input]');
    if (input) setQty(input.closest('li').dataset.key, input.value);
  });

  const form = $('#cartForm');
  const fields = { phone: '#cartPhone', name: '#cartName', city: '#cartCity', delivery: '#cartDelivery', notes: '#cartNotes' };
  for (const [k, sel] of Object.entries(fields)) {
    const el = $(sel);
    el.value = state.info[k];
    el.addEventListener('input', () => {
      state.info[k] = el.value;
      save();
      if (k === 'phone') showSendError('');
      if (lines().length) $('#cartSend').href = whatsappLink(buildMessage());
    });
  }
  form.addEventListener('submit', (e) => e.preventDefault());

  // Al terminar de escribir el WhatsApp, se acomoda al formato internacional (+54 9 341 720-3083).
  const phoneInput = $('#cartPhone');
  const tidyPhone = () => {
    const formatted = formatWhatsapp(phoneInput.value);
    if (formatted && formatted !== phoneInput.value) {
      phoneInput.value = formatted;
      state.info.phone = formatted;
      save();
    }
  };
  phoneInput.addEventListener('change', tidyPhone);
  tidyPhone(); // números guardados antes de este cambio

  // Enviar: primero se registra el pedido (el servidor da el código o lo suma a su pedido abierto)
  // y después se abre WhatsApp con el mensaje que ya incluye ese código.
  let sending = false;
  $('#cartSend').addEventListener('click', async (e) => {
    e.preventDefault();
    if (!lines().length || sending) return;
    if (!normalizeWhatsapp(state.info.phone)) {
      showSendError('Escribí tu WhatsApp con código de área, sin 0 ni 15 (ej. 341 555-1234). Lo usamos para reconocer tu pedido y avisarte.');
      $('#cartPhone').focus();
      return;
    }
    for (const [k, label] of [['name', 'tu nombre y/o comercio'], ['city', 'tu localidad']]) {
      if (String(state.info[k] || '').trim().length < 2) {
        showSendError(`Completá ${label} para enviar el pedido.`);
        $(fields[k]).focus();
        return;
      }
    }
    tidyPhone();
    showSendError('');
    // La pestaña se abre ya, dentro del toque, para que el navegador no la bloquee; después se le pone el link.
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    sending = true;
    setSendBusy(true);
    let result = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: state.items.map(({ id, qty, colors, sizes }) => ({ id, qty, colors, sizes })), info: state.info }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) result = await res.json();
    } catch {
      /* sin conexión con el servidor: el mensaje sale igual, sin código */
    }
    const url = whatsappLink(buildMessage(result || {}));
    if (win && !win.closed) win.location.href = url;
    else window.location.href = url;
    if (result) {
      // Enviado: el carrito queda vacío; lo próximo que agregue se suma a este pedido.
      state.items = [];
      save();
      sentNotice = result.merged
        ? `Listo: lo sumamos a tu pedido ${result.code}. Si querés agregar algo más, sumalo y volvé a enviar.`
        : `Listo: tu pedido ${result.code} quedó registrado. Si querés agregar algo más, sumalo y volvé a enviar: se suma al mismo pedido.`;
      render();
    }
    sending = false;
    setSendBusy(false);
  });

  $('#cartClear').addEventListener('click', () => {
    if (window.confirm('¿Vaciar todo el pedido?')) {
      clear();
      $('#cartClose').focus();
    }
  });

  render();
}

/** Opciones de retiro según las sucursales activas. Si la elegida ya no está, vuelve a "A coordinar". */
export function setPickupOptions(labels) {
  const el = $('#cartDelivery');
  [...el.options].filter((o) => o.textContent.startsWith('Retiro en ')).forEach((o) => o.remove());
  const shipping = el.options[el.options.length - 1];
  labels.forEach((label) => el.insertBefore(new Option(label, label), shipping));
  const saved = state.info.delivery;
  if (saved && ![...el.options].some((o) => o.value === saved)) {
    state.info.delivery = '';
    save();
    if (lines().length) $('#cartSend').href = whatsappLink(buildMessage());
  }
  el.value = state.info.delivery;
}

/** Actualiza el catálogo de referencia (precios y datos vigentes) y re-renderiza. */
export function setArticles(list) {
  state.articles = new Map(list.map((a) => [a.id, a]));
  render();
}
