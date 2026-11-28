// Redes: arma solas las publicaciones de Instagram (imagen cuadrada o historia + texto) con los artículos cargados.
// Todo se dibuja en el navegador (canvas): no gasta nada del servidor.
import { formatPrice, SITE_URL } from '../config.js';
import { hasOffer, regularPrice, salePrice } from '../shared/prices.js';
import { esc } from '../shared/utils.js';

const $ = (sel, root = document) => root.querySelector(sel);
const PINK = '#be185d';
const DARK = '#1e293b';
const SOFT = '#fdf2f8';
const SIZES = { post: [1080, 1080], story: [1080, 1920] };

let d; // { state, showToast }
const ui = { filter: 'novedades', search: '', format: 'post', shown: 24 };
const imageCache = new Map();

const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const productUrl = (a) => `${SITE_URL}/#producto/${a.id}`;
const hashtag = (s) => '#' + plain(s).replace(/[^a-z0-9]/g, '');

function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se pudo cargar la foto.'));
        img.src = src;
      })
    );
  }
  return imageCache.get(src);
}

/* ---------------------------------------------------------------- Texto */

export function captionOf(a) {
  const igUser = d.state.contact?.instagramUser;
  const lines = [];
  lines.push(a.isNew ? `✨ NOVEDAD ✨ ${a.title}` : hasOffer(a) ? `🔥 OFERTA 🔥 ${a.title}` : a.title);
  lines.push('');
  if (a.brand) lines.push(`🏷️ Marca: ${a.brand}${a.code ? ` · Art. ${a.code}` : ''}`);
  if (a.sizes?.length) lines.push(`📏 Talles: ${a.sizes.join(' - ')}`);
  if (a.colors?.length) lines.push(`🎨 Colores: ${a.colors.join(', ')}`);
  const price = hasOffer(a)
    ? `💲 Precio mayorista: ${formatPrice(a.offerPrice)} (antes ${formatPrice(regularPrice(a))})`
    : `💲 Precio mayorista: ${formatPrice(salePrice(a))}`;
  lines.push(`${price} ${a.presentation || ''}`.trim());
  lines.push('');
  lines.push('🛍️ Hacé tu pedido desde la web: elegís, armás tu pedido y nos llega por WhatsApp.');
  lines.push('🔗 Link en la bio · unicamayoristalenceria.com.ar');
  lines.push('📍 Showrooms en Rosario · Envíos por expreso o comisionista');
  lines.push('');
  const tags = ['#lenceriamayorista', '#lenceriapormayor', '#ropainteriormayorista', '#mayoristarosario', '#revendedoras', '#emprendedoras', '#lenceria', '#rosario'];
  if (a.brand) tags.unshift(hashtag(a.brand));
  if (igUser) lines.push(`@${igUser}`);
  lines.push(tags.join(' '));
  return lines.join('\n');
}

/* ---------------------------------------------------------------- Imagen */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Recorta la foto para que llene el recuadro (como object-fit: cover). */
function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  return lines;
}

