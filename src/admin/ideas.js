// Redes → "Ideas listas": carruseles y fotos con formatos que funcionan en cuentas de lencería,
// armados solos con los artículos cargados. Todo se dibuja en el navegador (canvas).
import { formatPrice, SITE_URL } from '../config.js';
import { hasOffer, salePrice } from '../shared/prices.js';
import { esc } from '../shared/utils.js';
import { copyText, download, drawCover, drawPost, loadImage, roundRect, wrap } from './social.js';

const $ = (sel, root = document) => root.querySelector(sel);
const PINK = '#be185d';
const DEEP = '#831843';
const DARK = '#1e293b';
const SOFT = '#fdf2f8';
const W = 1080;
const H = 1350; // 4:5, el formato que más ocupa la pantalla en el feed
const WEB = SITE_URL.replace(/^https?:\/\//, '');
const SANS = '"Plus Jakarta Sans", sans-serif';
const SERIF = '"Playfair Display", serif';

let d; // { state, showToast }
const ui = { idea: 'novedades', brand: '', seed: 0, slides: [], caption: '' };

/* ---------------------------------------------------------------- Artículos */

const withPhoto = () => d.state.articles.filter((a) => a.inStock !== false && a.images?.length);
const newest = (list) => [...list].sort((x, y) => String(y.createdAt || '').localeCompare(String(x.createdAt || '')));
/** Mezcla determinística: "Cambiar artículos" muestra otros sin perder el orden de prioridad. */
function rotate(list, n) {
  if (!list.length) return [];
  const start = (ui.seed * n) % list.length;
  return [...list.slice(start), ...list.slice(0, start)].slice(0, n);
}
const brandsWithStock = () => {
  const count = new Map();
  for (const a of withPhoto()) count.set(a.brand, (count.get(a.brand) || 0) + 1);
  return [...count].filter(([b]) => b).sort((x, y) => y[1] - x[1]);
};

/* ---------------------------------------------------------------- Dibujo */

function newCanvas() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return [c, c.getContext('2d')];
}
const toBlob = (c) => new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));

async function fonts() {
  await Promise.all(
    ['700 60px "Playfair Display"', 'italic 400 60px "Playfair Display"', '800 40px "Plus Jakarta Sans"', '600 40px "Plus Jakarta Sans"'].map((f) =>
      document.fonts.load(f).catch(() => {})
    )
  );
}

async function logo(ctx, x, y, size) {
  try {
    const img = await loadImage('/img/logo-unica.webp');
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    drawCover(ctx, img, x, y, size, size);
    ctx.restore();
  } catch {
    /* sin logo */
  }
}

async function photo(ctx, a, x, y, w, h, r = 28) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, w, h);
  try {
    drawCover(ctx, await loadImage(a.images[0]), x, y, w, h);
  } catch {
    /* sin foto */
  }
  ctx.restore();
}

function lines(ctx, text, x, y, maxW, lh, maxLines, align = 'left') {
  ctx.textAlign = align;
  for (const l of wrap(ctx, text, maxW, maxLines)) {
    ctx.fillText(l, x, y);
    y += lh;
  }
  ctx.textAlign = 'left';
  return y;
}

function pill(ctx, text, x, y, { bg = PINK, fg = '#fff', size = 30, align = 'left' } = {}) {
  ctx.font = `800 ${size}px ${SANS}`;
  const w = ctx.measureText(text).width + size * 1.6;
  const h = size * 1.9;
  const left = align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = bg;
  roundRect(ctx, left, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + size * 0.8, y + h / 2 + 2);
  ctx.textBaseline = 'alphabetic';
  return h;
}

