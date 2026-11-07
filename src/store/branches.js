// Sucursales en la tienda: todo sale de /api/branches (admin → Sucursales & Horarios).
// El HTML de index.html trae las sucursales iniciales como primer pintado y por si la API falla.
import { esc } from '../shared/utils.js';
import { setPickupOptions } from './cart.js';

const $ = (sel) => document.querySelector(sel);

const mapQuery = (b) => b.mapQuery || `${b.name}, Rosario, Santa Fe`;
const encodeQuery = (s) => encodeURIComponent(s).replace(/%20/g, '+').replace(/%2C/g, ',');
const directionsUrl = (b) => `https://www.google.com/maps/search/?api=1&query=${encodeQuery(mapQuery(b))}`;
const embedUrl = (b) => `https://www.google.com/maps?q=${encodeQuery(mapQuery(b))}&output=embed`;

function card(b) {
  const hours = b.hours
    .map((r) => (r.days ? `<strong>${esc(r.days)}:</strong> ${esc(r.hours)}` : esc(r.hours)))
    .join('<br>');
  const details =
    hours || b.highlight
      ? `<div class="mt-space-md space-y-2 text-xs text-slate-600 bg-[#fdf2f8] p-3 rounded-2xl border border-pink-100">
          ${hours ? `<div class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px] text-[#be185d] mt-0.5" aria-hidden="true">schedule</span><span>${hours}</span></div>` : ''}
          ${b.highlight ? `<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px] text-[#be185d]" aria-hidden="true">${esc(b.icon)}</span><span>${esc(b.highlight)}</span></div>` : ''}
        </div>`
      : '';
  return `<article class="flex flex-col justify-between p-space-lg rounded-3xl bg-white ${b.isMain ? 'border-2 border-[#be185d] shadow-md hover:shadow-xl relative overflow-hidden' : 'border border-pink-200 shadow-sm hover:shadow-md'} transition-all">
  ${b.isMain ? '<div class="absolute top-0 right-0 bg-[#be185d] text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl tracking-wider uppercase">Casa Central</div>' : ''}
  <div class="flex flex-col">
    ${b.isMain ? '<div class="flex items-center gap-2 mb-2"><span class="px-2.5 py-0.5 rounded-full bg-pink-100 text-[#be185d] font-label-sm text-[11px] uppercase tracking-wider font-bold">Showroom Mayorista</span></div>' : ''}
    <h3 class="font-headline-sm text-xl font-bold text-slate-900">${esc(b.name)}</h3>
    ${b.subtitle ? `<p class="text-xs text-[#be185d] font-bold mt-0.5">${esc(b.subtitle)}</p>` : ''}
    ${b.description ? `<p class="text-xs text-slate-600 mt-1">${esc(b.description)}</p>` : ''}
    ${details}
  </div>
  <div class="flex items-center gap-2 pt-space-md mt-space-md border-t border-pink-100">
    <a class="flex-1 py-2.5 px-3 rounded-full bg-white border border-pink-300 hover:bg-pink-50 text-slate-800 font-label-sm text-xs text-center transition-colors flex items-center justify-center gap-1 font-semibold" href="${esc(directionsUrl(b))}" target="_blank" rel="noopener noreferrer" aria-label="Cómo llegar a ${esc(b.name)} (abre Google Maps)">
      <span class="material-symbols-outlined text-[16px]" aria-hidden="true">navigation</span> Cómo llegar
    </a>
  </div>
</article>`;
}

/* -------------------------------------------- Datos para Google (JSON-LD) */

const DAY_NAMES = { lun: 'Monday', mar: 'Tuesday', mie: 'Wednesday', jue: 'Thursday', vie: 'Friday', sab: 'Saturday', dom: 'Sunday' };
const DAY_KEYS = Object.keys(DAY_NAMES);
const pad = (h, m) => `${h.padStart(2, '0')}:${m || '00'}`;

/** "Lun a Vie" + "9:00 a 13:00 y 16:00 a 20:00 hs" → horarios para Google. Lo que no se entiende se omite. */
function openingHours(rows) {
  return rows.flatMap((row) => {
    const text = row.days.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const found = [...text.matchAll(/\b(lun|mar|mie|jue|vie|sab|dom)[a-z]*/g)].map((m) => m[1]);
    if (!found.length) return [];
    const isRange = found.length === 2 && /\sa\s/.test(text);
    const keys = isRange ? DAY_KEYS.slice(DAY_KEYS.indexOf(found[0]), DAY_KEYS.indexOf(found[1]) + 1) : found;
    const dayOfWeek = keys.map((k) => DAY_NAMES[k]);
    return [...row.hours.matchAll(/(\d{1,2})(?::(\d{2}))?\s*a\s*(\d{1,2})(?::(\d{2}))?/g)].map((m) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek,
      opens: pad(m[1], m[2]),
      closes: pad(m[3], m[4]),
    }));
  });
}

function updateStructuredData(branches) {
  const script = $('#ldBusiness');
  const data = JSON.parse(script.textContent);
  const isBranch = (n) => [n['@type']].flat().includes('LocalBusiness');
  const template = data['@graph'].find(isBranch);
  const org = data['@graph'].find((n) => !isBranch(n) && n.department);
  if (!template || !org) return;
  const base = org['@id'].split('#')[0];
  const nodes = branches.map((b) => {
    const [street, city = 'Rosario', region = 'Santa Fe'] = mapQuery(b).split(',').map((s) => s.trim());
    return {
      ...template,
      '@id': `${base}#${b.id}`,
      name: `ÚNICA LENCERÍA – ${b.isMain ? 'Casa Central ' : ''}${b.name}`,
      description: b.description,
      address: { '@type': 'PostalAddress', streetAddress: street, addressLocality: city, addressRegion: region, addressCountry: 'AR' },
      openingHoursSpecification: openingHours(b.hours),
    };
  });
  org.department = nodes.map((n) => ({ '@id': n['@id'] }));
  data['@graph'] = [...data['@graph'].filter((n) => !isBranch(n)), ...nodes];
  script.textContent = JSON.stringify(data);
}