export async function drawPost(a, format = 'post') {
  const [W, H] = SIZES[format];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  await document.fonts.load('700 60px "Playfair Display"').catch(() => {});
  await document.fonts.load('700 40px "Plus Jakarta Sans"').catch(() => {});

  ctx.fillStyle = SOFT;
  ctx.fillRect(0, 0, W, H);

  const story = format === 'story';
  const pad = 48;
  const infoH = story ? 450 : 300;
  const top = story ? 170 : pad;
  const photo = { x: pad, y: top, w: W - pad * 2, h: H - top - infoH - pad };

  // Foto
  ctx.save();
  roundRect(ctx, photo.x, photo.y, photo.w, photo.h, 36);
  ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
  if (a.images?.[0]) {
    try {
      drawCover(ctx, await loadImage(a.images[0]), photo.x, photo.y, photo.w, photo.h);
    } catch {
      /* sin foto: queda el fondo blanco */
    }
  }
  ctx.restore();

  // Etiqueta arriba a la izquierda
  const badge = a.isNew ? 'NOVEDAD' : hasOffer(a) ? 'OFERTA' : '';
  if (badge) {
    ctx.font = '800 34px "Plus Jakarta Sans", sans-serif';
    const bw = ctx.measureText(badge).width + 56;
    ctx.fillStyle = PINK;
    roundRect(ctx, photo.x + 24, photo.y + 24, bw, 66, 33);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, photo.x + 52, photo.y + 58);
  }

  // Logo
  try {
    const logo = await loadImage('/img/logo-unica.webp');
    const size = story ? 120 : 104;
    const lx = W - pad - size - 20;
    const ly = story ? 30 : photo.y + 20;
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx + size / 2, ly + size / 2, size / 2 + 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx + size / 2, ly + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    drawCover(ctx, logo, lx, ly, size, size);
    ctx.restore();
  } catch {
    /* sin logo */
  }
  if (story) {
    ctx.fillStyle = DARK;
    ctx.font = '700 52px "Playfair Display", serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('ÚNICA LENCERÍA', pad, 90);
  }

  // Datos
  let y = photo.y + photo.h + (story ? 60 : 44);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PINK;
  ctx.font = '700 30px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${(a.brand || '').toUpperCase()}${a.code ? `  ·  ART. ${a.code}` : ''}`, pad, y + 20);
  y += story ? 90 : 76;
  ctx.fillStyle = DARK;
  ctx.font = `700 ${story ? 56 : 46}px "Playfair Display", serif`;
  for (const line of wrap(ctx, a.title, W - pad * 2, story ? 3 : 2)) {
    ctx.fillText(line, pad, y);
    y += story ? 68 : 56;
  }
  y += story ? 40 : 20;
  // Precio
  ctx.font = `800 ${story ? 84 : 64}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = PINK;
  const priceText = formatPrice(salePrice(a));
  ctx.fillText(priceText, pad, y);
  let px = pad + ctx.measureText(priceText).width + 24;
  if (hasOffer(a)) {
    ctx.font = `600 ${story ? 44 : 36}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#64748b';
    const old = formatPrice(regularPrice(a));
    ctx.fillText(old, px, y);
    const ow = ctx.measureText(old).width;
    ctx.fillRect(px, y - (story ? 15 : 12), ow, 4);
    px += ow + 24;
  }
  ctx.font = `600 ${story ? 36 : 30}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#475569';
  ctx.fillText(`mayorista ${a.presentation || ''}`.trim(), px, y);

  // Pie
  ctx.font = `700 ${story ? 36 : 28}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = DARK;
  ctx.textAlign = 'center';
  ctx.fillText(story ? 'Pedí desde unicamayoristalenceria.com.ar' : 'unicamayoristalenceria.com.ar', W / 2, H - (story ? 70 : 28));
  ctx.textAlign = 'left';

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

/* ---------------------------------------------------------------- Lista */

function candidates() {
  const q = plain(ui.search).trim();
  return d.state.articles
    .filter((a) => a.inStock !== false && a.images?.length)
    .filter((a) => (ui.filter === 'novedades' ? a.isNew : ui.filter === 'ofertas' ? hasOffer(a) : true))
    .filter((a) => !q || plain(`${a.title} ${a.brand} ${a.code}`).includes(q))
    .sort((x, y) => String(y.createdAt || '').localeCompare(String(x.createdAt || '')));
}

const btn = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold';

function card(a) {
  return `<article data-social="${esc(a.id)}" class="rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm overflow-hidden flex flex-col">
  <div class="aspect-square bg-surface-container-low flex items-center justify-center" data-preview>
    <img src="${esc(a.images[0])}" alt="" loading="lazy" class="w-full h-full object-cover">
  </div>
  <div class="p-3 flex flex-col gap-2 flex-1">
    <p class="text-xs font-bold text-primary">${esc(a.brand)}${a.code ? ` · Art. ${esc(a.code)}` : ''}</p>
    <p class="text-sm font-semibold line-clamp-2">${esc(a.title)}</p>
    <div class="mt-auto grid grid-cols-2 gap-2">
      <button type="button" data-social-action="share" class="${btn} col-span-2 bg-primary text-on-primary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">ios_share</span>Compartir en Instagram</button>
      <button type="button" data-social-action="download" class="${btn} bg-surface-container-high"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">download</span>Imagen</button>
      <button type="button" data-social-action="copy" class="${btn} bg-surface-container-high"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">content_copy</span>Texto</button>
    </div>
  </div>
</article>`;
}

