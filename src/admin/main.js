import { api, ApiError, esc, safeImg, initials as autoInitials } from '../shared/utils.js';
import { formatPrice } from '../config.js';
import { validateFile, resizeImage, uploadBlob } from './images.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const TOKEN_KEY = 'unica_admin_token';
const EXP_KEY = 'unica_admin_exp';
const MAX_PHOTOS = 5;

const state = {
  token: null,
  articles: [],
  brands: [],
  banners: [],
  tab: 'publicaciones',
};

/* ================================================================ Utilidades UI */

let toastTimer;
function showToast(msg, type = 'ok') {
  const t = $('#toastNotification');
  $('#toastMessage').textContent = msg;
  const icon = $('#toastIcon');
  icon.textContent = type === 'error' ? 'error' : 'check_circle';
  icon.classList.toggle('text-secondary-fixed', type !== 'error');
  icon.classList.toggle('text-primary-fixed-dim', type === 'error');
  t.classList.remove('translate-y-24', 'opacity-0');
  t.classList.add('translate-y-0', 'opacity-100');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.add('translate-y-24', 'opacity-0');
    t.classList.remove('translate-y-0', 'opacity-100');
  }, type === 'error' ? 6000 : 3500);
}

function showFormError(el, msg) {
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  btn.disabled = busy;
  const icon = btn.querySelector('.material-symbols-outlined');
  const text = btn.querySelector('span:last-child');
  if (busy) {
    btn.dataset.icon = icon?.textContent || '';
    btn.dataset.label = text?.textContent || '';
    if (icon) {
      icon.textContent = 'progress_activity';
      icon.classList.add('spin');
    }
    if (text && label) text.textContent = label;
  } else {
    if (icon && btn.dataset.icon) {
      icon.textContent = btn.dataset.icon;
      icon.classList.remove('spin');
    }
    if (text && btn.dataset.label) text.textContent = btn.dataset.label;
  }
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '';
  const min = Math.round(diff / 60000);
  if (min < 1) return 'Actualizado recién';
  if (min < 60) return `Actualizado hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Actualizado hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `Actualizado hace ${d} día${d > 1 ? 's' : ''}`;
  const w = Math.round(d / 7);
  if (d < 31) return `Actualizado hace ${w} semana${w > 1 ? 's' : ''}`;
  return `Actualizado el ${new Date(iso).toLocaleDateString('es-AR')}`;
}

/* ---------------------------------------------------------------- Modales */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const modalStack = [];

function openModal(el, focusEl) {
  modalStack.push({ el, returnFocus: document.activeElement });
  el.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  (focusEl || $$(FOCUSABLE, el).find((n) => n.offsetParent !== null))?.focus();
}

function closeModal(el) {
  const i = modalStack.findIndex((m) => m.el === el);
  if (i === -1) return;
  const [{ returnFocus }] = modalStack.splice(i, 1);
  el.classList.add('hidden');
  if (!modalStack.length) document.body.style.overflow = '';
  returnFocus?.focus?.();
}

document.addEventListener('keydown', (e) => {
  const top = modalStack[modalStack.length - 1];
  if (!top) {
    if (e.key === 'Escape' && !$('#drawerOverlay').classList.contains('hidden')) setDrawer(false);
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (top.el.id === 'confirmModal') $('#confirmCancel').click();
    else closeModal(top.el);
  } else if (e.key === 'Tab') {
    // Trampa de foco dentro del modal.
    const items = $$(FOCUSABLE, top.el).filter((n) => n.offsetParent !== null);
    if (!items.length) return;
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

$$('[data-close-modal]').forEach((b) => b.addEventListener('click', () => closeModal(b.closest('[role="dialog"]'))));
['#articleModal', '#bannerModal'].forEach((id) =>
  $(id).addEventListener('mousedown', (e) => {
    if (e.target === e.currentTarget) closeModal(e.currentTarget);
  })
);

/**
 * Diálogo de confirmación. Si se pasa `requireText`, el botón solo se habilita
 * cuando el usuario escribe exactamente ese texto.
 */
function confirmDialog({ title, message, okLabel = 'Eliminar', requireText = null }) {
  const modal = $('#confirmModal');
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  $('#confirmOkLabel').textContent = okLabel;
  const wrap = $('#confirmTypeWrap');
  const input = $('#confirmInput');
  const ok = $('#confirmOk');
  wrap.classList.toggle('hidden', !requireText);
  input.value = '';
  if (requireText) $('#confirmInputLabel').textContent = `Escribí "${requireText}" para confirmar`;
  ok.disabled = !!requireText;
  input.oninput = () => (ok.disabled = input.value.trim() !== requireText);

  return new Promise((resolve) => {
    const finish = (val) => {
      $('#confirmForm').onsubmit = null;
      $('#confirmCancel').onclick = null;
      closeModal(modal);
      resolve(val);
    };
    $('#confirmForm').onsubmit = (e) => {
      e.preventDefault();
      if (!ok.disabled) finish(true);
    };
    $('#confirmCancel').onclick = () => finish(false);
    openModal(modal, requireText ? input : $('#confirmCancel'));
  });
}

/* ================================================================ Sesión */

function saveSession(token, expiresAt) {
  state.token = token;
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(EXP_KEY, String(expiresAt));
  } catch {
    /* modo privado: la sesión dura lo que la pestaña */
  }
}

function clearSession() {
  state.token = null;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXP_KEY);
  } catch {
    /* ignore */
  }
}

function showLogin(message) {
  $('#appView').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
  showFormError($('#loginError'), message || '');
  $('#loginPassword').value = '';
  $('#loginPassword').focus();
}

function logout(message) {
  clearSession();
  modalStack.slice().forEach((m) => closeModal(m.el));
  state.articles = state.brands = state.banners = [];
  showLogin(message);
}

/** Llamada autenticada: ante 401 vuelve al login. */
async function call(path, opts = {}) {
  try {
    return await api(path, { ...opts, token: state.token });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      logout('Tu sesión venció. Ingresá nuevamente.');
    }
    throw err;
  }
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('#loginPassword').value;
  const errEl = $('#loginError');
  if (!pw) return showFormError(errEl, 'Ingresá la contraseña.');
  const btn = $('#loginSubmit');
  setBusy(btn, true, 'Ingresando…');
  showFormError(errEl, '');
  try {
    const { token, expiresAt } = await api('auth', { method: 'POST', body: { password: pw } });
    saveSession(token, expiresAt);
    await startApp();
  } catch (err) {
    showFormError(errEl, err.message);
    $('#loginPassword').select();
  } finally {
    setBusy(btn, false);
  }
});

$('#togglePassword').addEventListener('click', (e) => {
  const input = $('#loginPassword');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  e.currentTarget.setAttribute('aria-pressed', String(show));
  e.currentTarget.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  e.currentTarget.querySelector('span').textContent = show ? 'visibility_off' : 'visibility';
});

$('#logoutBtn').addEventListener('click', () => logout('Cerraste sesión.'));

async function startApp() {
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  const exp = Number(sessionStorage.getItem(EXP_KEY));
  if (exp) $('#sessionInfo').textContent = `Sesión hasta las ${new Date(exp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })} hs`;
  switchTab(location.hash.slice(1) || 'publicaciones', false);
  await loadAll();
}

async function loadAll() {
  try {
    const [articles, brands, banners] = await Promise.all([call('articles'), call('brands'), call('banners')]);
    Object.assign(state, { articles, brands, banners });
    renderAll();
  } catch (err) {
    if (err.status !== 401) showToast(`No se pudieron cargar los datos: ${err.message}`, 'error');
  }
}

function renderAll() {
  renderKpis();
  renderBrandOptions();
  renderArticles();
  renderBanners();
  renderBrands();
}

/* ================================================================ Navegación */

const TABS = ['publicaciones', 'portadas', 'marcas', 'pedidos'];

function switchTab(tab, focus = true) {
  if (!TABS.includes(tab)) tab = 'publicaciones';
  state.tab = tab;
  $$('.tab-section').forEach((s) => s.classList.toggle('hidden', s.id !== `section-${tab}`));
  $$('.nav-btn').forEach((btn) => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle('bg-primary-container', on);
    btn.classList.toggle('text-on-primary', on);
    btn.classList.toggle('font-semibold', on);
    btn.classList.toggle('shadow-sm', on);
    btn.classList.toggle('text-on-surface-variant', !on);
    btn.classList.toggle('hover:bg-surface-container-high', !on);
    btn.classList.toggle('hover:text-on-surface', !on);
    if (on) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  if (location.hash.slice(1) !== tab) history.replaceState(null, '', `#${tab}`);
  if (focus) $(`#section-${tab} h1`)?.setAttribute('tabindex', '-1');
  if (focus) $(`#section-${tab} h1`)?.focus({ preventScroll: true });
}