function footer(ctx, text = `${WEB} · link en la bio`, color = DARK) {
  ctx.font = `700 30px ${SANS}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, H - 50);
  ctx.textAlign = 'left';
}

/** Tapa: collage de fotos atrás y una franja con el título. */
async function coverSlide({ kicker, title, subtitle, items }) {
  await fonts();
  const [c, ctx] = newCanvas();
  ctx.fillStyle = SOFT;
  ctx.fillRect(0, 0, W, H);
  const pics = items.slice(0, 4);
  const gap = 12;
  const cols = pics.length >= 2 ? 2 : 1;
  const rows = pics.length > 2 ? 2 : 1;
  const cw = (W - gap * (cols + 1)) / cols;
  const ch = (H - gap * (rows + 1)) / rows;
  for (let i = 0; i < pics.length; i++) {
    const lastAlone = cols === 2 && i === pics.length - 1 && i % 2 === 0;
    await photo(ctx, pics[i], gap + (i % cols) * (cw + gap), gap + Math.floor(i / cols) * (ch + gap), lastAlone ? W - gap * 2 : cw, ch, 20);
  }
  // Franja
  const bandH = 470;
  const bandY = (H - bandH) / 2;
  ctx.fillStyle = 'rgba(131, 24, 67, 0.92)';
  ctx.fillRect(0, bandY, W, bandH);
  ctx.fillStyle = '#fbcfe8';
  ctx.font = `800 34px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText(kicker.toUpperCase(), W / 2, bandY + 90);
  ctx.fillStyle = '#fff';
  ctx.font = `700 96px ${SERIF}`;
  let y = lines(ctx, title, W / 2, bandY + 210, W - 140, 104, 2, 'center');
  if (subtitle) {
    ctx.font = `600 36px ${SANS}`;
    ctx.fillStyle = '#fce7f3';
    lines(ctx, subtitle, W / 2, Math.min(y + 10, bandY + bandH - 50), W - 160, 44, 1, 'center');
  }
  ctx.textAlign = 'left';
  await logo(ctx, W / 2 - 60, bandY - 70, 120);
  pill(ctx, 'DESLIZÁ  →', W / 2, H - 130, { bg: '#fff', fg: PINK, size: 32, align: 'center' });
  return toBlob(c);
}

/** Lámina de texto: para carruseles educativos (pasos, tips). */
async function textSlide({ number, title, body, dark = false }) {
  await fonts();
  const [c, ctx] = newCanvas();
  ctx.fillStyle = dark ? DEEP : SOFT;
  ctx.fillRect(0, 0, W, H);
  const fg = dark ? '#fff' : DARK;
  await logo(ctx, 80, 80, 100);
  ctx.fillStyle = dark ? '#fbcfe8' : PINK;
  ctx.font = `700 44px ${SERIF}`;
  ctx.fillText('ÚNICA LENCERÍA', 210, 145);
  let y = 420;
  if (number) {
    ctx.fillStyle = dark ? '#fbcfe8' : PINK;
    ctx.font = `700 200px ${SERIF}`;
    ctx.fillText(String(number), 80, y);
    y += 120;
  }
  ctx.fillStyle = fg;
  ctx.font = `700 80px ${SERIF}`;
  y = lines(ctx, title, 80, y, W - 160, 92, 4);
  if (body) {
    ctx.font = `500 48px ${SANS}`;
    ctx.fillStyle = dark ? '#fce7f3' : '#475569';
    lines(ctx, body, 80, y + 50, W - 160, 66, 8);
  }
  footer(ctx, undefined, dark ? '#fbcfe8' : DARK);
  return toBlob(c);
}