export function renderSocial() {
  const box = $('#socialContainer');
  if (!box || !d) return;
  const list = candidates();
  $('#socialCount').textContent = `${list.length} ${list.length === 1 ? 'artículo' : 'artículos'}`;
  box.innerHTML = list.length
    ? list.slice(0, ui.shown).map(card).join('')
    : `<div class="col-span-full p-10 rounded-2xl border border-dashed border-outline-variant text-center text-sm text-on-surface-variant">${
        ui.filter === 'novedades' ? 'No hay artículos marcados como Novedad con foto.' : ui.filter === 'ofertas' ? 'No hay artículos en oferta con foto.' : 'No hay artículos con foto.'
      }</div>`;
  $('#socialMore').classList.toggle('hidden', list.length <= ui.shown);
}

/* ---------------------------------------------------------------- Acciones */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function act(a, action, button) {
  const label = button.lastChild;
  const original = label.textContent;
  button.disabled = true;
  try {
    const caption = captionOf(a);
    if (action === 'copy') {
      d.showToast((await copyText(caption)) ? 'Texto copiado: pegalo en la publicación.' : 'No se pudo copiar el texto.', 'ok');
      return;
    }
    label.textContent = 'Armando…';
    const blob = await drawPost(a, ui.format);
    const name = `unica-${ui.format === 'story' ? 'historia' : 'post'}-${(a.code || a.id).toString().replace(/[^\w-]/g, '')}.jpg`;
    const file = new File([blob], name, { type: 'image/jpeg' });
    if (action === 'share' && navigator.canShare?.({ files: [file] })) {
      // Instagram no toma el texto que se comparte: se copia antes para pegarlo.
      const copied = await copyText(caption);
      try {
        await navigator.share({ files: [file] });
        if (copied) d.showToast('Texto copiado: en Instagram mantené apretado y tocá Pegar.', 'ok');
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          download(file, name);
          d.showToast('Se descargó la imagen. El texto ya está copiado.', 'ok');
        }
      }
      return;
    }
    download(file, name);
    const copied = action === 'share' && (await copyText(caption));
    d.showToast(copied ? 'Imagen descargada y texto copiado. Subila a Instagram desde el celular.' : 'Imagen descargada.', 'ok');
  } catch (err) {
    d.showToast(err.message || 'No se pudo armar la imagen.', 'error');
  } finally {
    label.textContent = original;
    button.disabled = false;
  }
}

async function preview(a, holder) {
  try {
    const blob = await drawPost(a, ui.format);
    const url = URL.createObjectURL(blob);
    holder.className = `${ui.format === 'story' ? 'aspect-[9/16]' : 'aspect-square'} bg-surface-container-low`;
    holder.innerHTML = `<img src="${url}" alt="Vista previa de la publicación" class="w-full h-full object-contain">`;
  } catch {
    /* queda la foto común */
  }
}

export function initSocial(deps) {
  d = deps;
  $('#socialFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    ui.filter = b.dataset.filter;
    ui.shown = 24;
    $$('#socialFilter [data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderSocial();
  });
  $('#socialFormat').addEventListener('change', (e) => {
    ui.format = e.target.value;
    renderSocial();
  });
  $('#socialSearch').addEventListener('input', (e) => {
    ui.search = e.target.value;
    renderSocial();
  });
  $('#socialMore').addEventListener('click', () => {
    ui.shown += 24;
    renderSocial();
  });
  $('#socialContainer').addEventListener('click', (e) => {
    const cardEl = e.target.closest('[data-social]');
    if (!cardEl) return;
    const a = d.state.articles.find((x) => x.id === cardEl.dataset.social);
    if (!a) return;
    const button = e.target.closest('[data-social-action]');
    if (button) return act(a, button.dataset.socialAction, button);
    if (e.target.closest('[data-preview]')) preview(a, cardEl.querySelector('[data-preview]'));
  });
}

const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
