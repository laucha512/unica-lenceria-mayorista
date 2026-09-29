// Menú lateral (hamburguesa): categorías → subcategorías → marcas, y "Ver todas las marcas".
// El contenido llega de /api/categories/tree; al elegir algo se avisa con onSelect({ cat, sub, brand }).
import { esc, safeImg } from '../shared/utils.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let onSelect = () => {};
let lastFocus = null;
let tree = { categories: [], brands: [] };

const drawer = () => $('#menuDrawer');
const isOpen = () => !drawer().classList.contains('hidden');

/* ---------------------------------------------------------------- Abrir / cerrar */

export function openMenu() {
  lastFocus = document.activeElement;
  drawer().classList.remove('hidden');
  drawer().classList.add('flex');
  $('#menuOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $('#menuToggle').setAttribute('aria-expanded', 'true');
  $('#menuClose').focus();
}

export function closeMenu({ restoreFocus = true } = {}) {
  if (!isOpen()) return;
  drawer().classList.add('hidden');
  drawer().classList.remove('flex');
  $('#menuOverlay').classList.add('hidden');
  if (document.body.dataset.productOpen !== 'true') document.body.style.overflow = '';
  $('#menuToggle').setAttribute('aria-expanded', 'false');
  if (restoreFocus) lastFocus?.focus?.();
}

/* ---------------------------------------------------------------- Render */

const countBadge = (n) =>
  `<span class="ml-auto shrink-0 min-w-[26px] px-2 py-0.5 rounded-full text-[11px] font-bold text-center ${
    n ? 'bg-pink-100 text-[#be185d]' : 'bg-slate-100 text-slate-600'
  }" aria-label="${n} ${n === 1 ? 'artículo' : 'artículos'}">${n}</span>`;

const brandBadge = (b, size = 'w-7 h-7') =>
  b.logo
    ? `<img src="${esc(safeImg(b.logo))}" alt="" class="${size} rounded-full object-contain bg-white border border-pink-100 shrink-0" loading="lazy">`
    : `<span class="${size} rounded-full bg-pink-100 text-[#be185d] text-[10px] font-bold flex items-center justify-center shrink-0" aria-hidden="true">${esc(
        b.initials || b.name.slice(0, 2).toUpperCase()
      )}</span>`;

function subItem(cat, sub) {
  const panelId = `menu-sub-${esc(sub.id)}`;
  const hasBrands = sub.brands.length > 0;
  return `
<li>
  <div class="flex items-center gap-1">
    <button type="button" data-select data-cat="${esc(cat.slug)}" data-sub="${esc(sub.slug)}" class="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-sm font-semibold text-slate-800 hover:bg-pink-50 hover:text-[#be185d]">
      <span class="truncate">${esc(sub.name)}</span>${countBadge(sub.productCount)}
    </button>
    ${
      hasBrands
        ? `<button type="button" data-toggle="${panelId}" aria-expanded="false" aria-controls="${panelId}" class="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-xl text-slate-600 hover:bg-pink-50 hover:text-[#be185d]" aria-label="Ver marcas de ${esc(sub.name)}">
      <span data-chevron class="material-symbols-outlined text-[20px] transition-transform" aria-hidden="true">expand_more</span>
    </button>`
        : ''
    }
  </div>
  ${
    hasBrands
      ? `<ul id="${panelId}" class="hidden ml-4 pl-3 border-l-2 border-pink-100 py-1 flex flex-col gap-0.5" aria-label="Marcas en ${esc(sub.name)}">
    ${sub.brands
      .map(
        (b) => `<li><button type="button" data-select data-cat="${esc(cat.slug)}" data-sub="${esc(sub.slug)}" data-brand="${esc(b.slug)}" class="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm text-slate-700 hover:bg-pink-50 hover:text-[#be185d]">
        ${brandBadge(b)}<span class="truncate">${esc(b.name)}</span>${countBadge(b.count)}
      </button></li>`
      )
      .join('')}
  </ul>`
      : ''
  }
</li>`;
}

function categoryItem(cat) {
  const panelId = `menu-cat-${esc(cat.id)}`;
  return `
<li class="rounded-2xl border border-pink-100">
  <button type="button" data-toggle="${panelId}" aria-expanded="false" aria-controls="${panelId}" class="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-pink-50">
    <span class="font-headline-sm text-lg font-bold text-slate-900">${esc(cat.name)}</span>
    ${countBadge(cat.productCount)}
    <span data-chevron class="material-symbols-outlined text-[22px] text-slate-600 transition-transform" aria-hidden="true">expand_more</span>
  </button>
  <div id="${panelId}" class="hidden px-2 pb-2">
    <button type="button" data-select data-cat="${esc(cat.slug)}" class="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-sm font-bold text-[#be185d] hover:bg-pink-50">
      <span class="material-symbols-outlined text-[18px]" aria-hidden="true">category</span> Ver todo ${esc(cat.name)}
    </button>
    <ul class="flex flex-col gap-0.5" aria-label="Subcategorías de ${esc(cat.name)}">
      ${cat.subcategories.map((s) => subItem(cat, s)).join('') || '<li class="px-3 py-2 text-sm text-slate-600">Sin subcategorías.</li>'}
    </ul>
  </div>
</li>`;
}

function render() {
  $('#menuCategories').innerHTML = tree.categories.length
    ? tree.categories.map(categoryItem).join('')
    : '<li class="px-2 py-3 text-sm text-slate-600">No hay categorías cargadas.</li>';
  $('#menuBrands').innerHTML = tree.brands
    .map(
      (b) => `<li><button type="button" data-select data-brand="${esc(b.slug)}" class="w-full flex items-center gap-2 p-2 rounded-xl border border-pink-100 hover:border-[#be185d] text-left text-sm font-semibold text-slate-800">${brandBadge(b, 'w-8 h-8')}<span class="min-w-0"><span class="block truncate">${esc(b.name)}</span><span class="block text-[11px] font-normal text-slate-600">${b.count} ${
        b.count === 1 ? 'artículo' : 'artículos'
      }</span></span></button></li>`
    )
    .join('');
}

function toggle(btn) {
  const panel = document.getElementById(btn.getAttribute('aria-controls'));
  if (!panel) return;
  const open = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', String(open));
  panel.classList.toggle('hidden', !open);
  if (panel.id === 'menuBrands') panel.classList.toggle('grid', open);
  const icon = btn.querySelector("[data-chevron]");
  if (icon) icon.style.transform = open ? 'rotate(180deg)' : '';
}

/* ---------------------------------------------------------------- Inicialización */

export function initMenu({ onSelect: cb } = {}) {
  if (cb) onSelect = cb;
  $('#menuToggle').addEventListener('click', () => (isOpen() ? closeMenu() : openMenu()));
  $('#menuClose').addEventListener('click', () => closeMenu());
  $('#menuOverlay').addEventListener('click', () => closeMenu());
  $('#menuBrandsToggle').addEventListener('click', (e) => toggle(e.currentTarget));

  drawer().addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (t) return toggle(t);
    const sel = e.target.closest('[data-select]');
    if (sel) {
      closeMenu({ restoreFocus: false });
      onSelect({ cat: sel.dataset.cat || null, sub: sel.dataset.sub || null, brand: sel.dataset.brand || null });
      return;
    }
    if (e.target.closest('[data-menu-link]')) closeMenu({ restoreFocus: false });
  });

  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      closeMenu();
    }
    if (e.key === 'Tab') {
      const items = $$('a[href],button:not([disabled])', drawer()).filter((n) => n.offsetParent !== null);
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
}

export function setTree(data) {
  tree = data || { categories: [], brands: [] };
  render();
}