$('#sidebarNav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;
  switchTab(btn.dataset.tab);
  setDrawer(false);
  window.scrollTo({ top: 0 });
});

// Drawer móvil
function setDrawer(open) {
  $('#sidebar').classList.toggle('-translate-x-full', !open);
  $('#drawerOverlay').classList.toggle('hidden', !open);
  $('#drawerOpen').setAttribute('aria-expanded', String(open));
  if (open) $('#drawerClose').focus();
}
$('#drawerOpen').addEventListener('click', () => setDrawer(true));
$('#drawerClose').addEventListener('click', () => {
  setDrawer(false);
  $('#drawerOpen').focus();
});
$('#drawerOverlay').addEventListener('click', () => setDrawer(false));
matchMedia('(min-width: 1024px)').addEventListener('change', (e) => e.matches && setDrawer(false));

/* ================================================================ KPIs */

function renderKpis() {
  const { articles, brands, banners } = state;
  const active = articles.filter((a) => a.inStock).length;
  $('#kpiActive').textContent = active;
  $('#kpiActiveOf').textContent = `de ${articles.length} en catálogo mayorista`;
  const pct = articles.length ? Math.round((active / articles.length) * 1000) / 10 : 0;
  $('#kpiStockPct').textContent = `${pct.toLocaleString('es-AR')}% con stock disponible`;
  $('#kpiNew').textContent = articles.filter((a) => a.isNew).length;
  $('#kpiBrands').textContent = brands.length;
  const names = brands.slice(0, 5).map((b) => b.name).join(', ');
  $('#kpiBrandNames').textContent = brands.length > 5 ? `${names}…` : names || 'Sin marcas cargadas';
  const activeBanners = banners.filter((b) => b.active).length;
  $('#kpiBanners').textContent = activeBanners;
  $('#kpiBannersOf').textContent = `de ${banners.length} cargadas`;
}

/* ================================================================ Artículos */

function renderBrandOptions() {
  const names = state.brands.map((b) => b.name);
  state.articles.forEach((a) => !names.includes(a.brand) && names.push(a.brand));
  const filter = $('#articleBrandFilter');
  const current = filter.value;
  filter.innerHTML =
    '<option value="all">Todas las Marcas</option>' + names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  filter.value = names.includes(current) ? current : 'all';
}

function filteredArticles() {
  const q = $('#articleSearchInput').value.toLowerCase().trim();
  const brand = $('#articleBrandFilter').value;
  return state.articles.filter((a) => {
    const hay = `${a.title} ${a.brand} ${a.code} ${a.description}`.toLowerCase();
    return (!q || hay.includes(q)) && (brand === 'all' || a.brand === brand);
  });
}