/** Cierre con llamado a la acción. */
async function ctaSlide(title = '¿Te gustó algo?') {
  await fonts();
  const [c, ctx] = newCanvas();
  ctx.fillStyle = PINK;
  ctx.fillRect(0, 0, W, H);
  await logo(ctx, W / 2 - 80, 120, 160);
  ctx.fillStyle = '#fff';
  ctx.font = `700 92px ${SERIF}`;
  let y = lines(ctx, title, W / 2, 420, W - 160, 100, 2, 'center');
  ctx.font = `600 44px ${SANS}`;
  ctx.fillStyle = '#fce7f3';
  y = lines(ctx, 'Armá tu pedido mayorista en la web y nos llega directo por WhatsApp.', W / 2, y + 20, W - 200, 60, 3, 'center');
  const steps = ['Entrá al link de la bio', 'Elegí talles y colores', 'Enviá tu pedido'];
  ctx.font = `700 40px ${SANS}`;
  y += 40;
  for (const [i, s] of steps.entries()) {
    ctx.fillStyle = '#fff';
    roundRect(ctx, 170, y, W - 340, 92, 46);
    ctx.fill();
    ctx.fillStyle = PINK;
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}. ${s}`, W / 2, y + 60);
    y += 114;
  }
  ctx.textAlign = 'left';
  footer(ctx, WEB, '#fff');
  return toBlob(c);
}

/** Collage de novedades en una sola foto. */
async function collageSlide(items, { title = 'Novedades', kicker = 'Recién llegados' } = {}) {
  await fonts();
  const [c, ctx] = newCanvas();
  ctx.fillStyle = SOFT;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = PINK;
  ctx.font = `800 30px ${SANS}`;
  ctx.fillText(kicker.toUpperCase(), 60, 105);
  ctx.fillStyle = DARK;
  ctx.font = `700 88px ${SERIF}`;
  ctx.fillText(title, 60, 200);
  await logo(ctx, W - 180, 70, 120);
  const pics = items.slice(0, items.length >= 9 ? 9 : items.length >= 6 ? 6 : items.length >= 4 ? 4 : items.length);
  const cols = pics.length === 4 ? 2 : Math.min(3, pics.length);
  const rows = Math.ceil(pics.length / cols);
  const gap = 16;
  const top = 250;
  const bottom = 120;
  const cw = (W - 60 * 2 - gap * (cols - 1)) / cols;
  const ch = (H - top - bottom - gap * (rows - 1)) / rows;
  for (const [i, a] of pics.entries()) {
    const x = 60 + (i % cols) * (cw + gap);
    const y = top + Math.floor(i / cols) * (ch + gap);
    await photo(ctx, a, x, y, cw, ch, 20);
    const price = formatPrice(salePrice(a));
    ctx.font = `800 ${cols === 2 ? 34 : 28}px ${SANS}`;
    const pw = ctx.measureText(price).width + 32;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, x + 12, y + ch - 62, pw, 50, 25);
    ctx.fill();
    ctx.fillStyle = PINK;
    ctx.fillText(price, x + 28, y + ch - 26);
  }
  footer(ctx);
  return toBlob(c);
}

/** "¿1, 2 o 3?": encuesta en una foto para sumar comentarios. */
async function pickSlide(items) {
  await fonts();
  const [c, ctx] = newCanvas();
  ctx.fillStyle = SOFT;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = DARK;
  ctx.font = `700 84px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText(`¿${items.map((_, i) => i + 1).join(', ').replace(/, (\d)$/, ' o $1')}?`, W / 2, 150);
  ctx.font = `600 38px ${SANS}`;
  ctx.fillStyle = '#475569';
  ctx.fillText('Elegí tu favorito y comentá el número 👇', W / 2, 215);
  ctx.textAlign = 'left';
  const n = items.length;
  const gap = 20;
  const top = 270;
  const cw = (W - 60 * 2 - gap * (n - 1)) / n;
  const ch = H - top - 210;
  for (const [i, a] of items.entries()) {
    const x = 60 + i * (cw + gap);
    await photo(ctx, a, x, top, cw, ch, 24);
    ctx.fillStyle = PINK;
    ctx.beginPath();
    ctx.arc(x + 60, top + 60, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 52px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x + 60, top + 78);
    ctx.fillStyle = DARK;
    ctx.font = `700 30px ${SANS}`;
    ctx.fillText(a.brand || '', x + cw / 2, top + ch + 50);
    ctx.fillStyle = PINK;
    ctx.font = `800 36px ${SANS}`;
    ctx.fillText(formatPrice(salePrice(a)), x + cw / 2, top + ch + 100);
    ctx.textAlign = 'left';
  }
  await logo(ctx, 60, H - 150, 90);
  footer(ctx);
  return toBlob(c);
}

/* ---------------------------------------------------------------- Ideas */

const TAGS = '#lenceriamayorista #lenceriapormayor #ropainteriormayorista #mayoristarosario #revendedoras #emprendedoras #lenceria #rosario';
const list = (items) => items.map((a) => `▪️ ${a.title} – ${formatPrice(salePrice(a))}`).join('\n');
const igLine = () => (d.state.contact?.instagramUser ? `@${d.state.contact.instagramUser}\n` : '');

