// Redes → "Ideas listas": carruseles y fotos con formatos que funcionan en cuentas de lencería,
// armados solos con los artículos cargados. Todo se dibuja en el navegador (canvas).
import { formatPrice, SITE_URL } from '../config.js';
import { hasOffer, salePrice } from '../shared/prices.js';
import { esc } from '../shared/utils.js';
import { subIdsOf } from '../shared/tree.js';
import { buildReel, previewMusic, recordReel } from './reels.js';
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
const ui = { idea: 'plan', brand: '', seed: 0, results: [], overrides: {}, bgMode: '0', sub: 'auto', music: 'alegre', musicFile: null, musicName: '' };
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

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
async function coverSlide({ kicker, title, subtitle, items, bg }) {
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
  if (bg) {
    try {
      drawCover(ctx, await loadImage(bg), 0, 0, W, H);
    } catch {
      /* sin foto */
    }
  }
  for (let i = 0; i < (bg ? 0 : pics.length); i++) {
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

/* ---------------------------------------------------------------- Fotos genéricas */
// Texto sobre un fondo: diseño propio (3 estilos), una foto de tus artículos o una foto que subas.

const PALETTES = [
  { from: '#fdf2f8', to: '#fbcfe8', fg: DARK, accent: PINK, dark: false }, // rosa claro
  { from: '#831843', to: '#be185d', fg: '#fff', accent: '#fbcfe8', dark: true }, // bordó
  { from: '#fff7ed', to: '#fde68a', fg: DARK, accent: '#b45309', dark: false }, // nude / crema
];

/** Puntilla dibujada: semicírculos con agujeritos, como el borde de una prenda de encaje. */
function lace(ctx, y, color, flip = false) {
  ctx.save();
  ctx.fillStyle = color;
  const r = 30;
  for (let x = -r; x < W + r; x += r * 2) {
    ctx.beginPath();
    ctx.arc(x + r, y, r, flip ? Math.PI : 0, flip ? Math.PI * 2 : Math.PI);
    ctx.fill();
  }
  ctx.fillRect(0, flip ? y : y - 40, W, 40);
  ctx.globalCompositeOperation = 'destination-out';
  for (let x = -r; x < W + r; x += r * 2) {
    ctx.beginPath();
    ctx.arc(x + r, y + (flip ? -12 : 12), 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

async function background(ctx, bg) {
  if (bg.photo) {
    try {
      drawCover(ctx, await loadImage(bg.photo), 0, 0, W, H);
    } catch {
      ctx.fillStyle = DEEP;
      ctx.fillRect(0, 0, W, H);
    }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0.15)');
    g.addColorStop(0.45, 'rgba(80,7,36,0.55)');
    g.addColorStop(1, 'rgba(80,7,36,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return { fg: '#fff', accent: '#fbcfe8', dark: true };
  }
  const p = PALETTES[bg.palette % PALETTES.length];
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, p.from);
  g.addColorStop(1, p.to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Lunares suaves
  ctx.fillStyle = p.dark ? 'rgba(255,255,255,0.07)' : 'rgba(190,24,93,0.06)';
  for (let i = 0; i < 40; i++) {
    const x = (i * 263) % W;
    const y = (i * 397) % H;
    ctx.beginPath();
    ctx.arc(x, y, 10 + (i % 4) * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  const laceColor = p.dark ? 'rgba(255,255,255,0.18)' : 'rgba(190,24,93,0.16)';
  lace(ctx, 40, laceColor);
  lace(ctx, H - 40, laceColor, true);
  return p;
}

async function genericSlide(post, bg) {
  await fonts();
  const [c, ctx] = newCanvas();
  const p = await background(ctx, bg);
  // Bloque centrado: logo + etiqueta + título + texto chico
  const long = post.title.length > 60;
  ctx.font = `700 ${long ? 76 : 92}px ${SERIF}`;
  const tLines = wrap(ctx, post.title, W - 160, 5);
  const tLH = long ? 88 : 104;
  ctx.font = `500 46px ${SANS}`;
  const bLines = post.body ? wrap(ctx, post.body, W - 200, 5) : [];
  const blockH = 130 + 90 + tLines.length * tLH + (bLines.length ? 40 + bLines.length * 62 : 0);
  let y = Math.max(140, (H - blockH) / 2 + (bg.photo ? 120 : 0));
  await logo(ctx, W / 2 - 60, y, 120);
  y += 130 + 60;
  ctx.textAlign = 'center';
  ctx.fillStyle = p.accent;
  ctx.font = `800 34px ${SANS}`;
  ctx.fillText(post.kicker.toUpperCase(), W / 2, y);
  y += 30 + tLH * 0.85;
  ctx.fillStyle = p.fg;
  ctx.font = `700 ${long ? 76 : 92}px ${SERIF}`;
  for (const l of tLines) {
    ctx.fillText(l, W / 2, y);
    y += tLH;
  }
  if (bLines.length) {
    y += 30;
    ctx.font = `500 46px ${SANS}`;
    ctx.fillStyle = p.dark ? '#fce7f3' : '#475569';
    for (const l of bLines) {
      ctx.fillText(l, W / 2, y);
      y += 62;
    }
  }
  ctx.textAlign = 'left';
  footer(ctx, undefined, p.dark ? '#fce7f3' : DARK);
  return toBlob(c);
}

/* ---------------------------------------------------------------- Banco de textos */
// Textos propios, pensados para revendedoras y negocios de lencería.

const BANK = {
  frase: {
    label: 'Frase para emprendedoras',
    kicker: 'Para vos, emprendedora',
    tags: '#emprendedoras #frasesemprendedoras #mujeresemprendedoras',
    posts: [
      ['Tu negocio crece cada vez que no te rendís.', 'Cada pedido cuenta. Seguí adelante 💗'],
      ['Empezar chiquito también es empezar.', 'Lo importante es dar el primer paso.'],
      ['Vender lencería es vender confianza.', 'Tus clientas vuelven porque las asesorás bien.'],
      ['No esperes el momento perfecto: armá tu primer pedido hoy.', ''],
      ['Detrás de cada emprendimiento hay una mujer valiente.', 'Feliz de acompañarte en el camino.'],
      ['Tu stock es tu vidriera: renovalo seguido.', 'Las novedades atraen clientas nuevas.'],
      ['El éxito es la suma de pequeños esfuerzos de todos los días.', ''],
      ['Creé en lo que vendés y se nota.', 'La seguridad también se contagia.'],
      ['Hoy es un buen día para vender.', 'Subí una historia, mostrá lo nuevo y escuchá a tus clientas.'],
      ['Ser tu propia jefa es una decisión que se renueva cada día.', ''],
      ['Cada clienta conforme es tu mejor publicidad.', ''],
      ['Lo que hoy es un sueño, mañana puede ser tu local.', 'Vamos por más 💪'],
    ],
  },
  cuidado: {
    label: 'Cuidado de la lencería',
    kicker: 'Tips de cuidado',
    tags: '#cuidadodelalenceria #tips #lenceria',
    posts: [
      ['Lavá tu lencería a mano con agua fría', 'Así el encaje y los elásticos duran mucho más.'],
      ['Usá una bolsa de red si lavás en lavarropas', 'Evita que los breteles y ganchos se enganchen.'],
      ['Nunca la pongas en la secadora', 'El calor arruina los elásticos. Mejor secarla a la sombra.'],
      ['Abrochá el corpiño antes de lavarlo', 'Así los ganchos no dañan otras prendas.'],
      ['Guardá los corpiños con taza sin doblarlos', 'Uno dentro del otro, para que mantengan la forma.'],
      ['Rotá tus corpiños', 'Dejar descansar el elástico un día entre uso y uso lo hace durar más.'],
      ['Jabón neutro, siempre', 'Los detergentes fuertes y la lavandina gastan colores y telas.'],
      ['Las prendas de satén, del revés', 'Lavalas y planchalas del revés y a baja temperatura.'],
    ],
  },
  venta: {
    label: 'Tips para vender más',
    kicker: 'Tips para revendedoras',
    tags: '#revendedoras #tipsdeventa #emprendimiento',
    posts: [
      ['Mostrá las prendas puestas o en maniquí', 'Las clientas compran más cuando ven cómo queda.'],
      ['Usá los estados de WhatsApp todos los días', 'Son gratis y los ven todas tus clientas.'],
      ['Armá combos', 'Ej.: corpiño + bombacha, o pack de 3. Aumenta el ticket de cada venta.'],
      ['Sacá fotos con luz natural', 'Cerca de una ventana y con fondo liso: se ve mucho más lindo.'],
      ['Tené siempre talles grandes', 'Es lo que más cuesta conseguir y lo que más te van a agradecer.'],
      ['Preguntá qué buscan tus clientas', 'Anotá lo que te piden y sumalo en tu próximo pedido.'],
      ['Ofrecé cambio de talle', 'Da confianza para comprar sin probarse.'],
      ['Publicá en horarios de más movimiento', 'Al mediodía y a la noche, entre 20 y 23 h, suele haber más gente conectada.'],
    ],
  },
  sabias: {
    label: '¿Sabías que…?',
    kicker: '¿Sabías que…?',
    tags: '#sabiasque #lenceria #datoscuriosos',
    posts: [
      ['La mayoría de las mujeres usa un talle de corpiño que no es el suyo', 'Asesorar bien a tus clientas hace la diferencia.'],
      ['Un corpiño bien cuidado puede durar más de un año', 'Lavarlo a mano y rotarlo es la clave.'],
      ['El algodón es la tela más recomendada para el uso diario', 'Es fresco, suave y deja respirar la piel.'],
      ['El encaje es de los materiales más elegidos en lencería', 'Combina con todo y nunca pasa de moda.'],
      ['La lencería es de los regalos más elegidos en fechas especiales', 'Día de la Madre, San Valentín y Navidad: preparate con stock.'],
      ['Los packs son lo que más rota en una lencería', 'Bombachas, boxers y medias se venden todo el año.'],
    ],
  },
};

/* ---------------------------------------------------------------- Fechas especiales */

const nthSunday = (y, m, n) => {
  const d1 = new Date(y, m, 1);
  return new Date(y, m, 1 + ((7 - d1.getDay()) % 7) + (n - 1) * 7);
};
function specialDates(year) {
  const thanksgiving = (() => {
    const d1 = new Date(year, 10, 1);
    return new Date(year, 10, 1 + ((4 - d1.getDay() + 7) % 7) + 21);
  })();
  return [
    { date: new Date(year, 1, 14), name: 'San Valentín', title: 'Se viene San Valentín 💘', body: 'Conjuntos, encaje y colores rojo y negro: lo más pedido para regalar.' },
    { date: new Date(year, 2, 8), name: 'Día de la Mujer', title: 'Feliz Día de la Mujer 💜', body: 'Para todas las que emprenden, venden y sostienen. ¡Gracias por elegirnos!' },
    { date: nthSunday(year, 5, 3), name: 'Día del Padre', title: 'Se viene el Día del Padre', body: 'Boxers, medias y pijamas: el regalo que nunca falla. Preparate con stock.' },
    { date: new Date(year, 6, 20), name: 'Día del Amigo', title: 'Feliz Día del Amigo 🤝', body: 'Gracias a todas las clientas que nos acompañan. ¡Las queremos!' },
    { date: nthSunday(year, 7, 3), name: 'Día de las Infancias', title: 'Se viene el Día de las Infancias', body: 'Ropa interior y pijamas para niños y niñas. Hacé tu pedido a tiempo.' },
    { date: new Date(year, 8, 21), name: 'Primavera', title: 'Llegó la primavera 🌸', body: 'Colores claros, algodón y prendas frescas para la nueva temporada.' },
    { date: nthSunday(year, 9, 3), name: 'Día de la Madre', title: 'Se viene el Día de la Madre 💐', body: 'Es la fecha que más vende en lencería. Armá tu pedido con tiempo.' },
    { date: new Date(thanksgiving.getFullYear(), 10, thanksgiving.getDate() + 1), name: 'Black Friday', title: 'Black Friday en ÚNICA 🖤', body: 'Aprovechá las ofertas mayoristas en la web.' },
    { date: new Date(year, 11, 25), name: 'Navidad', title: 'Se vienen las fiestas 🎄', body: 'Rojo, dorado y conjuntos para regalar: preparate para la temporada más fuerte del año.' },
    { date: new Date(year, 11, 31), name: 'Año Nuevo', title: '¡Feliz Año Nuevo! ✨', body: 'Gracias por un año increíble. Vamos por más en el que viene.' },
  ];
}
/** Próximas fechas (dentro de 40 días), la más cercana primero. */
function upcomingDates(now = new Date()) {
  const all = [...specialDates(now.getFullYear()), ...specialDates(now.getFullYear() + 1)];
  return all.filter((x) => x.date - now >= -86400000 && x.date - now <= 40 * 86400000).sort((a, b) => a.date - b.date);
}

/* ---------------------------------------------------------------- Ideas */

const TAGS = '#lenceriamayorista #lenceriapormayor #ropainteriormayorista #mayoristarosario #revendedoras #emprendedoras #lenceria #rosario';
const list = (items) => items.map((a) => `▪️ ${a.title} – ${formatPrice(salePrice(a))}`).join('\n');
const igLine = () => (d.state.contact?.instagramUser ? `@${d.state.contact.instagramUser}\n` : '');
const CLOSING = '🛍️ Precios mayoristas. Armá tu pedido desde la web (link en la bio) y te llega por WhatsApp.';

// Cada lámina sabe qué foto se puede cambiar: { blob, edit: 'bg' | id de artículo | null }
const art = (a) => (ui.overrides[a.id] ? { ...a, images: [ui.overrides[a.id]] } : a);
const productSlides = async (items) => Promise.all(items.map(async (a) => ({ blob: await drawPost(art(a), 'feed'), edit: a.id })));
const one = async (blob, edit = null) => ({ blob: await blob, edit });

const IDEAS = {
  novedades: {
    group: 'art',
    label: 'Carrusel: Nuevos ingresos',
    hint: 'Tapa con collage + una lámina por novedad + cierre. El formato más usado para mostrar lo nuevo.',
    n: 8,
    pool: () => newest(withPhoto().filter((a) => a.isNew)),
    build: async (items, r) => [
      await one(coverSlide({ kicker: 'Nuevos ingresos', title: 'Llegó lo nuevo', subtitle: `${items.length} artículos para tu negocio`, items: items.map(art), bg: r.bg }), 'bg'),
      ...(await productSlides(items)),
      await one(ctaSlide('¿Cuál vas a sumar a tu local?')),
    ],
    caption: (items) => `✨ NUEVOS INGRESOS ✨\nDeslizá y mirá todo lo que llegó 👉\n\n${list(items)}\n\n${CLOSING}\n📍 Showrooms en Rosario\n\n${igLine()}${TAGS}`,
  },
  ofertas: {
    group: 'art',
    label: 'Carrusel: Ofertas',
    hint: 'Ideal para empujar ventas: muestra el precio anterior tachado.',
    n: 8,
    pool: () => newest(withPhoto().filter(hasOffer)),
    build: async (items, r) => [
      await one(coverSlide({ kicker: 'Hasta agotar stock', title: 'Ofertas mayoristas', subtitle: 'Precios rebajados', items: items.map(art), bg: r.bg }), 'bg'),
      ...(await productSlides(items)),
      await one(ctaSlide('¡Aprovechá antes que se agoten!')),
    ],
    caption: (items) => `🔥 OFERTAS 🔥\nPrecios mayoristas rebajados, hasta agotar stock 👉\n\n${list(items)}\n\n${CLOSING}\n\n${igLine()}${TAGS} #ofertas`,
  },
  marca: {
    group: 'art',
    label: 'Carrusel: Una marca',
    hint: 'Presenta una marca con sus artículos.',
    needsBrand: true,
    n: 8,
    pool: () => newest(withPhoto().filter((a) => a.brand === ui.brand)),
    build: async (items, r) => [
      await one(coverSlide({ kicker: 'Marca destacada', title: ui.brand, subtitle: 'Ahora en ÚNICA Mayorista', items: items.map(art), bg: r.bg }), 'bg'),
      ...(await productSlides(items)),
      await one(ctaSlide(`Todo ${ui.brand} en la web`)),
    ],
    caption: (items) => `💗 ${ui.brand.toUpperCase()} en ÚNICA 💗\nDeslizá para ver los modelos 👉\n\n${list(items)}\n\n${CLOSING}\n\n${igLine()}#${plain(ui.brand)} ${TAGS}`,
  },
  revender: {
    group: 'art',
    label: 'Carrusel: ¿Querés empezar a revender?',
    hint: 'Educativo: de los que más se guardan y comparten. Atrae revendedoras nuevas.',
    n: 4,
    pool: () => [...withPhoto()].sort((x, y) => salePrice(x) - salePrice(y)),
    build: async (items, r) => [
      await one(coverSlide({ kicker: 'Guía para emprendedoras', title: '¿Querés vender lencería?', subtitle: 'Te contamos cómo arrancar 👉', items: items.map(art), bg: r.bg }), 'bg'),
      await one(textSlide({ number: 1, title: 'Elegí qué vender', body: 'Arrancá con lo que más rota: packs de bombachas, boxers, medias y conjuntos básicos. Se venden todo el año.' })),
      await one(textSlide({ number: 2, title: 'Comprá por mayor', body: 'Comprando al por mayor tenés margen para revender a precio de mercado y ganar en cada prenda.' })),
      await one(textSlide({ number: 3, title: 'Mostralo bien', body: 'Sacá fotos con luz natural, armá un catálogo en tus historias y usá estados de WhatsApp todos los días.' })),
      await one(textSlide({ number: 4, title: 'Reponé lo que se vende', body: 'Fijate qué te piden más y volvé a pedir eso. En ÚNICA tenés novedades seguido.' })),
      await one(collageSlide(items.map(art), { title: 'Para arrancar', kicker: 'Los más accesibles' })),
      await one(ctaSlide('Empezá hoy con ÚNICA')),
    ],
    caption: () =>
      `💼 ¿Querés empezar a vender lencería? Guardá este posteo 📌\n\n1️⃣ Elegí productos que roten todo el año\n2️⃣ Comprá por mayor para tener margen\n3️⃣ Mostralo bien en tus redes\n4️⃣ Reponé lo que más se vende\n\n${CLOSING}\n\n${igLine()}${TAGS} #emprendimiento #negociopropio`,
  },
  comprar: {
    group: 'art',
    label: 'Carrusel: Cómo comprar en la web',
    hint: 'Explica paso a paso cómo hacer un pedido. Sirve para fijar en el perfil.',
    n: 4,
    pool: () => newest(withPhoto()),
    build: async (items, r) => [
      await one(coverSlide({ kicker: 'Paso a paso', title: 'Cómo comprar en ÚNICA', subtitle: 'Fácil y desde el celular 👉', items: items.map(art), bg: r.bg }), 'bg'),
      await one(textSlide({ number: 1, title: 'Entrá a la web', body: `Tocá el link de la bio o entrá a ${WEB}. Vas a ver todo el catálogo con precios mayoristas.` })),
      await one(textSlide({ number: 2, title: 'Elegí tus artículos', body: 'Filtrá por categoría, marca o talle. En cada artículo elegís talles, colores y cantidad.' })),
      await one(textSlide({ number: 3, title: 'Completá tus datos', body: 'Tu WhatsApp, nombre y localidad. La próxima vez ya te aparecen solos.' })),
      await one(textSlide({ number: 4, title: 'Enviá el pedido', body: 'Te llega a nuestro WhatsApp con un código. Te confirmamos y coordinamos retiro o envío.', dark: true })),
      await one(ctaSlide('¡Hacé tu pedido ahora!')),
    ],
    caption: () =>
      `🛒 ¿Cómo comprar en ÚNICA? Te lo explicamos en 4 pasos 👉\n\n1️⃣ Entrá a la web (link en la bio)\n2️⃣ Elegí artículos, talles y colores\n3️⃣ Completá tus datos\n4️⃣ Enviá el pedido y te llega a nuestro WhatsApp\n\nRetiro en nuestros showrooms de Rosario o envío por expreso/comisionista.\n\n${igLine()}${TAGS}`,
  },
  collage: {
    group: 'art',
    label: 'Foto: Collage de novedades',
    hint: 'Una sola imagen con varias novedades y sus precios.',
    n: 9,
    pool: () => newest(withPhoto().filter((a) => a.isNew)),
    build: async (items) => [await one(collageSlide(items.map(art)))],
    caption: (items) => `✨ Novedades ✨\n\n${list(items)}\n\n${CLOSING}\n\n${igLine()}${TAGS}`,
  },
  elegir: {
    group: 'art',
    label: 'Foto: ¿1, 2 o 3? Elegí tu favorito',
    hint: 'Encuesta para que comenten: más comentarios = más alcance.',
    n: 3,
    exact: true, // la encuesta necesita 3 de la misma subcategoría
    pool: () => [...new Set([...newest(withPhoto().filter((a) => a.isNew)), ...newest(withPhoto())])],
    build: async (items) => [await one(pickSlide(items.map(art)))],
    caption: (items) =>
      `💗 ¿Cuál elegís? ${items.map((_, i) => `${i + 1}️⃣`).join(' ')}\nComentá el número de tu favorito 👇\n\n${items.map((a, i) => `${i + 1}. ${a.title} – ${formatPrice(salePrice(a))}`).join('\n')}\n\n🛍️ Todos disponibles en la web (link en la bio).\n\n${igLine()}${TAGS}`,
  },
};

// Las genéricas: una idea por cada tema del banco de textos, más las fechas especiales.
for (const [key, topic] of Object.entries(BANK)) {
  IDEAS[key] = {
    group: 'gen',
    label: `Foto: ${topic.label}`,
    hint: 'Foto con texto, sin artículos. Elegí el fondo o subí una foto tuya; el texto se puede editar.',
    generic: true,
    pickText: () => {
      const [title, body] = topic.posts[ui.seed % topic.posts.length];
      return { kicker: topic.kicker, title, body };
    },
    caption: (t) => `${t.title}\n${t.body ? `${t.body}\n` : ''}\n💗 ÚNICA Lencería Mayorista · Rosario\n🔗 Link en la bio\n\n${igLine()}${topic.tags} ${TAGS}`,
  };
}
IDEAS.fecha = {
  group: 'gen',
  label: 'Foto: Fecha especial que se viene',
  hint: 'Toma sola la próxima fecha (Navidad, Día de la Madre, San Valentín…). "Cambiar" pasa a la siguiente.',
  generic: true,
  pickText: () => {
    const dates = upcomingDates();
    const x = dates.length ? dates[ui.seed % dates.length] : specialDates(new Date().getFullYear() + 1)[0];
    return { kicker: x.name, title: x.title, body: x.body };
  },
  caption: (t) => `${t.title}\n${t.body}\n\n${CLOSING}\n\n${igLine()}#${plain(t.kicker)} ${TAGS}`,
};

/* ---------------------------------------------------------------- Elección por subcategoría */
// Para que la publicación tenga sentido, los artículos salen de una misma subcategoría
// (3 conjuntos, 3 boxers, 3 packs…). "Cambiar artículos" pasa a otra subcategoría.

function subName(id) {
  const sub = d.state.subcategories.find((x) => x.id === id);
  const cat = sub && d.state.categories.find((c) => c.id === sub.categoryId);
  return sub ? `${cat ? `${cat.name} › ` : ''}${sub.name}` : '';
}

function bySub(pool) {
  const map = new Map();
  for (const a of pool) for (const id of subIdsOf(a)) map.set(id, [...(map.get(id) || []), a]);
  return map;
}

/** Subcategorías con artículos para esta idea, la que más tiene primero. */
function subOptions(idea) {
  return [...bySub(idea.pool())].filter(([id]) => subName(id)).sort((a, b) => b[1].length - a[1].length);
}

function smartPick(idea) {
  const pool = idea.pool();
  if (ui.sub === 'all') return { sub: null, items: rotate(pool, idea.n) };
  const groups = bySub(pool);
  if (ui.sub !== 'auto') return { sub: ui.sub, items: rotate(groups.get(ui.sub) || [], idea.n) };
  const need = idea.exact ? idea.n : Math.min(idea.n, 3);
  const ok = [...groups].filter(([id, list]) => subName(id) && list.length >= need).sort((a, b) => b[1].length - a[1].length);
  if (!ok.length) return { sub: null, items: idea.exact ? [] : rotate(pool, idea.n) };
  const [sub, list] = ok[ui.seed % ok.length];
  return { sub, items: list.slice(0, idea.n) };
}

/** Artículos con los que se puede reemplazar uno de la publicación (misma subcategoría). */
function swapOptions(r) {
  const all = withPhoto();
  return r.sub ? all.filter((a) => subIdsOf(a).includes(r.sub)) : all;
}

/* ---------------------------------------------------------------- Reels */

const REEL_HINT = 'Video vertical de ~20 s con música propia (sin derechos de autor). Si querés, en Instagram podés cambiarla por un audio en tendencia.';
const reelIdea = (kind, label, extra) => ({ group: 'reel', reel: kind, label: `Reel: ${label}`, hint: REEL_HINT, ...extra });
Object.assign(IDEAS, {
  reel_novedades: reelIdea('novedades', 'Nuevos ingresos', {
    n: 4,
    pool: () => newest(withPhoto().filter((a) => a.isNew)),
    caption: (items) => `✨ Llegó lo nuevo a ÚNICA ✨\n\n${list(items)}\n\n${CLOSING}\n\n${igLine()}${TAGS} #reels`,
  }),
  reel_web: reelIdea('web', 'Así comprás en la web', {
    n: 6,
    pool: () => newest(withPhoto()),
    caption: () => `🛍️ ¿Ya compraste en nuestra web? Es así de fácil:\n\n1️⃣ Entrá y mirá el catálogo\n2️⃣ Elegí talles, colores y cantidad\n3️⃣ Enviá el pedido por WhatsApp\n\n🔗 Link en la bio · ${WEB}\n\n${igLine()}${TAGS} #reels`,
  }),
  reel_pov: reelIdea('pov', 'POV: te llegó tu pedido', {
    n: 6,
    pool: () => newest(withPhoto()),
    caption: (items) => `📦 POV: te llegó tu pedido de ÚNICA\n\n${list(items)}\n\n${CLOSING}\n\n${igLine()}${TAGS} #pov #reels`,
  }),
  reel_elegir: reelIdea('elegir', '¿Cuál te llevás? 1, 2 o 3', {
    n: 3,
    exact: true,
    pool: () => [...new Set([...newest(withPhoto().filter((a) => a.isNew)), ...newest(withPhoto())])],
    caption: (items) => `💗 ¿Cuál te llevás? Comentá 1, 2 o 3 👇\n\n${items.map((a, i) => `${i + 1}. ${a.title} – ${formatPrice(salePrice(a))}`).join('\n')}\n\n🛍️ Todos en la web (link en la bio).\n\n${igLine()}${TAGS} #reels`,
  }),
  reel_tips_venta: reelIdea('tips', '3 tips para vender más', {
    tips: 'venta',
    tipsTitle: '3 tips para vender más lencería',
    caption: (_, x) => `💼 ${x.title} 📌 Guardalo\n\n${x.tips.map(([t], i) => `${i + 1}️⃣ ${t}`).join('\n')}\n\n💗 ÚNICA Lencería Mayorista · link en la bio\n\n${igLine()}#tipsdeventa #revendedoras ${TAGS} #reels`,
  }),
  reel_tips_cuidado: reelIdea('tips', '3 tips de cuidado', {
    tips: 'cuidado',
    tipsTitle: '3 tips para que tu lencería dure más',
    caption: (_, x) => `🧺 ${x.title} 📌 Guardalo\n\n${x.tips.map(([t], i) => `${i + 1}️⃣ ${t}`).join('\n')}\n\n💗 ÚNICA Lencería Mayorista · link en la bio\n\n${igLine()}#cuidadodelalenceria ${TAGS} #reels`,
  }),
});

/** 3 tips seguidos del banco, distintos cada semana o con "Otro". */
function pickTips(topic) {
  const posts = BANK[topic].posts;
  const start = (ui.seed * 3) % posts.length;
  return [0, 1, 2].map((i) => posts[(start + i) % posts.length]);
}

/* ---------------------------------------------------------------- Armado */

async function buildResult(r) {
  const idea = IDEAS[r.idea];
  if (idea.reel) {
    r.reel = await buildReel(idea.reel, (r.items || []).map(art), r.extra);
    r.slides = [];
    r.caption = idea.caption(r.items || [], r.extra);
    return r;
  }
  if (idea.generic) {
    r.slides = [{ blob: await genericSlide(r.text, r.bg ? { photo: r.bg } : r.bgChoice), edit: 'bg' }];
    r.caption = idea.caption(r.text);
  } else {
    r.slides = await idea.build(r.items, r);
    r.caption = idea.caption(r.items);
  }
  return r;
}

function bgChoice() {
  if (ui.bgMode === 'articulo') {
    const pics = withPhoto();
    const a = pics.length ? pics[ui.seed % pics.length] : null;
    return a ? { photo: a.images[0] } : { palette: 0 };
  }
  return { palette: Number(ui.bgMode) || 0 };
}

/** Arma una idea; devuelve null si no hay artículos para ella. */
async function makeResult(key, day = '') {
  const idea = IDEAS[key];
  const r = { idea: key, day, title: idea.label.replace(/^(Carrusel|Foto): /, ''), bg: null };
  if (idea.tips) {
    r.extra = { title: idea.tipsTitle, tips: pickTips(idea.tips) };
  } else if (idea.generic) {
    r.text = idea.pickText();
    r.bgChoice = bgChoice();
  } else {
    const { sub, items } = smartPick(idea);
    r.sub = sub;
    r.items = items;
    if (!r.items.length) return null;
    if (sub) r.title += ` · ${subName(sub)}`;
  }
  return buildResult(r);
}

/** Plan de la semana: lunes artículos, miércoles genérica, viernes venta/encuesta. Cambia cada semana. */
async function weeklyPlan() {
  const week = Math.floor((Date.now() - new Date(2026, 0, 5)) / (7 * 86400000)) + ui.seed;
  const generic = upcomingDates().length && week % 2 === 0 ? 'fecha' : ['frase', 'venta', 'cuidado', 'sabias'][week % 4];
  const friday = ['ofertas', 'elegir', 'revender', 'collage', 'comprar'][week % 5];
  const saved = ui.seed;
  const savedSub = ui.sub;
  ui.seed = week; // los textos y artículos también rotan por semana
  ui.sub = 'auto';
  const out = [];
  for (const [day, keys] of [
    ['Lunes', ['novedades', 'collage', 'elegir']],
    ['Martes', [['reel_novedades', 'reel_web', 'reel_pov'][week % 3], 'reel_web', 'reel_tips_venta']],
    ['Miércoles', [generic]],
    ['Jueves', [['reel_elegir', 'reel_tips_venta', 'reel_tips_cuidado'][week % 3], 'reel_tips_cuidado']],
    ['Viernes', [friday, 'elegir', 'revender']],
  ]) {
    for (const k of keys) {
      const r = await makeResult(k, day);
      if (r) {
        out.push(r);
        break;
      }
    }
  }
  ui.seed = saved;
  ui.sub = savedSub;
  return out;
}

/* ---------------------------------------------------------------- Pantalla */

const btnCls = 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold';
const chip = (k, v) =>
  `<button type="button" data-idea="${k}" aria-pressed="${k === ui.idea}" class="px-3.5 py-2 rounded-full text-xs font-bold bg-surface-container-high aria-pressed:bg-primary aria-pressed:text-on-primary">${esc(v.label)}</button>`;

export function renderIdeas() {
  const box = $('#ideasPanel');
  if (!box || !d) return;
  const brands = brandsWithStock();
  if (!ui.brand && brands.length) ui.brand = brands[0][0];
  const idea = IDEAS[ui.idea];
  const group = (g) => Object.entries(IDEAS).filter(([, v]) => v.group === g).map(([k, v]) => chip(k, v)).join('');
  box.innerHTML = `
  <div class="flex flex-wrap gap-2" role="group" aria-label="Plan">
    <button type="button" data-idea="plan" aria-pressed="${ui.idea === 'plan'}" class="px-4 py-2.5 rounded-full text-sm font-bold bg-surface-container-high aria-pressed:bg-primary aria-pressed:text-on-primary">📅 Plan de la semana (3 fotos + 2 reels)</button>
  </div>
  <p class="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Con tus artículos</p>
  <div class="flex flex-wrap gap-2" role="group" aria-label="Ideas con artículos">${group('art')}</div>
  <p class="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Reels (~20 segundos)</p>
  <div class="flex flex-wrap gap-2" role="group" aria-label="Reels">${group('reel')}</div>
  <p class="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Fotos genéricas (sin artículos)</p>
  <div class="flex flex-wrap gap-2" role="group" aria-label="Ideas genéricas">${group('gen')}</div>
  <p class="mt-4 text-sm text-on-surface-variant">${esc(ui.idea === 'plan' ? 'Arma la semana completa: lunes foto de novedades, martes reel, miércoles foto genérica, jueves reel y viernes ofertas o encuesta. Cada semana cambia sola.' : idea.hint)}</p>
  <div class="mt-3 flex flex-wrap items-center gap-2">
    ${
      idea && !idea.generic && !idea.tips
        ? `<select id="ideaSub" aria-label="Subcategoría" class="bg-surface-container-low px-3 py-2 pr-8 rounded-xl text-sm border-none focus:ring-2 focus:ring-primary font-medium max-w-full">
            <option value="auto"${ui.sub === 'auto' ? ' selected' : ''}>Subcategoría: automática (todas del mismo tipo)</option>
            <option value="all"${ui.sub === 'all' ? ' selected' : ''}>Mezclar subcategorías</option>
            ${subOptions(idea).map(([id, list]) => `<option value="${esc(id)}"${id === ui.sub ? ' selected' : ''}>${esc(subName(id))} (${list.length})</option>`).join('')}
          </select>`
        : ''
    }
    ${idea?.needsBrand ? `<select id="ideaBrand" aria-label="Marca" class="bg-surface-container-low px-3 py-2 pr-8 rounded-xl text-sm border-none focus:ring-2 focus:ring-primary font-medium">${brands.map(([b, n]) => `<option value="${esc(b)}"${b === ui.brand ? ' selected' : ''}>${esc(b)} (${n})</option>`).join('')}</select>` : ''}
    ${
      idea?.generic || ui.idea === 'plan'
        ? `<select id="ideaBg" aria-label="Fondo de las fotos genéricas" class="bg-surface-container-low px-3 py-2 pr-8 rounded-xl text-sm border-none focus:ring-2 focus:ring-primary font-medium">
            ${[['0', 'Fondo: rosa con puntilla'], ['1', 'Fondo: bordó con puntilla'], ['2', 'Fondo: nude con puntilla'], ['articulo', 'Fondo: foto de un artículo']]
              .map(([v, t]) => `<option value="${v}"${v === ui.bgMode ? ' selected' : ''}>${t}</option>`)
              .join('')}
          </select>`
        : ''
    }
    ${
      idea?.reel || ui.idea === 'plan'
        ? `<select id="ideaMusic" aria-label="Música de los reels" class="bg-surface-container-low px-3 py-2 pr-8 rounded-xl text-sm border-none focus:ring-2 focus:ring-primary font-medium">
            ${[['alegre', '🎵 Música: alegre'], ['suave', '🎵 Música: suave'], ['archivo', ui.musicName ? `🎵 Mi audio: ${ui.musicName}` : '🎵 Subir mi audio…'], ['ninguna', '🔇 Sin música']]
              .map(([v, t]) => `<option value="${v}"${v === ui.music ? ' selected' : ''}>${esc(t)}</option>`)
              .join('')}
          </select>
          <input type="file" id="musicInput" accept="audio/*" class="hidden">`
        : ''
    }
    <button type="button" data-idea-action="build" class="${btnCls} bg-primary text-on-primary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">auto_awesome</span><span>Armar</span></button>
    <button type="button" data-idea-action="shuffle" class="${btnCls} bg-surface-container-high"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">shuffle</span><span>${idea?.generic || idea?.tips ? 'Otro texto' : ui.idea === 'plan' ? 'Otra semana' : 'Cambiar artículos'}</span></button>
  </div>
  <input type="file" id="ideaPhotoInput" accept="image/*" class="hidden">
  <div id="ideaResult" class="mt-5 flex flex-col gap-6"></div>`;
  renderResults();
}

function renderResults() {
  const out = $('#ideaResult');
  if (!out) return;
  setTimeout(playReels, 0);
  out.innerHTML = ui.results
    .map((r, ri) => {
      const urls = r.slides.map((s) => URL.createObjectURL(s.blob));
      const reel = !!r.reel;
      const editable = IDEAS[r.idea].generic;
      return `<div data-result="${ri}" class="p-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40">
  <p class="mb-2 font-bold text-sm">${r.day ? `<span class="text-primary">${esc(r.day)}</span> · ` : ''}${esc(r.title)}</p>
  ${
    reel
      ? `<div class="flex flex-col items-start gap-1"><canvas data-reel="${ri}" width="360" height="640" class="h-80 sm:h-96 aspect-[9/16] rounded-xl shadow-sm border border-outline-variant/30 bg-black"></canvas>
      <span class="text-xs text-on-surface-variant">Vista previa · ${Math.round(r.reel.duration)} segundos · ${esc(musicLabel())}</span>
      <button type="button" data-idea-action="listen" class="${btnCls} bg-surface-container-high"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">volume_up</span><span>Ver con sonido</span></button></div>`
      : ''
  }
  <div class="flex gap-3 overflow-x-auto pb-2 snap-x${reel ? ' hidden' : ''}">
    ${urls
      .map(
        (u, i) => `<figure class="shrink-0 snap-start flex flex-col items-center gap-1.5">
        <img src="${u}" alt="Lámina ${i + 1} de ${urls.length}" class="h-72 sm:h-80 aspect-[4/5] object-cover rounded-xl shadow-sm border border-outline-variant/30">
        ${r.slides[i].edit ? `<button type="button" data-change-photo="${i}" class="text-xs font-bold text-primary hover:underline">📷 Cambiar foto</button>` : '<span class="text-xs text-transparent">.</span>'}
      </figure>`
      )
      .join('')}
  </div>
  ${
    editable
      ? `<div class="mt-2 grid gap-2 sm:grid-cols-2">
      <label class="text-xs font-semibold">Título<textarea data-text="title" rows="2" maxlength="120" class="mt-1 w-full rounded-xl bg-surface-container-lowest border-none text-sm">${esc(r.text.title)}</textarea></label>
      <label class="text-xs font-semibold">Texto chico<textarea data-text="body" rows="2" maxlength="200" class="mt-1 w-full rounded-xl bg-surface-container-lowest border-none text-sm">${esc(r.text.body)}</textarea></label>
    </div>`
      : ''
  }
  ${
    r.items
      ? `<div class="mt-2">
      <p class="text-xs font-bold text-on-surface-variant mb-1">Artículos de esta publicación${r.sub ? ` (de ${esc(subName(r.sub))})` : ''}: cambiá el que quieras</p>
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">${r.items
        .map((a, i) => {
          const opts = swapOptions(r);
          if (!opts.includes(a)) opts.unshift(a);
          return `<label class="text-xs font-semibold flex items-center gap-2"><span class="w-5 text-primary">${i + 1}.</span><select data-swap="${i}" class="flex-1 min-w-0 bg-surface-container-lowest px-2 py-1.5 pr-7 rounded-lg text-xs border-none focus:ring-2 focus:ring-primary">${opts
            .slice(0, 150)
            .map((o) => `<option value="${esc(o.id)}"${o.id === a.id ? ' selected' : ''}>${esc(`${o.brand ? `${o.brand} · ` : ''}${o.title}`)}</option>`)
            .join('')}</select></label>`;
        })
        .join('')}</div>
    </div>`
      : ''
  }
  <div class="mt-3 flex flex-wrap gap-2">
    <button type="button" data-idea-action="share" class="${btnCls} bg-primary text-on-primary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">ios_share</span><span>Compartir en Instagram</span></button>
    <button type="button" data-idea-action="download" class="${btnCls} bg-surface-container-high"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">download</span><span>Descargar ${reel ? 'video' : urls.length === 1 ? 'imagen' : `${urls.length} imágenes`}</span></button>
    <button type="button" data-idea-action="copy" class="${btnCls} bg-surface-container-high"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">content_copy</span><span>Copiar texto</span></button>
  </div>
  <details class="mt-2"><summary class="cursor-pointer text-xs font-bold text-on-surface-variant">Ver texto de la publicación</summary>
    <textarea readonly rows="8" class="mt-2 w-full rounded-xl bg-surface-container-lowest border-none text-sm" aria-label="Texto de la publicación">${esc(r.caption)}</textarea>
  </details>
</div>`;
    })
    .join('');
}

const musicOpt = () => ({ kind: ui.music, file: ui.musicFile });
const musicLabel = () => (ui.music === 'ninguna' ? 'sin música' : ui.music === 'archivo' ? `con tu audio${ui.musicName ? ` (${ui.musicName})` : ''}` : `con música ${ui.music}`);
let stopPreview = null;

let playing = 0;
function playReels() {
  cancelAnimationFrame(playing);
  const t0 = performance.now();
  const loop = () => {
    const canvases = [...document.querySelectorAll('[data-reel]')];
    if (!canvases.length) return;
    const t = (performance.now() - t0) / 1000;
    for (const c of canvases) {
      const r = ui.results[Number(c.dataset.reel)];
      if (!r?.reel) continue;
      const ctx = c.getContext('2d');
      ctx.setTransform(c.width / 1080, 0, 0, c.width / 1080, 0, 0);
      r.reel.draw(ctx, t % (r.reel.duration + 1));
    }
    playing = requestAnimationFrame(loop);
  };
  loop();
}

/** Graba el video (tarda lo mismo que dura) y lo comparte o lo descarga. */
async function deliverReel(r, button, action) {
  const label = button.lastElementChild;
  const original = label.textContent;
  button.disabled = true;
  try {
    if (!r.video) {
      r.video = await recordReel(r.reel, (p) => (label.textContent = `Grabando… ${Math.round(p * 100)}%`), musicOpt());
    }
    if (r.video.type !== 'video/mp4') d.showToast('Tu navegador grabó en formato WebM: si Instagram no lo toma, hacelo desde el celular o con Chrome actualizado.', 'error');
    const copied = await copyText(r.caption);
    if (action === 'share' && navigator.canShare?.({ files: [r.video] })) {
      try {
        await navigator.share({ files: [r.video] });
        if (copied) d.showToast('Texto copiado: en Instagram mantené apretado y tocá Pegar.');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    download(r.video, r.video.name);
    d.showToast(copied ? 'Video descargado y texto copiado.' : 'Video descargado.');
  } catch (err) {
    d.showToast(err.message || 'No se pudo grabar el video.', 'error');
  } finally {
    label.textContent = original;
    button.disabled = false;
  }
}

async function build(button) {
  const label = button?.lastElementChild;
  const original = label?.textContent;
  if (label) label.textContent = 'Armando…';
  if (button) button.disabled = true;
  try {
    if (ui.idea === 'plan') {
      ui.results = await weeklyPlan();
    } else {
      const r = await makeResult(ui.idea);
      if (!r) {
        d.showToast(ui.idea === 'ofertas' ? 'No hay artículos en oferta con foto.' : 'No hay artículos con foto para esta idea (¿marcaste novedades?).', 'error');
        return;
      }
      ui.results = [r];
    }
    renderResults();
  } catch (err) {
    d.showToast(err.message || 'No se pudo armar.', 'error');
  } finally {
    if (label) label.textContent = original;
    if (button) button.disabled = false;
  }
}

const filesOf = (r) => r.slides.map((s, i) => new File([s.blob], `unica-${r.idea}-${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }));

async function share(r) {
  const list = filesOf(r);
  const copied = await copyText(r.caption);
  if (navigator.canShare?.({ files: list })) {
    try {
      await navigator.share({ files: list });
      if (copied) d.showToast('Texto copiado: en Instagram mantené apretado y tocá Pegar.');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  saveAll(r);
  d.showToast(copied ? 'Imágenes descargadas y texto copiado.' : 'Imágenes descargadas.');
}

function saveAll(r) {
  filesOf(r).forEach((f, i) => setTimeout(() => download(f, f.name), i * 350));
}

let pendingPhoto = null; // { ri, si } de la lámina a la que se le cambia la foto

export function initIdeas(deps) {
  d = deps;
  const panel = $('#ideasPanel');
  panel.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-idea]');
    if (pick) {
      ui.idea = pick.dataset.idea;
      ui.seed = 0;
      ui.sub = 'auto';
      ui.results = [];
      renderIdeas();
      return;
    }
    const change = e.target.closest('[data-change-photo]');
    if (change) {
      pendingPhoto = { ri: Number(change.closest('[data-result]').dataset.result), si: Number(change.dataset.changePhoto) };
      $('#ideaPhotoInput').value = '';
      $('#ideaPhotoInput').click();
      return;
    }
    const b = e.target.closest('[data-idea-action]');
    if (!b) return;
    const action = b.dataset.ideaAction;
    const r = ui.results[Number(b.closest('[data-result]')?.dataset.result)];
    if (action === 'build') build(b);
    if (action === 'shuffle') {
      ui.seed++;
      build($('[data-idea-action="build"]'));
    }
    if (r?.reel && action === 'listen') {
      stopPreview?.();
      playReels();
      previewMusic(musicOpt(), r.reel.duration).then((stop) => (stopPreview = stop)).catch(() => d.showToast('No se pudo reproducir el audio.', 'error'));
      return;
    }
    if (r?.reel && (action === 'share' || action === 'download')) return deliverReel(r, b, action);
    if (action === 'share' && r) share(r);
    if (action === 'download' && r) saveAll(r);
    if (action === 'copy' && r) copyText(r.caption).then((ok) => d.showToast(ok ? 'Texto copiado.' : 'No se pudo copiar.', ok ? 'ok' : 'error'));
  });
  panel.addEventListener('change', async (e) => {
    if (e.target.id === 'ideaMusic') {
      if (e.target.value === 'archivo' && !ui.musicFile) {
        e.target.value = ui.music;
        $('#musicInput').click();
        return;
      }
      ui.music = e.target.value;
      ui.results.forEach((x) => (x.video = null));
      renderResults();
      return;
    }
    if (e.target.id === 'musicInput' && e.target.files[0]) {
      const f = e.target.files[0];
      if (f.size > 15 * 1024 * 1024) return d.showToast('El audio pesa más de 15 MB: elegí uno más corto.', 'error');
      ui.musicFile = await f.arrayBuffer();
      ui.musicName = f.name.replace(/\.[^.]+$/, '').slice(0, 30);
      ui.music = 'archivo';
      ui.results.forEach((x) => (x.video = null));
      renderIdeas();
      d.showToast('Audio cargado: se usa en los reels.');
      return;
    }
    if (e.target.id === 'ideaSub') {
      ui.sub = e.target.value;
      ui.seed = 0;
      build($('[data-idea-action="build"]'));
    }
    const swap = e.target.closest('[data-swap]');
    if (swap) {
      const r = ui.results[Number(swap.closest('[data-result]').dataset.result)];
      const a = d.state.articles.find((x) => x.id === swap.value);
      if (r && a) {
        r.items[Number(swap.dataset.swap)] = a;
        r.video = null;
        await buildResult(r);
        renderResults();
      }
      return;
    }
    if (e.target.id === 'ideaBrand') {
      ui.brand = e.target.value;
      ui.seed = 0;
      build($('[data-idea-action="build"]'));
    }
    if (e.target.id === 'ideaBg') {
      ui.bgMode = e.target.value;
      if (ui.results.length) build($('[data-idea-action="build"]'));
    }
    if (e.target.id === 'ideaPhotoInput' && pendingPhoto && e.target.files[0]) {
      const r = ui.results[pendingPhoto.ri];
      const slide = r?.slides[pendingPhoto.si];
      if (!slide) return;
      const url = URL.createObjectURL(e.target.files[0]);
      if (slide.edit === 'bg') r.bg = url;
      else ui.overrides[slide.edit] = url; // vale para esta sesión: el artículo de la web no cambia
      await buildResult(r);
      renderResults();
      d.showToast('Foto cambiada.');
    }
    // Texto editado de una foto genérica
    const field = e.target.closest('[data-text]');
    if (field) {
      const r = ui.results[Number(field.closest('[data-result]').dataset.result)];
      r.text = { ...r.text, [field.dataset.text]: field.value.trim() };
      await buildResult(r);
      renderResults();
    }
  });
}