function articleCard(a) {
  const tagCls = 'px-1.5 py-0.5 rounded bg-surface-container text-on-surface text-[10px] font-bold';
  const colorCls = 'px-2 py-0.5 rounded-full bg-surface-container-low border border-outline-variant/30 text-on-surface text-[10px]';
  return `
<article class="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between" data-id="${esc(a.id)}">
  <div>
    <div class="relative h-48 bg-surface-container-high overflow-hidden">
      <img src="${esc(safeImg(a.images?.[0]))}" alt="${esc(a.title)}" class="w-full h-full object-cover ${a.inStock ? '' : 'grayscale opacity-60'}" loading="lazy" decoding="async">
      <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
        <span class="px-2 py-0.5 rounded-full bg-surface-container-lowest/90 backdrop-blur-sm text-primary text-[11px] font-bold shadow-sm">${esc(a.brand)}</span>
        ${a.isNew ? '<span class="px-2 py-0.5 rounded-full bg-primary text-on-primary text-[11px] font-bold shadow-sm">NOVEDAD</span>' : ''}
        ${a.inStock ? '' : '<span class="px-2 py-0.5 rounded-full bg-inverse-surface text-inverse-on-surface text-[11px] font-bold shadow-sm">SIN STOCK</span>'}
      </div>
      <span class="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-full bg-surface/90 text-on-surface text-[11px] font-semibold">${esc(a.presentation)}</span>
      ${a.images?.length > 1 ? `<span class="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-full bg-surface/90 text-on-surface text-[11px] font-semibold">${a.images.length} fotos</span>` : ''}
    </div>
    <div class="p-4">
      <h3 class="font-headline-sm text-base font-bold text-on-surface line-clamp-1" title="${esc(a.title)}">${esc(a.title)}${a.code ? ` <span class="font-body-md text-xs text-on-surface-variant font-semibold">Art. ${esc(a.code)}</span>` : ''}</h3>
      <p class="text-xs text-on-surface-variant mt-1 line-clamp-2">${esc(a.description || a.saleType || '')}</p>
      <div class="mt-3 flex items-center gap-1.5 flex-wrap">
        <span class="text-[11px] text-on-surface-variant font-medium">Talles:</span>
        ${a.sizes.map((s) => `<span class="${tagCls}">${esc(s)}</span>`).join('') || '<span class="text-[11px] text-on-surface-variant">—</span>'}
      </div>
      <div class="mt-2 flex items-center gap-1 flex-wrap">
        <span class="text-[11px] text-on-surface-variant font-medium">Colores:</span>
        ${a.colors.map((c) => `<span class="${colorCls}">${esc(c)}</span>`).join('') || '<span class="text-[11px] text-on-surface-variant">—</span>'}
      </div>
      <div class="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between">
        <div>
          <span class="text-[10px] text-on-surface-variant block uppercase font-bold tracking-wider">Unidad</span>
          <span class="text-sm font-bold text-primary">${esc(formatPrice(a.priceUnit))}</span>
        </div>
        <div class="text-right">
          <span class="text-[10px] text-on-surface-variant block uppercase font-bold tracking-wider">${esc(a.presentation)}</span>
          <span class="text-sm font-bold text-on-surface">${esc(formatPrice(a.pricePack))}</span>
        </div>
      </div>
    </div>
  </div>
  <div class="p-3 bg-surface-container-low/60 border-t border-outline-variant/20 flex items-center justify-between">
    <button type="button" data-action="toggle-new" aria-pressed="${a.isNew}" class="flex items-center gap-1 text-[11px] font-bold ${a.isNew ? 'text-primary' : 'text-on-surface-variant hover:text-primary'}">
      <span class="material-symbols-outlined text-[16px] ${a.isNew ? 'icon-fill' : ''}" aria-hidden="true">star</span>
      <span>${a.isNew ? 'Destacado' : 'Destacar'}</span>
    </button>
    <div class="flex items-center gap-1">
      <button type="button" data-action="edit" class="p-2 sm:p-1 text-on-surface-variant hover:text-primary rounded" title="Editar" aria-label="Editar ${esc(a.title)}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span></button>
      <button type="button" data-action="toggle-stock" class="p-2 sm:p-1 text-on-surface-variant hover:text-primary rounded" title="${a.inStock ? 'Pausar stock' : 'Reactivar stock'}" aria-label="${a.inStock ? 'Pausar stock de' : 'Reactivar stock de'} ${esc(a.title)}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">${a.inStock ? 'pause_circle' : 'play_circle'}</span></button>
      <button type="button" data-action="delete" class="p-2 sm:p-1 text-on-surface-variant hover:text-error rounded" title="Eliminar" aria-label="Eliminar ${esc(a.title)}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span></button>
    </div>
  </div>
</article>`;
}

function renderArticles() {
  const list = filteredArticles();
  $('#articlesContainer').innerHTML = list.length
    ? list.map(articleCard).join('')
    : `<div class="col-span-full p-10 rounded-2xl border border-dashed border-outline-variant text-center text-sm text-on-surface-variant">${
        state.articles.length ? 'Ningún artículo coincide con la búsqueda.' : 'Todavía no hay artículos. Creá el primero con “Nueva Publicación Mayorista”.'
      }</div>`;
  $('#articlesCountBadge').textContent = `Mostrando ${list.length} de ${state.articles.length} artículos`;
}

$('#articleSearchInput').addEventListener('input', renderArticles);
$('#articleBrandFilter').addEventListener('change', renderArticles);

function replaceArticle(updated) {
  const i = state.articles.findIndex((a) => a.id === updated.id);
  if (i === -1) state.articles.unshift(updated);
  else state.articles[i] = updated;
}