const IDEAS = {
  novedades: {
    label: 'Carrusel: Nuevos ingresos',
    hint: 'Tapa con collage + una lámina por novedad + cierre. El formato más usado para mostrar lo nuevo.',
    pick: () => rotate(newest(withPhoto().filter((a) => a.isNew)), 8),
    async build(items) {
      const slides = [await coverSlide({ kicker: 'Nuevos ingresos', title: 'Llegó lo nuevo', subtitle: `${items.length} artículos para tu negocio`, items })];
      for (const a of items) slides.push(await drawPost(a, 'feed'));
      slides.push(await ctaSlide('¿Cuál vas a sumar a tu local?'));
      return slides;
    },
    caption: (items) =>
      `✨ NUEVOS INGRESOS ✨\nDeslizá y mirá todo lo que llegó esta semana 👉\n\n${list(items)}\n\n🛍️ Precios mayoristas. Armá tu pedido desde la web (link en la bio) y te llega por WhatsApp.\n📍 Showrooms en Rosario\n\n${igLine()}${TAGS}`,
  },
  ofertas: {
    label: 'Carrusel: Ofertas de la semana',
    hint: 'Ideal para empujar ventas: muestra el precio anterior tachado.',
    pick: () => rotate(newest(withPhoto().filter(hasOffer)), 8),
    async build(items) {
      const slides = [await coverSlide({ kicker: 'Solo por esta semana', title: 'Ofertas mayoristas', subtitle: 'Hasta agotar stock', items })];
      for (const a of items) slides.push(await drawPost(a, 'feed'));
      slides.push(await ctaSlide('¡Aprovechá antes que se agoten!'));
      return slides;
    },
    caption: (items) =>
      `🔥 OFERTAS DE LA SEMANA 🔥\nPrecios mayoristas rebajados, hasta agotar stock 👉\n\n${list(items)}\n\n🛍️ Pedí desde la web (link en la bio).\n\n${igLine()}${TAGS} #ofertas`,
  },
  marca: {
    label: 'Carrusel: Llegó una marca',
    hint: 'Presenta una marca con sus artículos. Elegí la marca abajo.',
    needsBrand: true,
    pick: () => rotate(newest(withPhoto().filter((a) => a.brand === ui.brand)), 8),
    async build(items) {
      const slides = [await coverSlide({ kicker: 'Marca destacada', title: ui.brand, subtitle: 'Ahora en ÚNICA Mayorista', items })];
      for (const a of items) slides.push(await drawPost(a, 'feed'));
      slides.push(await ctaSlide(`Todo ${ui.brand} en la web`));
      return slides;
    },
    caption: (items) =>
      `💗 ${ui.brand.toUpperCase()} en ÚNICA 💗\nDeslizá para ver los modelos disponibles 👉\n\n${list(items)}\n\n🛍️ Precios mayoristas. Pedí desde la web (link en la bio).\n\n${igLine()}#${ui.brand.toLowerCase().replace(/[^a-z0-9]/g, '')} ${TAGS}`,
  },
  revender: {
    label: 'Carrusel: ¿Querés empezar a revender?',
    hint: 'Educativo: de los que más se guardan y comparten. Atrae revendedoras nuevas.',
    pick: () => rotate([...withPhoto()].sort((x, y) => salePrice(x) - salePrice(y)), 4),
    async build(items) {
      return [
        await coverSlide({ kicker: 'Guía para emprendedoras', title: '¿Querés vender lencería?', subtitle: 'Te contamos cómo arrancar 👉', items }),
        await textSlide({ number: 1, title: 'Elegí qué vender', body: 'Arrancá con lo que más rota: packs de bombachas, boxers, medias y conjuntos básicos. Se venden todo el año.' }),
        await textSlide({ number: 2, title: 'Comprá por mayor', body: 'Comprando al por mayor tenés margen para revender a precio de mercado y ganar en cada prenda.' }),
        await textSlide({ number: 3, title: 'Mostralo bien', body: 'Sacá fotos con luz natural, armá un catálogo en tus historias y usá estados de WhatsApp todos los días.' }),
        await textSlide({ number: 4, title: 'Reponé lo que se vende', body: 'Fijate qué te piden más y volvé a pedir eso. En ÚNICA tenés novedades seguido.' }),
        await collageSlide(items, { title: 'Para arrancar', kicker: 'Los más accesibles' }),
        await ctaSlide('Empezá hoy con ÚNICA'),
      ];
    },
    caption: () =>
      `💼 ¿Querés empezar a vender lencería? Guardá este posteo 📌\n\n1️⃣ Elegí productos que roten todo el año\n2️⃣ Comprá por mayor para tener margen\n3️⃣ Mostralo bien en tus redes\n4️⃣ Reponé lo que más se vende\n\nEn ÚNICA tenés precios mayoristas y novedades seguido. Armá tu primer pedido desde la web (link en la bio).\n\n${igLine()}${TAGS} #emprendimiento #negociopropio`,
  },
  comprar: {
    label: 'Carrusel: Cómo comprar en la web',
    hint: 'Explica paso a paso cómo hacer un pedido. Sirve para fijar en el perfil.',
    pick: () => rotate(newest(withPhoto()), 4),
    async build(items) {
      return [
        await coverSlide({ kicker: 'Paso a paso', title: 'Cómo comprar en ÚNICA', subtitle: 'Fácil y desde el celular 👉', items }),
        await textSlide({ number: 1, title: 'Entrá a la web', body: `Tocá el link de la bio o entrá a ${WEB}. Vas a ver todo el catálogo con precios mayoristas.` }),
        await textSlide({ number: 2, title: 'Elegí tus artículos', body: 'Filtrá por categoría, marca o talle. En cada artículo elegís talles, colores y cantidad.' }),
        await textSlide({ number: 3, title: 'Completá tus datos', body: 'Tu WhatsApp, nombre y localidad. La próxima vez ya te aparecen solos.' }),
        await textSlide({ number: 4, title: 'Enviá el pedido', body: 'Te llega a nuestro WhatsApp con un código. Te confirmamos y coordinamos retiro o envío.', dark: true }),
        await ctaSlide('¡Hacé tu pedido ahora!'),
      ];
    },
    caption: () =>
      `🛒 ¿Cómo comprar en ÚNICA? Te lo explicamos en 4 pasos 👉\n\n1️⃣ Entrá a la web (link en la bio)\n2️⃣ Elegí artículos, talles y colores\n3️⃣ Completá tus datos\n4️⃣ Enviá el pedido y te llega a nuestro WhatsApp\n\nRetiro en nuestros showrooms de Rosario o envío por expreso/comisionista.\n\n${igLine()}${TAGS}`,
  },
  collage: {
    label: 'Foto: Collage de novedades',
    hint: 'Una sola imagen con varias novedades y sus precios.',
    pick: () => rotate(newest(withPhoto().filter((a) => a.isNew)), 9),
    build: async (items) => [await collageSlide(items)],
    caption: (items) => `✨ Novedades de la semana ✨\n\n${list(items)}\n\n🛍️ Pedí desde la web (link en la bio).\n\n${igLine()}${TAGS}`,
  },
  elegir: {
    label: 'Foto: ¿1, 2 o 3? Elegí tu favorito',
    hint: 'Encuesta para que comenten: más comentarios = más alcance.',
    pick: () => rotate(newest(withPhoto().filter((a) => a.isNew).concat(withPhoto())), 3).filter((a, i, arr) => arr.indexOf(a) === i),
    build: async (items) => [await pickSlide(items)],
    caption: (items) =>
      `💗 ¿Cuál elegís? ${items.map((_, i) => `${i + 1}️⃣`).join(' ')}\nComentá el número de tu favorito 👇\n\n${items.map((a, i) => `${i + 1}. ${a.title} – ${formatPrice(salePrice(a))}`).join('\n')}\n\n🛍️ Todos disponibles en la web (link en la bio).\n\n${igLine()}${TAGS}`,
  },
};

