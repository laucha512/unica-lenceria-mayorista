// Redes: arma solas las publicaciones de Instagram (imagen cuadrada o historia + texto) con los artículos cargados.
// Todo se dibuja en el navegador (canvas): no gasta nada del servidor.
import { formatPrice, SITE_URL } from '../config.js';
import { hasOffer, regularPrice, salePrice } from '../shared/prices.js';

const $ = (sel, root = document) => root.querySelector(sel);
const PINK = '#be185d';
const DARK = '#1e293b';
const SOFT = '#fdf2f8';
const SIZES = { post: [1080, 1080], feed: [1080, 1350], story: [1080, 1920] };

const imageCache = new Map();

const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const productUrl = (a) => `${SITE_URL}/#producto/${a.id}`;
const hashtag = (s) => '#' + plain(s).replace(/[^a-z0-9]/g, '');

export function loadImage(src) {
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

/* ---------------------------------------------------------------- Imagen */

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Recorta la foto para que llene el recuadro (como object-fit: cover). */
export function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

export function wrap(ctx, text, maxWidth, maxLines) {
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
  const infoH = story ? 450 : format === 'feed' ? 330 : 300;
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

/* ---------------------------------------------------------------- Acciones */

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