/* ---------------------------------------------------------------- Render */

const GRID_BY_COUNT = { 1: 'md:grid-cols-1 max-w-md mx-auto', 2: 'md:grid-cols-2 max-w-3xl mx-auto' };

export function renderBranches(branches) {
  const n = branches.length;
  const first = branches.find((b) => b.isMain) || branches[0];

  // Sección de sucursales
  $('#branchesTitle').textContent =
    n === 0 ? 'Sucursales & Showrooms' : n === 1 ? 'Nuestra Sucursal & Showroom' : `Nuestras ${n} Sucursales & Showrooms`;
  const grid = $('#branchesGrid');
  grid.className = `grid grid-cols-1 ${GRID_BY_COUNT[n] || 'md:grid-cols-3'} gap-space-md mb-space-xl`;
  grid.innerHTML = n
    ? branches.map(card).join('')
    : '<p class="col-span-full text-center text-sm text-slate-600">Por el momento no hay sucursales disponibles. Escribinos por WhatsApp y coordinamos tu pedido.</p>';

  // Mapa: muestra la Casa Central (o la primera activa). Solo se recarga si cambió.
  $('#branchesMapBlock').classList.toggle('hidden', !n);
  if (n) {
    $('#branchesMapList').textContent = branches.map((b) => (b.isMain ? `${b.name} (Casa Central)` : b.name)).join(' • ');
    $('#branchesMapLink').href = directionsUrl(first);
    const map = $('#branchesMap');
    if (map.getAttribute('src') !== embedUrl(first)) map.src = embedUrl(first);
    map.title = `Mapa: Única Lencería, ${first.name}`;
  }

  // Inicio: contador y tarjeta flotante
  $('#statBranches').textContent = n === 1 ? '1 Local' : `${n} Locales`;
  $('#statBranchesBox').classList.toggle('hidden', !n);
  $('#heroBranch').classList.toggle('hidden', !n);
  if (n) $('#heroBranchName').textContent = first.isMain ? `Casa Central: ${first.name}` : first.name;

  // Pie de página
  $('#footerBranchesBox').classList.toggle('hidden', !n);
  $('#footerBranchesTitle').textContent = n === 1 ? '1 Showroom en Rosario' : `${n} Showrooms en Rosario`;
  $('#footerBranches').innerHTML = branches
    .map(
      (b) => `<li><strong class="text-slate-900 font-bold">${esc(b.name)}</strong>${
        b.subtitle ? `<br><span${b.isMain ? ' class="text-[#be185d] font-semibold"' : ''}>${esc(b.subtitle)}</span>` : ''
      }</li>`
    )
    .join('');
  $('#footerBranchesLink').textContent = n === 0 ? 'Sucursales Rosario' : n === 1 ? '1 Sucursal Rosario' : `${n} Sucursales Rosario`;

  // Carrito: opciones de retiro
  setPickupOptions(branches.map((b) => `Retiro en ${b.name}${b.isMain ? ' (Casa Central)' : ''}`));

  updateStructuredData(branches);
}