$('#articlesContainer').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.closest('article').dataset.id;
  const art = state.articles.find((a) => a.id === id);
  if (!art) return;
  const action = btn.dataset.action;

  if (action === 'edit') return openArticleModal(art);

  if (action === 'delete') {
    const ok = await confirmDialog({
      title: 'Eliminar artículo',
      message: `Se eliminará "${art.title}" y sus fotos subidas. Esta acción no se puede deshacer.`,
    });
    if (!ok) return;
    try {
      await call(`articles?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.articles = state.articles.filter((a) => a.id !== id);
      renderAll();
      showToast(`Artículo "${art.title}" eliminado.`);
    } catch (err) {
      if (err.status !== 401) showToast(err.message, 'error');
    }
    return;
  }

  const field = action === 'toggle-new' ? 'isNew' : 'inStock';
  btn.disabled = true;
  try {
    const updated = await call(`articles?id=${encodeURIComponent(id)}`, { method: 'PUT', body: { [field]: !art[field] } });
    replaceArticle(updated);
    renderKpis();
    renderArticles();
    $(`#articlesContainer article[data-id="${CSS.escape(id)}"] button[data-action="${action}"]`)?.focus();
    if (field === 'isNew') showToast(updated.isNew ? `"${updated.title}" marcado como NOVEDAD.` : `"${updated.title}" quitado de novedades.`);
    else showToast(`Stock de "${updated.title}" ${updated.inStock ? 'activado' : 'pausado temporalmente'}.`);
  } catch (err) {
    btn.disabled = false;
    if (err.status !== 401) showToast(err.message, 'error');
  }
});

/* ---------------------------------------------------------------- Modal de artículo */

const PRESET_SIZES = ['85', '90', '95', '100', '105', '110', 'Especiales'];
const COLOR_SWATCHES = {
  Blanco: '#ffffff', Negro: '#000000', Nude: '#E8C5A8', 'Rosa Pastel': '#F7C6D0', Borravino: '#5E1224', 'Azul Marino': '#1B264F',
  Piel: '#E0B89A', 'Visón': '#8A7866', Gris: '#9CA3AF', 'Gris Melange': '#A3A3A3', Champagne: '#F1DDB5', 'Rosa Viejo': '#C08081',
  Bordo: '#6D071A', Bordeaux: '#6D071A', Marfil: '#F4EFE1', Rosa: '#F9A8D4', Celeste: '#A5D8F3', Hueso: '#EFE6D8', 'Rojo Rubí': '#9B111E',
  'Petróleo': '#1D4E5F', Grafito: '#41424C', Melange: '#B8B8B8',
};
const PRESET_COLORS = ['Blanco', 'Negro', 'Nude', 'Rosa Pastel', 'Borravino', 'Azul Marino'];

/** Valores activos respetando el orden que ya tenía el artículo; los nuevos van al final. */
const keepOrder = (chips, original) => {
  const on = chips.filter((c) => c.on).map((c) => c.value);
  const rank = (v) => (original.includes(v) ? original.indexOf(v) : original.length + on.indexOf(v));
  return on.sort((a, b) => rank(a) - rank(b));
};

const form = {
  editingId: null,
  original: { sizes: [], colors: [] },
  sizes: [], // { value, on }
  colors: [], // { value, on }
  photos: [], // { url?, blob?, preview }
};

function renderSizeChips() {
  $('#sizesChipsContainer').innerHTML = form.sizes
    .map(
      (s, i) => `<button type="button" data-i="${i}" aria-pressed="${s.on}" class="px-3 py-1 rounded-full text-xs font-bold transition-all ${
        s.on ? 'bg-primary-container text-on-primary ring-1 ring-primary' : 'bg-surface-container-high text-on-surface-variant'
      }">${esc(s.value)}</button>`
    )
    .join('');
}

function renderColorChips() {
  $('#colorSwatchesContainer').innerHTML = form.colors
    .map((c, i) => {
      const hex = COLOR_SWATCHES[c.value];
      const dot = hex
        ? `<span class="w-3.5 h-3.5 rounded-full border border-gray-300" style="background:${hex}" aria-hidden="true"></span>`
        : '<span class="w-3.5 h-3.5 rounded-full border border-dashed border-gray-400 bg-gradient-to-br from-white to-gray-200" aria-hidden="true"></span>';
      return `<button type="button" data-i="${i}" aria-pressed="${c.on}" class="flex items-center gap-1.5 px-2.5 py-1 rounded-full border cursor-pointer text-xs font-medium transition-all ${
        c.on ? 'bg-primary-fixed border-primary text-primary ring-1 ring-primary' : 'bg-surface-container-low border-outline-variant/40 text-on-surface'
      }">${dot} ${esc(c.value)}</button>`;
    })
    .join('');
}

function renderPhotos() {
  const row = $('#photosPreviewRow');
  row.innerHTML =
    form.photos
      .map(
        (p, i) => `
<div class="relative w-16 h-16 rounded-lg bg-surface-container-high overflow-hidden border border-outline-variant/40 group">
  <img alt="Foto ${i + 1}" class="w-full h-full object-cover" src="${esc(safeImg(p.preview))}">
  ${i === 0 ? '<span class="absolute bottom-0 left-0 right-0 bg-primary text-on-primary text-[9px] text-center font-bold">Principal</span>' : `<button type="button" data-main="${i}" class="absolute bottom-0 left-0 right-0 bg-surface/90 text-primary text-[9px] font-bold hover:bg-primary hover:text-on-primary" aria-label="Usar foto ${i + 1} como principal">Principal</button>`}
  <button type="button" data-remove="${i}" class="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-inverse-surface/80 text-inverse-on-surface flex items-center justify-center hover:bg-error" aria-label="Quitar foto ${i + 1}"><span class="material-symbols-outlined text-[14px]" aria-hidden="true">close</span></button>
</div>`
      )
      .join('') +
    (form.photos.length < MAX_PHOTOS
      ? `<span class="w-16 h-16 rounded-lg bg-surface-container-low border border-dashed border-outline-variant flex items-center justify-center text-on-surface-variant text-[11px] text-center">${form.photos.length}/${MAX_PHOTOS}</span>`
      : '');
}

