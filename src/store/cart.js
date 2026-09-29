// Carrito de pedido mayorista: se guarda en el navegador y se envía como mensaje de WhatsApp.
// Cada línea es un artículo + la selección de colores y talles elegida en su ficha.
import { whatsappLink, formatPrice, MIN_PURCHASE } from '../config.js';
import { esc, safeImg } from '../shared/utils.js';

const STORE_KEY = 'unica_pedido_v1';
const MAX_QTY = 999;

const $ = (sel) => document.querySelector(sel);

const state = {
  items: [], // [{ key, id, qty, colors: [], sizes: [] }]
  info: { name: '', city: '', delivery: '', notes: '' },
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

export const packPrice = (a) => a.pricePack || a.priceUnit || 0;

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
  `Colores: ${l.colors.length ? l.colors.join(', ') : 'surtidos'}`,
  `Talles: ${l.sizes.length ? l.sizes.join(', ') : 'curva completa'}`,
];

export function buildMessage() {
  const { lines: ls, total, count } = totals();
  const out = ['¡Hola ÚNICA LENCERÍA! Quiero hacer este pedido mayorista:', ''];
  ls.forEach((l, n) => {
    const a = l.article;
    const price = packPrice(a);
    out.push(`${n + 1}. ${a.brand}${a.code ? ` – Art. ${a.code}` : ''} – ${a.title}`);
    out.push(`   ${selectionText(l).join(' · ')}`);
    out.push(`   ${l.qty} x ${a.presentation} a ${formatPrice(price)} = ${formatPrice(l.qty * price)}`);
  });
  out.push('', `Total estimado: ${formatPrice(total)} (${count} ${count === 1 ? 'pack' : 'packs'})`);
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
  $('#cartForm').classList.toggle('hidden', empty);
  $('#cartFooter').classList.toggle('hidden', empty);
  $('#cartSubtitle').textContent = empty
    ? 'Sumá artículos y enviá el pedido por WhatsApp.'
    : `${ls.length} ${ls.length === 1 ? 'línea' : 'líneas'} · ${count} ${count === 1 ? 'pack' : 'packs'}`;
  $('#cartTotal').textContent = formatPrice(total);
  $('#cartProgress').style.width = `${Math.min(100, (total / MIN_PURCHASE) * 100)}%`;
  const missing = MIN_PURCHASE - total;
  const reached = missing <= 0;
  $('#cartMinMsg').innerHTML = reached
    ? `<span class="font-semibold text-emerald-800">✓ Alcanzaste la compra mínima de ${esc(formatPrice(MIN_PURCHASE))}.</span>`
    : `Te faltan <strong class="text-slate-900">${esc(formatPrice(missing))}</strong> para la compra mínima de ${esc(formatPrice(MIN_PURCHASE))}.`;
  const send = $('#cartSend');
  send.href = reached ? whatsappLink(buildMessage()) : '#';
  send.setAttribute('aria-disabled', String(!reached));

  onChange();
}

export const refresh = () => render();

function showCartHint() {
  const msg = $('#cartMinMsg');
  msg.classList.add('text-red-700', 'font-semibold');
  setTimeout(() => msg.classList.remove('text-red-700', 'font-semibold'), 1800);
}

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
  const fields = { name: '#cartName', city: '#cartCity', delivery: '#cartDelivery', notes: '#cartNotes' };
  for (const [k, sel] of Object.entries(fields)) {
    const el = $(sel);
    el.value = state.info[k];
    el.addEventListener('input', () => {
      state.info[k] = el.value;
      save();
      $('#cartSend').href = totals().total >= MIN_PURCHASE ? whatsappLink(buildMessage()) : '#';
    });
  }
  form.addEventListener('submit', (e) => e.preventDefault());

  $('#cartSend').addEventListener('click', (e) => {
    // Bajo el mínimo el enlace no abre WhatsApp; si no, abre el chat con el mensaje ya armado.
    if ($('#cartSend').getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      showCartHint();
    }
  });
  $('#cartClear').addEventListener('click', () => {
    if (window.confirm('¿Vaciar todo el pedido?')) {
      clear();
      $('#cartClose').focus();
    }
  });

  render();
}

/** Actualiza el catálogo de referencia (precios y datos vigentes) y re-renderiza. */
export function setArticles(list) {
  state.articles = new Map(list.map((a) => [a.id, a]));
  render();
}