/* ---------------------------------------------------------------- Pantalla */

const btnCls = 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold';

export function renderIdeas() {
  const box = $('#ideasPanel');
  if (!box || !d) return;
  const brands = brandsWithStock();
  if (!ui.brand && brands.length) ui.brand = brands[0][0];
  const idea = IDEAS[ui.idea];
  box.innerHTML = `
  <div class="flex flex-wrap gap-2" role="group" aria-label="Ideas">
    ${Object.entries(IDEAS)
      .map(([k, v]) => `<button type="button" data-idea="${k}" aria-pressed="${k === ui.idea}" class="px-3.5 py-2 rounded-full text-xs font-bold bg-surface-container-high aria-pressed:bg-primary aria-pressed:text-on-primary">${esc(v.label)}</button>`)
      .join('')}
  </div>
  <p class="mt-3 text-sm text-on-surface-variant">${esc(idea.hint)}</p>
  <div class="mt-3 flex flex-wrap items-center gap-2">
    ${idea.needsBrand ? `<select id="ideaBrand" aria-label="Marca" class="bg-surface-container-low px-3 py-2 pr-8 rounded-xl text-sm border-none focus:ring-2 focus:ring-primary font-medium">${brands.map(([b, n]) => `<option value="${esc(b)}"${b === ui.brand ? ' selected' : ''}>${esc(b)} (${n})</option>`).join('')}</select>` : ''}
    <button type="button" data-idea-action="build" class="${btnCls} bg-primary text-on-primary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">auto_awesome</span><span>Armar</span></button>
    <button type="button" data-idea-action="shuffle" class="${btnCls} bg-surface-container-high"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">shuffle</span><span>Cambiar artículos</span></button>
  </div>
  <div id="ideaResult" class="mt-4"></div>`;
}