$('#sizesChipsContainer').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  const s = form.sizes[b.dataset.i];
  s.on = !s.on;
  renderSizeChips();
  $(`#sizesChipsContainer button[data-i="${b.dataset.i}"]`).focus();
});
$('#colorSwatchesContainer').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  const c = form.colors[b.dataset.i];
  c.on = !c.on;
  renderColorChips();
  $(`#colorSwatchesContainer button[data-i="${b.dataset.i}"]`).focus();
});

function addCustom(listName, inputSel, render) {
  const input = $(inputSel);
  const v = input.value.replace(/\s+/g, ' ').trim();
  if (!v) return;
  const list = form[listName];
  const existing = list.find((x) => x.value.toLowerCase() === v.toLowerCase());
  if (existing) existing.on = true;
  else if (list.length >= 20) return showToast('Máximo 20 valores.', 'error');
  else list.push({ value: v, on: true });
  input.value = '';
  render();
}
$('#addSizeBtn').addEventListener('click', () => addCustom('sizes', '#customSize', renderSizeChips));
$('#addColorBtn').addEventListener('click', () => addCustom('colors', '#customColor', renderColorChips));
$('#customSize').addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), $('#addSizeBtn').click()));
$('#customColor').addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), $('#addColorBtn').click()));

async function addPhotoFiles(files) {
  const errEl = $('#articleFormError');
  showFormError(errEl, '');
  const room = MAX_PHOTOS - form.photos.length;
  if (room <= 0) return showFormError(errEl, `Máximo ${MAX_PHOTOS} fotos por artículo.`);
  const list = [...files];
  if (list.length > room) showToast(`Solo se agregaron ${room} foto(s): el máximo es ${MAX_PHOTOS}.`, 'error');
  for (const file of list.slice(0, room)) {
    try {
      validateFile(file);
      const blob = await resizeImage(file, { maxSize: 1200 });
      form.photos.push({ blob, preview: URL.createObjectURL(blob) });
      renderPhotos();
    } catch (err) {
      showFormError(errEl, err.message);
    }
  }
}

$('#photoInput').addEventListener('change', async (e) => {
  await addPhotoFiles(e.target.files);
  e.target.value = '';
});

$('#photosPreviewRow').addEventListener('click', (e) => {
  const rm = e.target.closest('[data-remove]');
  const main = e.target.closest('[data-main]');
  if (rm) {
    const [p] = form.photos.splice(Number(rm.dataset.remove), 1);
    if (p.blob) URL.revokeObjectURL(p.preview);
    renderPhotos();
  } else if (main) {
    const [p] = form.photos.splice(Number(main.dataset.main), 1);
    form.photos.unshift(p);
    renderPhotos();
  }
});

// Arrastrar y soltar en los dropzones
function wireDrop(zoneSel, onFiles) {
  const zone = $(zoneSel);
  ['dragenter', 'dragover'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add('is-dragover');
    })
  );
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('is-dragover')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
  });
}
wireDrop('#photoDrop', addPhotoFiles);

function fillBrandSelect(selected) {
  const names = state.brands.map((b) => b.name);
  if (selected && !names.includes(selected)) names.push(selected);
  $('#artBrand').innerHTML =
    names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('') + '<option value="__new__">+ Agregar nueva marca…</option>';
  $('#artBrand').value = selected || names[0] || '__new__';
  toggleNewBrandInput();
}

function toggleNewBrandInput() {
  const isNew = $('#artBrand').value === '__new__';
  $('#artNewBrand').classList.toggle('hidden', !isNew);
  if (isNew) $('#artNewBrand').focus();
}
$('#artBrand').addEventListener('change', toggleNewBrandInput);

function openArticleModal(article = null) {
  form.editingId = article?.id || null;
  $('#articleModalTitle').textContent = article ? 'Editar Publicación Mayorista' : 'Nueva Publicación de Producto Mayorista';
  $('#articleSubmit span:last-child').textContent = article ? 'Guardar Cambios' : 'Guardar & Publicar';
  showFormError($('#articleFormError'), '');
  $('#articleForm').reset();
  $('#artNewBrand').value = '';
  fillBrandSelect(article?.brand);
  $('#artTitle').value = article?.title || '';
  $('#artCode').value = article?.code || '';
  $('#artTag').value = article?.tag || '';
  $('#artSaleType').value = article?.saleType || '';
  $('#artDescription').value = article?.description || '';
  $('#artPresentation').value = article?.presentation || 'Pack x 6 Unid.';
  $('#artPriceUnit').value = article ? article.priceUnit : '';
  $('#artPricePack').value = article ? article.pricePack : '';
  $('#artIsNew').checked = article ? article.isNew : true;
  $('#artInStock').checked = article ? article.inStock : true;

  form.original = { sizes: article?.sizes || [], colors: article?.colors || [] };
  const sizes = article?.sizes || ['85', '90', '95', '100'];
  form.sizes = [...new Set([...PRESET_SIZES, ...sizes])].map((v) => ({ value: v, on: sizes.includes(v) }));
  const colors = article?.colors || [];
  form.colors = [...new Set([...PRESET_COLORS, ...colors])].map((v) => ({ value: v, on: colors.includes(v) }));
  form.photos.forEach((p) => p.blob && URL.revokeObjectURL(p.preview));
  form.photos = (article?.images || []).map((url) => ({ url, preview: url }));

  renderSizeChips();
  renderColorChips();
  renderPhotos();
  openModal($('#articleModal'), $('#artTitle'));
}

$('#newArticleBtn').addEventListener('click', () => openArticleModal());

async function ensureBrand(name) {
  if (state.brands.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
    return state.brands.find((b) => b.name.toLowerCase() === name.toLowerCase()).name;
  }
  const brand = await call('brands', { method: 'POST', body: { name, category: 'Distribución Directa', initials: autoInitials(name) } });
  state.brands.push(brand);
  return brand.name;
}

