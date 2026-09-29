// Panel: gestión de categorías principales y subcategorías (CRUD, mover, reordenar, activar).
import { esc } from '../shared/utils.js';

const $ = (sel, root = document) => root.querySelector(sel);

let d; // dependencias del panel: { state, call, confirmDialog, openModal, closeModal, showToast, showFormError, setBusy, onChange }

const byOrder = (a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es');
const catsSorted = () => [...d.state.categories].sort(byOrder);
const subsOf = (catId) => d.state.subcategories.filter((s) => s.categoryId === catId).sort(byOrder);
const productsIn = (subId) => d.state.articles.filter((a) => a.subcategoryId === subId);

/** Texto "Mujeres › Conjuntos" para un subcategoryId (o '' si no tiene). */
export function subcategoryPath(subId) {
  const sub = d?.state.subcategories.find((s) => s.id === subId);
  if (!sub) return '';
  const cat = d.state.categories.find((c) => c.id === sub.categoryId);
  return `${cat ? cat.name : '¿?'} › ${sub.name}`;
}

/** <option>s agrupadas por categoría para el formulario de artículo. */
export function subcategoryOptions(selectedId = '') {
  const groups = catsSorted()
    .map((c) => {
      const subs = subsOf(c.id);
      if (!subs.length) return '';
      return `<optgroup label="${esc(c.name)}${c.isActive ? '' : ' (oculta)'}">${subs
        .map(
          (s) =>
            `<option value="${esc(s.id)}"${s.id === selectedId ? ' selected' : ''}>${esc(c.name)} › ${esc(s.name)}${s.isActive ? '' : ' (oculta)'}</option>`
        )
        .join('')}</optgroup>`;
    })
    .join('');
  return `<option value=""${selectedId ? '' : ' selected'} disabled>Elegí una subcategoría…</option>${groups}`;
}

/* ---------------------------------------------------------------- Render */

const iconBtn = (action, icon, label, extra = '', disabled = false) =>
  `<button type="button" data-action="${action}" ${extra} class="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container disabled:opacity-30 disabled:pointer-events-none" aria-label="${esc(label)}" title="${esc(label)}"${disabled ? ' disabled' : ''}><span class="material-symbols-outlined text-[20px]" aria-hidden="true">${icon}</span></button>`;

const statusPill = (active) =>
  `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-container-high text-on-surface-variant'}">${active ? 'Visible' : 'Oculta'}</span>`;

function brandsLine(products) {
  const names = [...new Set(products.filter((p) => p.inStock).map((p) => p.brand))].sort((a, b) => a.localeCompare(b, 'es'));
  return names.length
    ? `<span class="text-[11px] text-on-surface-variant">Marcas: ${esc(names.join(', '))}</span>`
    : '<span class="text-[11px] text-on-surface-variant/80">Sin marcas (no hay artículos con stock)</span>';
}

function subRow(sub, i, total) {
  const products = productsIn(sub.id);
  return `
<li class="p-3 rounded-xl bg-surface-container-low flex flex-wrap items-center gap-2" data-sub="${esc(sub.id)}">
  <span class="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden="true">subdirectory_arrow_right</span>
  <div class="flex-1 min-w-[160px]">
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-sm font-bold text-on-surface">${esc(sub.name)}</span>
      ${statusPill(sub.isActive)}
      <span class="text-[11px] text-on-surface-variant">/${esc(sub.slug)} · ${products.length} ${products.length === 1 ? 'artículo' : 'artículos'}</span>
    </div>
    ${brandsLine(products)}
  </div>
  <div class="flex items-center">
    ${iconBtn('sub-up', 'arrow_upward', `Subir ${sub.name}`, '', i === 0)}
    ${iconBtn('sub-down', 'arrow_downward', `Bajar ${sub.name}`, '', i === total - 1)}
    ${iconBtn('sub-toggle', sub.isActive ? 'visibility' : 'visibility_off', `${sub.isActive ? 'Ocultar' : 'Mostrar'} ${sub.name}`, `aria-pressed="${sub.isActive}"`)}
    ${iconBtn('sub-edit', 'edit', `Editar o mover ${sub.name}`)}
    ${iconBtn('sub-delete', 'delete', `Eliminar ${sub.name}`)}
  </div>
</li>`;
}

function categoryCard(cat, i, total) {
  const subs = subsOf(cat.id);
  const count = subs.reduce((n, s) => n + productsIn(s.id).length, 0);
  return `
<article class="rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm" data-cat="${esc(cat.id)}">
  <div class="p-4 flex flex-wrap items-center gap-3 border-b border-outline-variant/20">
    <div class="flex-1 min-w-[180px]">
      <div class="flex items-center gap-2 flex-wrap">
        <h2 class="font-headline-sm text-xl font-bold text-on-surface">${esc(cat.name)}</h2>
        ${statusPill(cat.isActive)}
      </div>
      <p class="text-xs text-on-surface-variant">/${esc(cat.slug)} · ${subs.length} subcategorías · ${count} ${count === 1 ? 'artículo' : 'artículos'}</p>
    </div>
    <div class="flex items-center flex-wrap">
      ${iconBtn('cat-up', 'arrow_upward', `Subir ${cat.name}`, '', i === 0)}
      ${iconBtn('cat-down', 'arrow_downward', `Bajar ${cat.name}`, '', i === total - 1)}
      ${iconBtn('cat-toggle', cat.isActive ? 'visibility' : 'visibility_off', `${cat.isActive ? 'Ocultar' : 'Mostrar'} ${cat.name}`, `aria-pressed="${cat.isActive}"`)}
      ${iconBtn('cat-edit', 'edit', `Renombrar ${cat.name}`)}
      ${iconBtn('cat-delete', 'delete', `Eliminar ${cat.name}`)}
      <button type="button" data-action="sub-new" class="ml-1 inline-flex items-center gap-1 px-3 py-2 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold hover:bg-primary-fixed">
        <span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span> Subcategoría
      </button>
    </div>
  </div>
  <ul class="p-3 space-y-2">
    ${subs.map((s, n) => subRow(s, n, subs.length)).join('') || '<li class="p-3 text-sm text-on-surface-variant">Todavía no tiene subcategorías.</li>'}
  </ul>
</article>`;
}

export function renderCategories() {
  const cats = catsSorted();
  $('#categoriesContainer').innerHTML = cats.length
    ? cats.map((c, i) => categoryCard(c, i, cats.length)).join('')
    : '<div class="p-10 rounded-2xl border border-dashed border-outline-variant text-center text-sm text-on-surface-variant">No hay categorías. Creá la primera con “Nueva Categoría Principal”.</div>';
}

/* ---------------------------------------------------------------- Datos */

async function reload() {
  const [categories, subcategories, articles] = await Promise.all([d.call('categories'), d.call('subcategories'), d.call('articles')]);
  Object.assign(d.state, { categories, subcategories, articles });
  renderCategories();
  d.onChange();
}

/* ---------------------------------------------------------------- Modal */

const modal = { kind: 'category', id: null };

function openTaxonomyModal(kind, item = null, parentId = null) {
  modal.kind = kind;
  modal.id = item?.id || null;
  const isSub = kind === 'subcategory';
  $('#taxonomyModalTitle').textContent = `${item ? 'Editar' : 'Nueva'} ${isSub ? 'subcategoría' : 'categoría principal'}`;
  d.showFormError($('#taxonomyFormError'), '');
  $('#taxonomyForm').reset();
  $('#taxParentWrap').classList.toggle('hidden', !isSub);
  if (isSub) {
    $('#taxParent').innerHTML = catsSorted()
      .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
      .join('');
    $('#taxParent').value = item?.categoryId || parentId;
  }
  $('#taxName').value = item?.name || '';
  $('#taxName').placeholder = isSub ? 'Ej. Conjuntos' : 'Ej. Mujeres';
  $('#taxSlug').value = item?.slug || '';
  $('#taxActive').checked = item ? item.isActive : true;
  d.openModal($('#taxonomyModal'), $('#taxName'));
}

async function submitTaxonomy(e) {
  e.preventDefault();
  const errEl = $('#taxonomyFormError');
  d.showFormError(errEl, '');
  const name = $('#taxName').value.trim();
  const slug = $('#taxSlug').value.trim().toLowerCase();
  if (name.length < 2) return d.showFormError(errEl, 'El nombre debe tener al menos 2 caracteres.');
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return d.showFormError(errEl, 'El slug solo admite minúsculas, números y guiones.');
  const isSub = modal.kind === 'subcategory';
  const body = { name, isActive: $('#taxActive').checked };
  if (slug) body.slug = slug;
  if (isSub) body.categoryId = $('#taxParent').value;
  // Si el slug no se tocó al editar, se regenera con el nombre nuevo.
  if (modal.id && !slug) body.slug = '';

  const endpoint = isSub ? 'subcategories' : 'categories';
  const btn = $('#taxonomySubmit');
  d.setBusy(btn, true, 'Guardando…');
  try {
    if (modal.id) await d.call(`${endpoint}?id=${encodeURIComponent(modal.id)}`, { method: 'PUT', body });
    else await d.call(endpoint, { method: 'POST', body });
    await reload();
    d.closeModal($('#taxonomyModal'));
    d.showToast(`${isSub ? 'Subcategoría' : 'Categoría'} "${name}" guardada.`);
  } catch (err) {
    if (err.status !== 401) d.showFormError(errEl, err.message);
  } finally {
    d.setBusy(btn, false);
  }
}

/* ---------------------------------------------------------------- Acciones */

async function move(kind, id, delta) {
  const list = kind === 'cat' ? catsSorted() : subsOf(d.state.subcategories.find((s) => s.id === id).categoryId);
  const i = list.findIndex((x) => x.id === id);
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const ids = list.map((x) => x.id);
  if (kind === 'cat') await d.call('categories?action=reorder', { method: 'POST', body: { ids } });
  else await d.call('subcategories?action=reorder', { method: 'POST', body: { categoryId: list[0].categoryId, ids } });
  await reload();
  const sel = kind === 'cat' ? `[data-cat="${CSS.escape(id)}"] [data-action="cat-${delta < 0 ? 'up' : 'down'}"]` : `[data-sub="${CSS.escape(id)}"] [data-action="sub-${delta < 0 ? 'up' : 'down'}"]`;
  const btn = $(sel);
  (btn && !btn.disabled ? btn : $(kind === 'cat' ? `[data-cat="${CSS.escape(id)}"] [data-action="cat-edit"]` : `[data-sub="${CSS.escape(id)}"] [data-action="sub-edit"]`))?.focus();
}

async function onClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const catId = btn.closest('[data-cat]')?.dataset.cat;
  const subId = btn.closest('[data-sub]')?.dataset.sub;
  const cat = d.state.categories.find((c) => c.id === catId);
  const sub = d.state.subcategories.find((s) => s.id === subId);
  const action = btn.dataset.action;
  try {
    switch (action) {
      case 'cat-up':
      case 'cat-down':
        return await move('cat', catId, action === 'cat-up' ? -1 : 1);
      case 'sub-up':
      case 'sub-down':
        return await move('sub', subId, action === 'sub-up' ? -1 : 1);
      case 'cat-toggle':
        await d.call(`categories?id=${encodeURIComponent(catId)}`, { method: 'PUT', body: { isActive: !cat.isActive } });
        await reload();
        d.showToast(`Categoría "${cat.name}" ${cat.isActive ? 'oculta' : 'visible'} en la tienda.`);
        return $(`[data-cat="${CSS.escape(catId)}"] [data-action="cat-toggle"]`)?.focus();
      case 'sub-toggle':
        await d.call(`subcategories?id=${encodeURIComponent(subId)}`, { method: 'PUT', body: { isActive: !sub.isActive } });
        await reload();
        d.showToast(`Subcategoría "${sub.name}" ${sub.isActive ? 'oculta' : 'visible'} en la tienda.`);
        return $(`[data-sub="${CSS.escape(subId)}"] [data-action="sub-toggle"]`)?.focus();
      case 'cat-edit':
        return openTaxonomyModal('category', cat);
      case 'sub-edit':
        return openTaxonomyModal('subcategory', sub);
      case 'sub-new':
        return openTaxonomyModal('subcategory', null, catId);
      case 'cat-delete': {
        const subs = subsOf(catId);
        const n = subs.reduce((acc, s) => acc + productsIn(s.id).length, 0);
        const ok = await d.confirmDialog({
          title: `Eliminar la categoría "${cat.name}"`,
          message: `Se eliminan también sus ${subs.length} subcategorías.${n ? ` ${n} artículo(s) quedarán sin categoría (siguen publicados en el catálogo general).` : ''} No se puede deshacer.`,
          okLabel: 'Eliminar categoría',
          requireText: cat.name,
        });
        if (!ok) return;
        await d.call(`categories?id=${encodeURIComponent(catId)}`, { method: 'DELETE' });
        await reload();
        return d.showToast(`Categoría "${cat.name}" eliminada.`);
      }
      case 'sub-delete': {
        const n = productsIn(subId).length;
        const ok = await d.confirmDialog({
          title: `Eliminar "${sub.name}"`,
          message: `${n ? `${n} artículo(s) quedarán sin categoría (siguen publicados en el catálogo general). ` : ''}No se puede deshacer.`,
          okLabel: 'Eliminar subcategoría',
        });
        if (!ok) return;
        await d.call(`subcategories?id=${encodeURIComponent(subId)}`, { method: 'DELETE' });
        await reload();
        return d.showToast(`Subcategoría "${sub.name}" eliminada.`);
      }
    }
  } catch (err) {
    if (err.status !== 401) d.showToast(err.message, 'error');
  }
}

export function initCategories(deps) {
  d = deps;
  $('#newCategoryBtn').addEventListener('click', () => openTaxonomyModal('category'));
  $('#taxonomyForm').addEventListener('submit', submitTaxonomy);
  $('#categoriesContainer').addEventListener('click', onClick);
}