function renderResult() {
  const out = $('#ideaResult');
  if (!ui.slides.length) return (out.innerHTML = '');
  const urls = ui.slides.map((b) => URL.createObjectURL(b));
  out.innerHTML = `
  <div class="flex gap-3 overflow-x-auto pb-2 snap-x">
    ${urls.map((u, i) => `<img src="${u}" alt="Lámina ${i + 1} de ${urls.length}" class="h-72 sm:h-80 aspect-[4/5] object-cover rounded-xl shadow-sm snap-start shrink-0 border border-outline-variant/30">`).join('')}
  </div>
  <p class="mt-1 text-xs text-on-surface-variant">${urls.length === 1 ? '1 imagen' : `${urls.length} láminas: deslizá para verlas`}</p>
  <div class="mt-3 flex flex-wrap gap-2">
    <button type="button" data-idea-action="share" class="${btnCls} bg-primary text-on-primary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">ios_share</span><span>Compartir en Instagram</span></button>
    <button type="button" data-idea-action="download" class="${btnCls} bg-surface-container-high"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">download</span><span>Descargar ${urls.length === 1 ? 'imagen' : 'imágenes'}</span></button>
    <button type="button" data-idea-action="copy" class="${btnCls} bg-surface-container-high"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">content_copy</span><span>Copiar texto</span></button>
  </div>
  <textarea readonly rows="8" class="mt-3 w-full rounded-xl bg-surface-container-low border-none text-sm" aria-label="Texto de la publicación">${esc(ui.caption)}</textarea>`;
}

async function build(button) {
  const idea = IDEAS[ui.idea];
  const items = idea.pick();
  if (!items.length) {
    d.showToast(ui.idea === 'ofertas' ? 'No hay artículos en oferta con foto.' : 'No hay artículos con foto para esta idea (¿marcaste novedades?).', 'error');
    return;
  }
  const label = button?.lastElementChild;
  const original = label?.textContent;
  if (label) label.textContent = 'Armando…';
  if (button) button.disabled = true;
  try {
    ui.slides = await idea.build(items);
    ui.caption = idea.caption(items);
    renderResult();
  } catch (err) {
    d.showToast(err.message || 'No se pudo armar.', 'error');
  } finally {
    if (label) label.textContent = original;
    if (button) button.disabled = false;
  }
}

const files = () => ui.slides.map((b, i) => new File([b], `unica-${ui.idea}-${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }));

async function share() {
  const list = files();
  const copied = await copyText(ui.caption);
  if (navigator.canShare?.({ files: list })) {
    try {
      await navigator.share({ files: list });
      if (copied) d.showToast('Texto copiado: en Instagram mantené apretado y tocá Pegar.');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  saveAll(list);
  d.showToast(copied ? 'Imágenes descargadas y texto copiado.' : 'Imágenes descargadas.');
}

function saveAll(list = files()) {
  list.forEach((f, i) => setTimeout(() => download(f, f.name), i * 350));
}

export function initIdeas(deps) {
  d = deps;
  $('#ideasPanel').addEventListener('click', (e) => {
    const pick = e.target.closest('[data-idea]');
    if (pick) {
      ui.idea = pick.dataset.idea;
      ui.seed = 0;
      ui.slides = [];
      renderIdeas();
      return;
    }
    const b = e.target.closest('[data-idea-action]');
    if (!b) return;
    const action = b.dataset.ideaAction;
    if (action === 'build') build(b);
    if (action === 'shuffle') {
      ui.seed++;
      build($('[data-idea-action="build"]'));
    }
    if (action === 'share') share();
    if (action === 'download') saveAll();
    if (action === 'copy') copyText(ui.caption).then((ok) => d.showToast(ok ? 'Texto copiado.' : 'No se pudo copiar.', ok ? 'ok' : 'error'));
  });
  $('#ideasPanel').addEventListener('change', (e) => {
    if (e.target.id !== 'ideaBrand') return;
    ui.brand = e.target.value;
    ui.seed = 0;
    build($('[data-idea-action="build"]'));
  });
}