$('#articleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#articleFormError');
  showFormError(errEl, '');

  const brandSel = $('#artBrand').value;
  const newBrand = $('#artNewBrand').value.trim();
  const title = $('#artTitle').value.trim();
  const priceUnit = Number($('#artPriceUnit').value);
  const pricePack = Number($('#artPricePack').value);
  const presentation = $('#artPresentation').value.trim();

  const problems = [];
  if (brandSel === '__new__' && newBrand.length < 2) problems.push('el nombre de la nueva marca');
  if (title.length < 3) problems.push('el título (mínimo 3 caracteres)');
  if (!presentation) problems.push('la presentación mayorista');
  if ($('#artPriceUnit').value === '' || !(priceUnit >= 0)) problems.push('el precio por unidad');
  if ($('#artPricePack').value === '' || !(pricePack >= 0)) problems.push('el precio por pack');
  if (!form.photos.length) problems.push('al menos una foto');
  if (problems.length) return showFormError(errEl, `Completá: ${problems.join(', ')}.`);

  const btn = $('#articleSubmit');
  setBusy(btn, true, 'Guardando…');
  try {
    const brand = brandSel === '__new__' ? await ensureBrand(newBrand) : brandSel;

    // Sube las fotos nuevas (las existentes ya tienen URL).
    const pending = form.photos.filter((p) => p.blob && !p.url);
    let n = 0;
    for (const p of pending) {
      $('#articleSubmit span:last-child').textContent = `Subiendo foto ${++n}/${pending.length}…`;
      p.url = await uploadBlob(p.blob, state.token);
    }

    const body = {
      brand,
      title,
      code: $('#artCode').value.trim(),
      tag: $('#artTag').value.trim(),
      saleType: $('#artSaleType').value.trim(),
      description: $('#artDescription').value.trim(),
      presentation,
      sizes: keepOrder(form.sizes, form.original.sizes),
      colors: keepOrder(form.colors, form.original.colors),
      priceUnit,
      pricePack,
      isNew: $('#artIsNew').checked,
      inStock: $('#artInStock').checked,
      images: form.photos.map((p) => p.url),
    };
    const saved = form.editingId
      ? await call(`articles?id=${encodeURIComponent(form.editingId)}`, { method: 'PUT', body })
      : await call('articles', { method: 'POST', body });
    replaceArticle(saved);
    renderAll();
    closeModal($('#articleModal'));
    showToast(form.editingId ? `Cambios en "${saved.title}" guardados.` : `¡Artículo "${saved.title}" publicado en el catálogo mayorista!`);
  } catch (err) {
    if (err.status === 401) return;
    showFormError(errEl, err.message);
  } finally {
    setBusy(btn, false);
  }
});

/* ================================================================ Portadas */

const BANNER_TYPE = {
  hero: { cls: 'bg-primary text-on-primary', name: 'Portada Inicio' },
  promo: { cls: 'bg-secondary-container text-on-secondary-container', name: 'Banner Promocional' },
  category: { cls: 'bg-surface-container text-on-surface', name: 'Portada Categoría' },
};

function bannerCard(b) {
  const t = BANNER_TYPE[b.type] || BANNER_TYPE.promo;
  return `
<article class="rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm overflow-hidden flex flex-col group" data-id="${esc(b.id)}">
  <div class="relative h-48 bg-surface-container-high overflow-hidden">
    <img alt="${esc(b.alt || b.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${b.active ? '' : 'grayscale opacity-60'}" src="${esc(safeImg(b.image))}" loading="lazy" decoding="async">
    <span class="absolute top-3 left-3 px-2.5 py-1 rounded-full ${t.cls} text-[11px] font-bold uppercase tracking-wider shadow">${esc(b.label)}</span>
    <span class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-surface/90 ${b.active ? 'text-primary' : 'text-on-surface-variant'} text-[11px] font-bold">${b.active ? 'Activo' : 'Inactivo'}</span>
  </div>
  <div class="p-5 flex-1 flex flex-col justify-between">
    <div>
      <h3 class="font-headline-sm text-lg text-on-surface font-bold">${esc(b.title)}</h3>
      <p class="text-xs text-on-surface-variant mt-1">${esc(b.description)}</p>
      <div class="mt-3 flex items-center gap-2 text-xs text-on-surface-variant">
        <span class="material-symbols-outlined text-[16px]" aria-hidden="true">aspect_ratio</span> ${esc(b.format || t.name)}
      </div>
    </div>
    <div class="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between">
      <span class="text-[11px] text-on-surface-variant">${esc(timeAgo(b.updatedAt))}</span>
      <div class="flex items-center gap-1">
        <button type="button" data-action="edit" class="p-1.5 text-on-surface-variant hover:text-primary rounded-lg hover:bg-surface-container" title="Editar / reemplazar imagen" aria-label="Editar ${esc(b.title)}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span></button>
        <button type="button" data-action="toggle" aria-pressed="${b.active}" class="p-1.5 text-on-surface-variant hover:text-primary rounded-lg hover:bg-surface-container" title="${b.active ? 'Desactivar' : 'Activar'}" aria-label="${b.active ? 'Desactivar' : 'Activar'} ${esc(b.title)}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">${b.active ? 'visibility' : 'visibility_off'}</span></button>
        <button type="button" data-action="delete" class="p-1.5 text-on-surface-variant hover:text-error rounded-lg hover:bg-surface-container" title="Eliminar" aria-label="Eliminar ${esc(b.title)}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span></button>
      </div>
    </div>
  </div>
</article>`;
}

function renderBanners() {
  $('#bannersContainer').innerHTML = state.banners.length
    ? state.banners.map(bannerCard).join('')
    : '<div class="col-span-full p-10 rounded-2xl border border-dashed border-outline-variant text-center text-sm text-on-surface-variant">No hay portadas cargadas.</div>';
}

const bannerForm = { editingId: null, blob: null, preview: null, image: null };

function setBannerPreview(src) {
  const img = $('#bannerPreview');
  img.classList.toggle('hidden', !src);
  if (src) img.src = safeImg(src);
  $('#bannerDropText').textContent = src ? 'Haga clic para reemplazar la imagen' : 'Haga clic para subir la imagen';
}

function openBannerModal(banner = null) {
  bannerForm.editingId = banner?.id || null;
  if (bannerForm.preview) URL.revokeObjectURL(bannerForm.preview);
  bannerForm.blob = bannerForm.preview = null;
  bannerForm.image = banner?.image || null;
  $('#bannerModalTitle').textContent = banner ? 'Editar Portada' : 'Nueva Portada';
  showFormError($('#bannerFormError'), '');
  $('#bannerForm').reset();
  $('#bannerType').value = banner?.type || 'promo';
  $('#bannerLabel').value = banner?.label || '';
  $('#bannerTitle').value = banner?.title || '';
  $('#bannerDescription').value = banner?.description || '';
  $('#bannerAlt').value = banner?.alt || '';
  $('#bannerActive').checked = banner ? banner.active : true;
  setBannerPreview(bannerForm.image);
  openModal($('#bannerModal'), $('#bannerTitle'));
}

async function pickBannerFile(files) {
  const file = files?.[0];
  if (!file) return;
  const errEl = $('#bannerFormError');
  showFormError(errEl, '');
  try {
    validateFile(file);
    const blob = await resizeImage(file, { maxSize: 1920, quality: 0.85 });
    if (bannerForm.preview) URL.revokeObjectURL(bannerForm.preview);
    bannerForm.blob = blob;
    bannerForm.preview = URL.createObjectURL(blob);
    setBannerPreview(bannerForm.preview);
  } catch (err) {
    showFormError(errEl, err.message);
  }
}
$('#bannerImageInput').addEventListener('change', async (e) => {
  await pickBannerFile(e.target.files);
  e.target.value = '';
});
wireDrop('#bannerDrop', pickBannerFile);
$('#newBannerBtn').addEventListener('click', () => openBannerModal());

$('#bannerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#bannerFormError');
  showFormError(errEl, '');
  const title = $('#bannerTitle').value.trim();
  const label = $('#bannerLabel').value.trim() || BANNER_TYPE[$('#bannerType').value].name;
  const problems = [];
  if (!bannerForm.blob && !bannerForm.image) problems.push('la imagen');
  if (title.length < 3) problems.push('el título (mínimo 3 caracteres)');
  if (problems.length) return showFormError(errEl, `Completá: ${problems.join(', ')}.`);

  const btn = $('#bannerSubmit');
  setBusy(btn, true, 'Guardando…');
  try {
    let image = bannerForm.image;
    if (bannerForm.blob) {
      $('#bannerSubmit span:last-child').textContent = 'Subiendo imagen…';
      image = await uploadBlob(bannerForm.blob, state.token);
    }
    const type = $('#bannerType').value;
    const body = {
      type,
      label,
      title,
      description: $('#bannerDescription').value.trim(),
      alt: $('#bannerAlt').value.trim(),
      image,
      active: $('#bannerActive').checked,
    };
    if (!bannerForm.editingId) body.format = type === 'hero' ? 'Se muestra vertical 4:5 (recomendado 1200×1500 px)' : '';
    if (bannerForm.editingId) await call(`banners?id=${encodeURIComponent(bannerForm.editingId)}`, { method: 'PUT', body });
    else await call('banners', { method: 'POST', body });
    // Recarga: activar una portada inicio puede desactivar otra.
    state.banners = await call('banners');
    renderBanners();
    renderKpis();
    closeModal($('#bannerModal'));
    showToast(bannerForm.editingId ? `Portada "${title}" actualizada.` : `Portada "${title}" creada.`);
  } catch (err) {
    if (err.status !== 401) showFormError(errEl, err.message);
  } finally {
    setBusy(btn, false);
  }
});

$('#bannersContainer').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.closest('article').dataset.id;
  const b = state.banners.find((x) => x.id === id);
  if (!b) return;
  const action = btn.dataset.action;
  if (action === 'edit') return openBannerModal(b);
  try {
    if (action === 'toggle') {
      btn.disabled = true;
      await call(`banners?id=${encodeURIComponent(id)}`, { method: 'PUT', body: { active: !b.active } });
      showToast(`Portada "${b.title}" ${b.active ? 'desactivada' : 'activada'}.`);
    } else if (action === 'delete') {
      const ok = await confirmDialog({ title: 'Eliminar portada', message: `Se eliminará la portada "${b.title}". Esta acción no se puede deshacer.` });
      if (!ok) return;
      await call(`banners?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      showToast(`Portada "${b.title}" eliminada.`);
    }
    state.banners = await call('banners');
    renderBanners();
    renderKpis();
    $(`#bannersContainer article[data-id="${CSS.escape(id)}"] button[data-action="${action}"]`)?.focus();
  } catch (err) {
    btn.disabled = false;
    if (err.status !== 401) showToast(err.message, 'error');
  }
});

/* ================================================================ Marcas */

function brandBadge(b, size = 'sm') {
  const box = size === 'sm' ? 'w-6 h-6 text-xs rounded-full bg-secondary-container' : 'w-9 h-9 text-sm rounded-xl bg-surface-container-lowest shadow-sm';
  return b.logo
    ? `<img src="${esc(safeImg(b.logo))}" alt="" class="${box} object-contain p-0.5 shrink-0" loading="lazy">`
    : `<span class="${box} text-primary font-bold flex items-center justify-center shrink-0" aria-hidden="true">${esc(b.initials)}</span>`;
}

function renderBrands() {
  $('#liveBrandsStrip').innerHTML = state.brands
    .map(
      (b) => `
<div class="flex items-center gap-2.5 px-4 py-2 rounded-full bg-surface-container-lowest shadow-sm border border-outline-variant/30 shrink-0">
  ${brandBadge(b)}
  <div class="flex flex-col">
    <span class="text-xs font-bold uppercase text-on-surface">${esc(b.name)}</span>
    <span class="text-[10px] text-on-surface-variant">${esc(b.category)}</span>
  </div>
</div>`
    )
    .join('');
  $('#brandListContainer').innerHTML = state.brands
    .map(
      (b) => `
<div class="p-3 rounded-xl bg-surface-container-low flex items-center gap-3" data-id="${esc(b.id)}">
  ${brandBadge(b, 'md')}
  <div class="flex-1 min-w-0">
    <div class="text-xs font-bold text-on-surface break-words">${esc(b.name)}</div>
    <div class="text-[11px] text-on-surface-variant">${esc(b.category)}</div>
  </div>
  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Publicada</span>
  <button type="button" data-action="delete" class="p-1 rounded-lg text-on-surface-variant/70 hover:text-error hover:bg-error-container" title="Eliminar marca" aria-label="Eliminar marca ${esc(b.name)}">
    <span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>
  </button>
</div>`
    )
    .join('');
  $('#brandCounter').textContent = `${state.brands.length} Marcas Incorporadas`;
}

const brandForm = { blob: null, preview: null };

async function pickBrandLogo(files) {
  const file = files?.[0];
  if (!file) return;
  const errEl = $('#brandFormError');
  showFormError(errEl, '');
  try {
    validateFile(file, { allowSvg: true });
    const blob = await resizeImage(file, { maxSize: 400, quality: 0.9 });
    if (brandForm.preview) URL.revokeObjectURL(brandForm.preview);
    brandForm.blob = blob;
    brandForm.preview = URL.createObjectURL(blob);
    const img = $('#brandLogoPreview');
    img.src = brandForm.preview;
    img.classList.remove('hidden');
    $('#brandUploadLabel').textContent = `Logo listo: ${file.name}`;
  } catch (err) {
    showFormError(errEl, err.message);
  }
}
$('#brandLogoInput').addEventListener('change', async (e) => {
  await pickBrandLogo(e.target.files);
  e.target.value = '';
});
wireDrop('#brandLogoDrop', pickBrandLogo);

function resetBrandForm() {
  $('#brandForm').reset();
  if (brandForm.preview) URL.revokeObjectURL(brandForm.preview);
  brandForm.blob = brandForm.preview = null;
  $('#brandLogoPreview').classList.add('hidden');
  $('#brandUploadLabel').textContent = 'Haga clic para subir isotipo oficial';
}

$('#brandForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#brandFormError');
  showFormError(errEl, '');
  const name = $('#newBrandName').value.trim();
  const category = $('#newBrandCategory').value.trim();
  const initials = $('#newBrandInitials').value.trim().toUpperCase();
  if (name.length < 2 || category.length < 2) return showFormError(errEl, 'Completá el nombre y la categoría de la marca.');
  if (initials && !/^[A-Z0-9ÁÉÍÓÚÑ]{1,3}$/.test(initials)) return showFormError(errEl, 'Las siglas deben ser de 1 a 3 letras o números.');
  if (state.brands.some((b) => b.name.toLowerCase() === name.toLowerCase())) return showFormError(errEl, `La marca "${name}" ya está en el carrusel.`);

  const btn = e.submitter || $('#brandForm button[type="submit"]');
  setBusy(btn, true, 'Incorporando…');
  try {
    const logo = brandForm.blob ? await uploadBlob(brandForm.blob, state.token) : '';
    const brand = await call('brands', { method: 'POST', body: { name, category, initials, logo } });
    state.brands.push(brand);
    resetBrandForm();
    renderAll();
    showToast(`¡Firma "${brand.name}" agregada al carrusel de inicio!`);
  } catch (err) {
    if (err.status !== 401) showFormError(errEl, err.message);
  } finally {
    setBusy(btn, false);
  }
});

$('#brandListContainer').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="delete"]');
  if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id;
  const b = state.brands.find((x) => x.id === id);
  if (!b) return;
  const used = state.articles.filter((a) => a.brand === b.name).length;
  // Doble confirmación: el módulo es "solo agregar" y borrar es la excepción.
  const first = await confirmDialog({
    title: `¿Quitar "${b.name}" del carrusel?`,
    message: `Este módulo está pensado para solo agregar marcas. ${used ? `Hay ${used} artículo(s) de esta marca: seguirán publicados, pero la marca dejará de aparecer en el carrusel.` : 'La marca dejará de aparecer en el carrusel de la tienda.'}`,
    okLabel: 'Continuar',
  });
  if (!first) return;
  const second = await confirmDialog({
    title: 'Confirmación final',
    message: 'Esta acción no se puede deshacer.',
    okLabel: 'Eliminar marca',
    requireText: b.name,
  });
  if (!second) return;
  try {
    await call(`brands?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    state.brands = state.brands.filter((x) => x.id !== id);
    renderAll();
    showToast(`Marca "${b.name}" eliminada del carrusel.`);
  } catch (err) {
    if (err.status !== 401) showToast(err.message, 'error');
  }
});

/* ================================================================ Inicio */

window.addEventListener('hashchange', () => {
  if (state.token) switchTab(location.hash.slice(1), false);
});

(async function init() {
  let token = null;
  let exp = 0;
  try {
    token = sessionStorage.getItem(TOKEN_KEY);
    exp = Number(sessionStorage.getItem(EXP_KEY));
  } catch {
    /* ignore */
  }
  if (!token || !exp || exp < Date.now()) {
    clearSession();
    return showLogin();
  }
  state.token = token;
  try {
    await api('auth', { token });
    await startApp();
  } catch {
    clearSession();
    showLogin('Tu sesión venció. Ingresá nuevamente.');
  }
})();
