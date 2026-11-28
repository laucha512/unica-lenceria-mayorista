// Reels: videos verticales de ~20 segundos, dibujados y grabados en el navegador (no gastan nada del servidor).
// Cada reel es una secuencia de escenas; los textos quedan en pantalla al menos 3 segundos para que se lean.
// Sin música a propósito: se le agrega un audio en tendencia desde Instagram.
import { formatPrice, SITE_URL } from '../config.js';
import { hasOffer, regularPrice, salePrice } from '../shared/prices.js';
import { loadImage, roundRect, wrap } from './social.js';

const W = 1080;
const H = 1920;
const PINK = '#be185d';
const DEEP = '#831843';
const DARK = '#1e293b';
const SOFT = '#fdf2f8';
const WA = '#16a34a';
const SANS = '"Plus Jakarta Sans", sans-serif';
const SERIF = '"Playfair Display", serif';
const WEB = SITE_URL.replace(/^https?:\/\//, '');

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const appear = (t, start, dur = 0.5) => ease((t - start) / dur);

/* ---------------------------------------------------------------- Dibujo */

function cover(ctx, img, x, y, w, h, zoom = 1) {
  if (!img) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
    return;
  }
  const s = Math.max(w / img.width, h / img.height) * zoom;
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function clipRound(ctx, x, y, w, h, r, fn) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  fn();
  ctx.restore();
}

function gradientBg(ctx, dark = true) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, dark ? DEEP : SOFT);
  g.addColorStop(1, dark ? PINK : '#fbcfe8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(190,24,93,0.06)';
  for (let i = 0; i < 46; i++) {
    ctx.beginPath();
    ctx.arc((i * 263) % W, (i * 397) % H, 12 + (i % 4) * 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function text(ctx, str, x, y, { size = 60, font = SANS, weight = 700, color = '#fff', align = 'center', maxW = W - 160, lh = 1.18, maxLines = 4, alpha = 1, dy = 0 } = {}) {
  if (alpha <= 0) return y;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  for (const l of wrap(ctx, str, maxW, maxLines)) {
    ctx.fillText(l, x, y + dy);
    y += size * lh;
  }
  ctx.restore();
  return y;
}

function pill(ctx, str, cx, y, { bg = PINK, fg = '#fff', size = 40, alpha = 1 } = {}) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `800 ${size}px ${SANS}`;
  const w = ctx.measureText(str).width + size * 1.6;
  const h = size * 2;
  ctx.fillStyle = bg;
  roundRect(ctx, cx - w / 2, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, cx, y + h / 2 + 2);
  ctx.restore();
}

function logo(ctx, img, cx, cy, size, alpha = 1) {
  if (!img || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 8, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.clip();
  cover(ctx, img, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}

/** Oscurece abajo para que el texto se lea sobre la foto. */
function shade(ctx, from = 0.45) {
  const g = ctx.createLinearGradient(0, H * from, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(40,4,20,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H * from, W, H * (1 - from));
}

/* ---------------------------------------------------------------- Escenas comunes */

/** Une escenas con un fundido corto entre una y otra. */
function sequence(scenes) {
  const duration = scenes.reduce((s, x) => s + x.dur, 0);
  const FADE = 0.4;
  const sfx = [];
  let start = 0;
  scenes.forEach((sc, i) => {
    if (i > 0) sfx.push([start, 'whoosh']);
    for (const [t, kind] of sc.sfx || []) sfx.push([start + t, kind]);
    start += sc.dur;
  });
  return {
    duration,
    sfx,
    draw(ctx, time) {
      let acc = 0;
      for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i];
        if (time < acc + sc.dur || i === scenes.length - 1) {
          const t = clamp(time - acc, 0, sc.dur);
          sc.draw(ctx, t, sc.dur);
          if (i > 0 && t < FADE) {
            ctx.save();
            ctx.globalAlpha = 1 - t / FADE;
            scenes[i - 1].draw(ctx, scenes[i - 1].dur, scenes[i - 1].dur);
            ctx.restore();
          }
          return;
        }
        acc += sc.dur;
      }
    },
  };
}

const ctaScene = (A, title = 'Pedí por mayor desde la web') => ({
  dur: 3.6,
  sfx: [[0.2, 'rise'], [1, 'bling']],
  draw(ctx, t) {
    gradientBg(ctx, true);
    const s = 0.85 + 0.15 * appear(t, 0, 0.6);
    logo(ctx, A.logo, W / 2, 560, 240 * s);
    text(ctx, title, W / 2, 860, { size: 84, font: SERIF, alpha: appear(t, 0.2), dy: 30 * (1 - appear(t, 0.2)) });
    text(ctx, 'Elegís, armás tu pedido y nos llega por WhatsApp', W / 2, 1120, { size: 46, weight: 500, color: '#fce7f3', alpha: appear(t, 0.6) });
    pill(ctx, 'Link en la bio 👆', W / 2, 1330, { bg: '#fff', fg: PINK, size: 48, alpha: appear(t, 1) });
    text(ctx, WEB, W / 2, 1600, { size: 38, color: '#fbcfe8', alpha: appear(t, 1.2) });
  },
});

/** Lámina de un artículo a pantalla completa: zoom lento + tarjeta con precio. */
const productScene = (A, a, img, { index, total, badge, dur = 3.5 }) => ({
  dur,
  sfx: [[0.35, 'pop'], [0.8, 'ding']],
  draw(ctx, t, d) {
    cover(ctx, img, 0, 0, W, H, 1 + 0.1 * (t / d));
    shade(ctx, 0.5);
    if (badge) pill(ctx, badge, 200, 120, { size: 40, alpha: appear(t, 0.1) });
    if (total) text(ctx, `${index}/${total}`, W - 90, 175, { size: 44, align: 'right', alpha: appear(t, 0.1) });
    const up = appear(t, 0.3, 0.6);
    const y = 1330 + 120 * (1 - up);
    ctx.save();
    ctx.globalAlpha = up;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    roundRect(ctx, 60, y, W - 120, 470, 40);
    ctx.fill();
    ctx.restore();
    text(ctx, `${(a.brand || '').toUpperCase()}${a.code ? `  ·  ART. ${a.code}` : ''}`, 110, y + 85, { size: 36, color: PINK, align: 'left', alpha: up });
    text(ctx, a.title, 110, y + 170, { size: 56, font: SERIF, color: DARK, align: 'left', maxW: W - 220, maxLines: 2, alpha: up });
    const priceY = y + 400;
    text(ctx, formatPrice(salePrice(a)), 110, priceY, { size: 88, weight: 800, color: PINK, align: 'left', alpha: appear(t, 0.8) });
    if (hasOffer(a)) {
      ctx.save();
      ctx.globalAlpha = appear(t, 0.8);
      ctx.font = `800 88px ${SANS}`;
      const pw = ctx.measureText(formatPrice(salePrice(a))).width;
      ctx.font = `600 48px ${SANS}`;
      ctx.fillStyle = '#64748b';
      const old = formatPrice(regularPrice(a));
      ctx.fillText(old, 140 + pw, priceY);
      ctx.fillRect(140 + pw, priceY - 16, ctx.measureText(old).width, 5);
      ctx.restore();
    }
  },
});

/* ---------------------------------------------------------------- Celular dibujado (reel de la web) */

const PHONE = { x: 230, y: 560, w: 620, h: 1250, r: 70 };

function phone(ctx, drawScreen) {
  const { x, y, w, h, r } = PHONE;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 60;
  ctx.fillStyle = '#111827';
  roundRect(ctx, x - 22, y - 22, w + 44, h + 44, r + 20);
  ctx.fill();
  ctx.restore();
  clipRound(ctx, x, y, w, h, r, () => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
    drawScreen(x, y, w, h);
  });
  ctx.fillStyle = '#111827';
  roundRect(ctx, x + w / 2 - 90, y + 14, 180, 40, 20);
  ctx.fill();
}

function storeHeader(ctx, A, x, y, w) {
  ctx.fillStyle = '#fdf2f8';
  ctx.fillRect(x, y, w, 170);
  logo(ctx, A.logo, x + 80, y + 105, 70);
  text(ctx, 'ÚNICA', x + 135, y + 122, { size: 40, font: SERIF, color: DARK, align: 'left' });
  ctx.fillStyle = PINK;
  roundRect(ctx, x + w - 120, y + 75, 80, 60, 30);
  ctx.fill();
}

/**
 * Dedito que se mueve rápido entre toques. taps: [[segundo, x, y], ...]; rest: dónde arranca.
 * En cada toque se achica un instante y deja una onda (el sonido lo pone la escena).
 */
function finger(ctx, t, taps, rest) {
  let [x, y] = rest;
  let prev = rest;
  for (const [tt, tx, ty] of taps) {
    if (t >= tt) {
      prev = [tx, ty];
      [x, y] = prev;
      continue;
    }
    const k = ease((t - (tt - 0.3)) / 0.3);
    x = prev[0] + (tx - prev[0]) * k;
    y = prev[1] + (ty - prev[1]) * k;
    break;
  }
  // Después del último toque, el dedito se corre para que se lea lo que cambió
  const last = taps[taps.length - 1];
  if (last && t > last[0] + 0.35) {
    const k = ease((t - last[0] - 0.35) / 0.35);
    x = last[1] + (W - 60 - last[1]) * k;
    y = last[2] + (H + 80 - last[2]) * k;
  }
  for (const [tt, tx, ty] of taps) {
    const p = (t - tt) / 0.45;
    if (p < 0 || p >= 1) continue;
    ctx.save();
    ctx.globalAlpha = 0.6 * (1 - p);
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(tx, ty, 30 + 70 * p, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const pressed = taps.some(([tt]) => t >= tt && t < tt + 0.14);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x, y, pressed ? 30 : 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/* ---------------------------------------------------------------- Reels */

async function assets(items) {
  const [logoImg, ...imgs] = await Promise.all([
    loadImage('/img/logo-unica.webp').catch(() => null),
    ...items.map((a) => loadImage(a.images[0]).catch(() => null)),
  ]);
  await Promise.all(['700 80px "Playfair Display"', '800 60px "Plus Jakarta Sans"', '500 40px "Plus Jakarta Sans"'].map((f) => document.fonts.load(f).catch(() => {})));
  return { logo: logoImg, imgs };
}

const REELS = {
  /** Intro con collage + 4 productos + cierre. ~21 s */
  async novedades(items, extra = {}) {
    const h = extra.hooks?.novedades || {};
    const A = await assets(items);
    const n = items.length;
    return sequence([
      {
        dur: 3.2,
        sfx: [[0.5, 'rise']],
        draw(ctx, t, d) {
          const z = 1 + 0.06 * (t / d);
          const half = [W / 2, H / 2];
          A.imgs.slice(0, 4).forEach((img, i) => cover(ctx, img, (i % 2) * half[0], Math.floor(i / 2) * half[1], half[0], half[1], z));
          ctx.fillStyle = 'rgba(131,24,67,0.72)';
          ctx.fillRect(0, 0, W, H);
          logo(ctx, A.logo, W / 2, 620, 200, appear(t, 0));
          text(ctx, h.kicker || 'NUEVOS INGRESOS', W / 2, 860, { size: 46, weight: 800, color: '#fbcfe8', alpha: appear(t, 0.2) });
          text(ctx, h.title || 'Llegó lo nuevo ✨', W / 2, 1010, { size: 100, maxLines: 3, font: SERIF, alpha: appear(t, 0.5), dy: 40 * (1 - appear(t, 0.5)) });
          text(ctx, h.sub || 'Mirá hasta el final 👀', W / 2, 1330, { size: 48, weight: 600, color: '#fce7f3', alpha: appear(t, 1.1) });
        },
      },
      ...items.map((a, i) => productScene(A, a, A.imgs[i], { index: i + 1, total: n, badge: a.isNew ? 'NOVEDAD' : hasOffer(a) ? 'OFERTA' : '' })),
      ctaScene(A, extra.hooks?.cta || '¿Cuál sumás a tu local?'),
    ]);
  },

  /** ¿Cuál te llevás? 3 productos + los 3 juntos. ~20 s */
  async elegir(items, extra = {}) {
    const h = extra.hooks?.elegir || {};
    const A = await assets(items);
    return sequence([
      {
        dur: 2.8,
        sfx: [[0.2, 'rise']],
        draw(ctx, t) {
          gradientBg(ctx, false);
          logo(ctx, A.logo, W / 2, 600, 180);
          text(ctx, h.title || '¿Cuál te llevás?', W / 2, 920, { size: 100, maxLines: 3, font: SERIF, color: DARK, alpha: appear(t, 0.2), dy: 40 * (1 - appear(t, 0.2)) });
          text(ctx, h.sub || 'Mirá las 3 y elegí 👇', W / 2, 1250, { size: 52, weight: 600, color: PINK, alpha: appear(t, 0.8) });
        },
      },
      ...items.map((a, i) => {
        const base = productScene(A, a, A.imgs[i], { dur: 3.2 });
        return {
          dur: 3.2,
          sfx: [[0, 'pop'], ...base.sfx],
          draw(ctx, t, d) {
            base.draw(ctx, t, d);
            const s = appear(t, 0, 0.4);
            ctx.save();
            ctx.globalAlpha = s;
            ctx.fillStyle = PINK;
            ctx.beginPath();
            ctx.arc(170, 240, 110 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            text(ctx, String(i + 1), 170, 285, { size: 130, weight: 800, alpha: s });
          },
        };
      }),
      {
        dur: 4.4,
        sfx: [[0.2, 'pop'], [0.45, 'pop'], [0.7, 'pop'], [1.2, 'bling']],
        draw(ctx, t) {
          gradientBg(ctx, false);
          text(ctx, '¿1, 2 o 3?', W / 2, 330, { size: 120, font: SERIF, color: DARK, alpha: appear(t, 0) });
          const cw = (W - 80 - 40) / 3;
          items.forEach((a, i) => {
            const x = 40 + i * (cw + 20);
            const pop = appear(t, 0.2 + i * 0.25, 0.4);
            ctx.save();
            ctx.globalAlpha = pop;
            clipRound(ctx, x, 460 + 60 * (1 - pop), cw, 900, 30, () => cover(ctx, A.imgs[i], x, 460 + 60 * (1 - pop), cw, 900));
            ctx.restore();
            text(ctx, String(i + 1), x + cw / 2, 1460, { size: 90, weight: 800, color: PINK, alpha: pop });
            text(ctx, formatPrice(salePrice(a)), x + cw / 2, 1550, { size: 46, weight: 700, color: DARK, alpha: pop, maxW: cw });
          });
          pill(ctx, 'Comentá tu número 👇', W / 2, 1650, { size: 50, alpha: appear(t, 1.2) });
        },
      },
      ctaScene(A, 'Todos disponibles en la web'),
    ]);
  },

  /** POV: te llegó tu pedido. Los productos van apareciendo en una grilla. ~19 s */
  async pov(items, extra = {}) {
    const h = extra.hooks?.pov || {};
    const A = await assets(items);
    const list = items.slice(0, 6);
    return sequence([
      {
        dur: 3.4,
        sfx: [[0.4, 'rise']],
        draw(ctx, t) {
          gradientBg(ctx, true);
          text(ctx, h.pre || 'POV:', W / 2, 700, { size: 70, weight: 800, color: '#fbcfe8', alpha: appear(t, 0) });
          text(ctx, h.title || 'Te llegó tu pedido de ÚNICA 📦', W / 2, 860, { size: 100, font: SERIF, alpha: appear(t, 0.4), dy: 40 * (1 - appear(t, 0.4)) });
          text(ctx, h.sub || 'y es todo lo que pediste', W / 2, 1300, { size: 52, weight: 600, color: '#fce7f3', alpha: appear(t, 1.2) });
        },
      },
      {
        dur: 9.5,
        sfx: [...list.map((_, i) => [i * 0.9, 'pop']), [list.length * 0.9 + 0.3, 'bling']],
        draw(ctx, t) {
          ctx.fillStyle = SOFT;
          ctx.fillRect(0, 0, W, H);
          const cols = 2;
          const gap = 24;
          const cw = (W - gap * 3) / cols;
          const ch = (H - 380 - gap * 4) / 3;
          list.forEach((a, i) => {
            const pop = appear(t, i * 0.9, 0.35);
            if (pop <= 0) return;
            const x = gap + (i % cols) * (cw + gap);
            const y = 200 + Math.floor(i / cols) * (ch + gap);
            const s = 0.8 + 0.2 * pop;
            ctx.save();
            ctx.globalAlpha = pop;
            ctx.translate(x + cw / 2, y + ch / 2);
            ctx.scale(s, s);
            clipRound(ctx, -cw / 2, -ch / 2, cw, ch, 30, () => cover(ctx, A.imgs[i], -cw / 2, -ch / 2, cw, ch));
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = `800 40px ${SANS}`;
            const price = formatPrice(salePrice(a));
            const pw = ctx.measureText(price).width + 40;
            roundRect(ctx, -cw / 2 + 20, ch / 2 - 90, pw, 66, 33);
            ctx.fill();
            ctx.fillStyle = PINK;
            ctx.fillText(price, -cw / 2 + 40, ch / 2 - 44);
            ctx.restore();
          });
          text(ctx, 'Todo a precio mayorista 💗', W / 2, 130, { size: 62, font: SERIF, color: DARK, alpha: appear(t, 0.2) });
          pill(ctx, 'Armá tu pedido en la web', W / 2, H - 170, { size: 46, alpha: appear(t, list.length * 0.9 + 0.3) });
        },
      },
      ctaScene(A),
    ]);
  },

  /** Así comprás en la web: un celular dibujado; el dedito toca rápido y cada toque suena. ~20 s */
  async web(items, extra = {}) {
    const h = extra.hooks?.web || {};
    const A = await assets(items);
    const { x: PX, y: PY, w: PW, h: PH } = PHONE;
    const caption = (ctx, n, title, t) => {
      pill(ctx, `PASO ${n}`, W / 2, 150, { size: 40, alpha: appear(t, 0) });
      text(ctx, title, W / 2, 390, { size: 74, font: SERIF, color: DARK, alpha: appear(t, 0.2), maxLines: 2 });
    };
    const cw = (PW - 60) / 2;
    const chips = (items[0].sizes?.length ? items[0].sizes : ['S', 'M', 'L', 'XL']).slice(0, 4);
    const chipAt = (i) => [PX + 90 + i * 135, PY + 910];
    const step2Taps = [[0.7, ...chipAt(0)], [1.25, ...chipAt(Math.min(1, chips.length - 1))], [1.8, ...chipAt(Math.min(2, chips.length - 1))], [2.8, PX + PW / 2, PY + 1060]];
    const sendAt = [PX + PW / 2, PY + PH - 110];
    return sequence([
      {
        dur: 3,
        sfx: [[0.2, 'rise']],
        draw(ctx, t) {
          gradientBg(ctx, true);
          logo(ctx, A.logo, W / 2, 620, 200);
          text(ctx, h.title || '¿Ya compraste en nuestra web? 🛍️', W / 2, 900, { size: 92, font: SERIF, alpha: appear(t, 0.2), dy: 40 * (1 - appear(t, 0.2)) });
          text(ctx, h.sub || 'Te mostramos lo fácil que es 👇', W / 2, 1300, { size: 52, weight: 600, color: '#fce7f3', alpha: appear(t, 0.8) });
        },
      },
      {
        dur: 4.4,
        sfx: [[0.6, 'swipe'], [2.4, 'tap']],
        draw(ctx, t) {
          gradientBg(ctx, false);
          caption(ctx, 1, 'Entrá y mirá todo el catálogo', t);
          const scroll = 300 * ease((t - 0.6) / 0.8);
          const picked = t >= 2.4;
          phone(ctx, (x, y) => {
            items.slice(0, 6).forEach((a, i) => {
              const cx = x + 20 + (i % 2) * (cw + 20);
              const cy = y + 200 + Math.floor(i / 2) * (cw * 1.35 + 20) - scroll;
              const big = picked && i === 2 ? 1 + 0.05 * (1 - appear(t, 2.4, 0.3)) : 1;
              ctx.save();
              ctx.translate(cx + cw / 2, cy + cw / 2);
              ctx.scale(big, big);
              clipRound(ctx, -cw / 2, -cw / 2, cw, cw * 1.05, 20, () => cover(ctx, A.imgs[i % A.imgs.length], -cw / 2, -cw / 2, cw, cw * 1.05));
              ctx.restore();
              text(ctx, formatPrice(salePrice(a)), cx + 8, cy + cw * 1.05 + 46, { size: 32, weight: 800, color: PINK, align: 'left', maxW: cw });
            });
            storeHeader(ctx, A, x, y, PW);
          });
          // Dedito: desliza para arriba y toca un producto
          const card = [PX + 20 + cw / 2, PY + 200 + (cw * 1.35 + 20) - 300 + cw / 2];
          const swipeY = PY + PH - 250 - 500 * ease((t - 0.6) / 0.8);
          finger(ctx, t, [[2.4, ...card]], [PX + PW / 2, t < 1.6 ? swipeY : PY + PH - 750]);
        },
      },
      {
        dur: 4.4,
        sfx: [...step2Taps.map(([tt]) => [tt, 'tap']), [2.9, 'ding']],
        draw(ctx, t) {
          const a = items[0];
          gradientBg(ctx, false);
          caption(ctx, 2, 'Elegí talles, colores y cantidad', t);
          const tapped = step2Taps.filter(([tt]) => t >= tt).length;
          const active = Math.min(chips.length - 1, Math.max(0, Math.min(tapped, 3) - 1));
          const added = t >= 2.85;
          phone(ctx, (x, y, w) => {
            cover(ctx, A.imgs[0], x, y, w, 620, 1.05);
            text(ctx, a.title, x + 30, y + 700, { size: 36, font: SERIF, color: DARK, align: 'left', maxW: w - 60, maxLines: 2 });
            text(ctx, formatPrice(salePrice(a)), x + 30, y + 820, { size: 46, weight: 800, color: PINK, align: 'left' });
            chips.forEach((sz, i) => {
              const bx = x + 30 + i * 135;
              const on = tapped > 0 && i === active;
              ctx.fillStyle = on ? PINK : '#fce7f3';
              roundRect(ctx, bx, y + 870, 120, 80, 20);
              ctx.fill();
              text(ctx, String(sz).slice(0, 5), bx + 60, y + 925, { size: 32, weight: 700, color: on ? '#fff' : DARK, maxW: 110 });
            });
            const pulse = added ? 1 + 0.06 * (1 - appear(t, 2.85, 0.3)) : 1;
            ctx.save();
            ctx.translate(x + w / 2, y + 1060);
            ctx.scale(pulse, pulse);
            ctx.fillStyle = added ? WA : PINK;
            roundRect(ctx, -(w - 60) / 2, -50, w - 60, 100, 50);
            ctx.fill();
            ctx.restore();
            text(ctx, added ? '✓ Agregado' : 'Agregar al pedido', x + w / 2, y + 1075, { size: 36, weight: 800 });
          });
          finger(ctx, t, step2Taps, [PX + PW - 60, PY + PH + 100]);
        },
      },
      {
        dur: 4.4,
        sfx: [[1.2, 'tap'], [1.35, 'success']],
        draw(ctx, t) {
          gradientBg(ctx, false);
          caption(ctx, 3, 'Enviá el pedido por WhatsApp', t);
          const sent = t >= 1.25;
          phone(ctx, (x, y, w, h) => {
            text(ctx, 'Tu pedido mayorista', x + 30, y + 140, { size: 40, font: SERIF, color: DARK, align: 'left' });
            items.slice(0, 3).forEach((a, i) => {
              const ry = y + 190 + i * 190;
              clipRound(ctx, x + 30, ry, 150, 150, 20, () => cover(ctx, A.imgs[i % A.imgs.length], x + 30, ry, 150, 150));
              text(ctx, a.title, x + 200, ry + 50, { size: 28, weight: 600, color: DARK, align: 'left', maxW: w - 240, maxLines: 2 });
              text(ctx, formatPrice(salePrice(a)), x + 200, ry + 130, { size: 32, weight: 800, color: PINK, align: 'left' });
            });
            const total = items.slice(0, 3).reduce((sum, a) => sum + salePrice(a), 0);
            text(ctx, `Total estimado ${formatPrice(total)}`, x + 30, y + h - 220, { size: 36, weight: 800, color: DARK, align: 'left' });
            const pulse = sent ? 1 + 0.06 * (1 - appear(t, 1.25, 0.3)) : 1 + 0.025 * Math.sin(t * 9);
            ctx.save();
            ctx.translate(x + w / 2, y + h - 110);
            ctx.scale(pulse, pulse);
            ctx.fillStyle = WA;
            roundRect(ctx, -(w - 60) / 2, -55, w - 60, 110, 55);
            ctx.fill();
            ctx.restore();
            text(ctx, sent ? '✓ ¡Pedido enviado!' : 'Enviar pedido por WhatsApp', x + w / 2, y + h - 97, { size: 34, weight: 800 });
          });
          finger(ctx, t, [[1.2, ...sendAt]], [PX + PW - 40, PY + PH + 120]);
          // Cartel de confirmación
          const ok = appear(t, 1.4, 0.35);
          if (ok > 0) {
            ctx.save();
            ctx.globalAlpha = ok;
            ctx.translate(W / 2, 1150);
            ctx.scale(0.7 + 0.3 * ok, 0.7 + 0.3 * ok);
            ctx.fillStyle = '#fff';
            ctx.shadowColor = 'rgba(0,0,0,0.25)';
            ctx.shadowBlur = 40;
            roundRect(ctx, -360, -150, 720, 300, 50);
            ctx.fill();
            ctx.restore();
            text(ctx, '✅', W / 2, 1120, { size: 90, alpha: ok });
            text(ctx, '¡Listo! Te respondemos por WhatsApp', W / 2, 1220, { size: 40, weight: 800, color: DARK, alpha: ok, maxW: 640, maxLines: 2 });
          }
        },
      },
      ctaScene(A, '¡Así de fácil!'),
    ]);
  },

  /** 3 tips (vender más o cuidado de la lencería), solo texto. ~21 s */
  async tips(items, { title, tips }) {
    const A = await assets([]);
    return sequence([
      {
        dur: 3.4,
        sfx: [[0.2, 'rise']],
        draw(ctx, t) {
          gradientBg(ctx, true);
          logo(ctx, A.logo, W / 2, 600, 190);
          text(ctx, title, W / 2, 880, { size: 100, font: SERIF, alpha: appear(t, 0.2), dy: 40 * (1 - appear(t, 0.2)) });
          text(ctx, 'Guardalo para después 📌', W / 2, 1340, { size: 50, weight: 600, color: '#fce7f3', alpha: appear(t, 1) });
        },
      },
      ...tips.map(([tTitle, body], i) => ({
        dur: 4.8,
        sfx: [[0, 'pop'], [0.9, 'ding']],
        draw(ctx, t) {
          gradientBg(ctx, false);
          text(ctx, String(i + 1), W / 2, 620, { size: 260, font: SERIF, color: PINK, alpha: appear(t, 0) });
          const y = text(ctx, tTitle, W / 2, 860, { size: 86, font: SERIF, color: DARK, alpha: appear(t, 0.2), dy: 30 * (1 - appear(t, 0.2)) });
          if (body) text(ctx, body, W / 2, y + 60, { size: 52, weight: 500, color: '#475569', alpha: appear(t, 0.9), maxLines: 5 });
        },
      })),
      ctaScene(A, 'Seguinos para más tips 💗'),
    ]);
  },
};

export const buildReel = (kind, items, extra) => REELS[kind](items, extra);

/* ---------------------------------------------------------------- Música */
// Música original generada en el navegador (sin derechos de autor) + efectos de sonido
// sincronizados con lo que pasa en pantalla (toques, apariciones, precios, cambios de escena).

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // número MIDI → Hz
// La menor – Fa – Do – Sol: la vuelta de acordes de muchos hits pop.
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const ROOTS = [45, 41, 36, 43];
// Gancho melódico (pentatónica de La menor), en corcheas; null = silencio.
const HOOK = [76, null, 79, 76, 74, null, 72, 74, 76, null, 79, 81, 79, null, 76, null];

let noiseBuffer = null;
function noiseSrc(ac) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ac.sampleRate) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  return src;
}

function env(ac, out, t, { attack = 0.005, peak = 0.2, decay = 0.2 }) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function osc(ac, out, t, { freq, type = 'sine', dur = 0.2, peak = 0.2, attack = 0.005, filter, glideTo }) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  const g = env(ac, out, t, { attack, peak, decay: dur });
  if (filter) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    o.connect(f).connect(g);
  } else o.connect(g);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noiseHit(ac, out, t, { type = 'highpass', freq = 8000, dur = 0.06, peak = 0.15, q = 1 }) {
  const src = noiseSrc(ac);
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f).connect(env(ac, out, t, { peak, decay: dur }));
  src.start(t);
  src.stop(t + dur + 0.05);
}

const kick = (ac, out, t, peak = 0.9) => osc(ac, out, t, { freq: 150, glideTo: 42, dur: 0.28, peak });
const clap = (ac, out, t) => {
  for (const d of [0, 0.012, 0.024]) noiseHit(ac, out, t + d, { type: 'bandpass', freq: 1600, q: 0.8, dur: 0.12, peak: 0.28 });
};
const hat = (ac, out, t, peak = 0.08) => noiseHit(ac, out, t, { freq: 8500, dur: 0.05, peak });
const snare = (ac, out, t) => {
  noiseHit(ac, out, t, { type: 'bandpass', freq: 2200, q: 0.7, dur: 0.14, peak: 0.3 });
  osc(ac, out, t, { freq: 220, glideTo: 160, dur: 0.1, peak: 0.15 });
};

/** Pop movido: 124 BPM, bombo en cada tiempo, palmas, bajo bombeando y un gancho pegadizo. */
function popBeat(ac, out, start, duration) {
  const beat = 60 / 124;
  const bar = beat * 4;
  for (let b = 0; start + b * bar < start + duration; b++) {
    const t0 = start + b * bar;
    const c = b % 4;
    for (let k = 0; k < 4; k++) {
      const t = t0 + k * beat;
      kick(ac, out, t);
      hat(ac, out, t + beat / 2, 0.1);
      if (k % 2) clap(ac, out, t);
      // Bajo en contratiempo (efecto "bombeo")
      osc(ac, out, t + beat / 2, { freq: NOTE(ROOTS[c] + 12), type: 'sawtooth', dur: beat * 0.4, peak: 0.13, filter: 700 });
      // Acordes cortos (stabs)
      for (const n of CHORDS[c]) osc(ac, out, t + beat / 2, { freq: NOTE(n + 12), type: 'sawtooth', dur: 0.16, peak: 0.035, filter: 2400 });
    }
    // Gancho: cada 2 compases, desde el 3er compás (la intro respira)
    if (b >= 1) {
      HOOK.forEach((n, i) => {
        if (n == null || i >= 8 * ((b % 2) + 1) || i < 8 * (b % 2)) return;
        osc(ac, out, t0 + (i % 8) * (beat / 2), { freq: NOTE(n), type: 'square', dur: 0.18, peak: 0.06, filter: 3200 });
      });
    }
  }
}

/** Urbano (dembow): 96 BPM, bombo + redoblante en el patrón típico del reggaetón, bajo 808 y marimba. */
function urbanBeat(ac, out, start, duration) {
  const beat = 60 / 96;
  const bar = beat * 4;
  for (let b = 0; start + b * bar < start + duration; b++) {
    const t0 = start + b * bar;
    const c = b % 4;
    for (let half = 0; half < 2; half++) {
      const h = t0 + half * beat * 2;
      kick(ac, out, h, 0.85);
      kick(ac, out, h + beat, 0.85);
      snare(ac, out, h + beat * 0.75);
      snare(ac, out, h + beat * 1.5);
      for (let k = 0; k < 4; k++) hat(ac, out, h + k * (beat / 2), 0.06);
      osc(ac, out, h, { freq: NOTE(ROOTS[c]), dur: beat * 0.9, peak: 0.35, glideTo: NOTE(ROOTS[c]) * 0.97 });
      osc(ac, out, h + beat, { freq: NOTE(ROOTS[c]), dur: beat * 0.9, peak: 0.3 });
    }
    // Marimba: arpegio del acorde
    const arp = [...CHORDS[c], CHORDS[c][1] + 12];
    for (let k = 0; k < 8; k++) {
      if (k === 3 || k === 7) continue;
      osc(ac, out, t0 + k * (beat / 2), { freq: NOTE(arp[k % arp.length] + 12), dur: 0.22, peak: 0.07 });
    }
  }
}

/* ---------------------------------------------------------------- Efectos */

const SFX = {
  // Cambio de escena
  whoosh(ac, out, t) {
    const src = noiseSrc(ac);
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(4500, t + 0.3);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.4);
  },
  swipe(ac, out, t) {
    SFX.whoosh(ac, out, t);
  },
  // Aparece algo
  pop(ac, out, t) {
    osc(ac, out, t, { freq: 1200, glideTo: 380, dur: 0.09, peak: 0.4 });
  },
  // Precio / dato importante: campanita
  ding(ac, out, t) {
    osc(ac, out, t, { freq: 1760, dur: 0.7, peak: 0.16 });
    osc(ac, out, t, { freq: 2637, dur: 0.45, peak: 0.07 });
  },
  // Toque del dedito: "bling" de dos notas que suben
  tap(ac, out, t) {
    noiseHit(ac, out, t, { freq: 5000, dur: 0.02, peak: 0.15 });
    osc(ac, out, t, { freq: 1568, dur: 0.25, peak: 0.2 });
    osc(ac, out, t + 0.06, { freq: 2093, dur: 0.35, peak: 0.18 });
  },
  bling(ac, out, t) {
    [1319, 1760, 2349].forEach((f, i) => osc(ac, out, t + i * 0.05, { freq: f, dur: 0.4, peak: 0.13 }));
  },
  // Pedido enviado
  success(ac, out, t) {
    [1047, 1319, 1568, 2093].forEach((f, i) => osc(ac, out, t + i * 0.07, { freq: f, dur: 0.45, peak: 0.15 }));
  },
  // Entra un título: barrido que sube
  rise(ac, out, t) {
    osc(ac, out, t, { freq: 300, glideTo: 1400, dur: 0.45, peak: 0.08, type: 'triangle' });
    SFX.whoosh(ac, out, t + 0.05);
  },
};

function scheduleSfx(ac, out, start, sfx = []) {
  const bus = ac.createGain();
  bus.gain.value = 0.9;
  bus.connect(out);
  for (const [t, kind] of sfx) SFX[kind]?.(ac, bus, start + t);
}

/** Audio propio: suena desde el principio, recortado al largo del reel y con fundidos. */
async function scheduleFile(ac, out, arrayBuffer, start, duration) {
  const buf = await ac.decodeAudioData(arrayBuffer.slice(0));
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.connect(out);
  src.start(start, 0, duration + 0.1);
}

/** music: { kind: 'pop' | 'urbano' | 'efectos' | 'archivo' | 'ninguna', file?: ArrayBuffer }. sfx: [[segundo, tipo]] */
async function startAudio(ac, dest, music, duration, sfx) {
  if (!music || music.kind === 'ninguna') return;
  const start = ac.currentTime + 0.05;
  // La música va un poco más baja que los efectos, con fundido al principio y al final
  const bed = ac.createGain();
  bed.gain.setValueAtTime(0, start);
  bed.gain.linearRampToValueAtTime(0.6, start + 0.4);
  bed.gain.setValueAtTime(0.6, start + duration - 1.2);
  bed.gain.linearRampToValueAtTime(0, start + duration);
  bed.connect(dest);
  if (music.kind === 'pop') popBeat(ac, bed, start, duration);
  if (music.kind === 'urbano') urbanBeat(ac, bed, start, duration);
  if (music.kind === 'archivo' && music.file) await scheduleFile(ac, bed, music.file, start, duration);
  scheduleSfx(ac, dest, start, sfx);
}

/** Escuchar la música por los parlantes (vista previa). Devuelve una función para cortarla. */
export async function previewMusic(music, duration, sfx = []) {
  const ac = new AudioContext();
  await ac.resume();
  await startAudio(ac, ac.destination, music, duration, sfx);
  const timer = setTimeout(() => ac.close(), (duration + 0.5) * 1000);
  return () => {
    clearTimeout(timer);
    ac.close();
  };
}

/* ---------------------------------------------------------------- Grabación */

const MIME_AUDIO = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const MIME_MUTE = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

/** Graba el reel en tiempo real (dura lo mismo que el video), con música y efectos. Prefiere MP4. */
export async function recordReel(reel, onProgress = () => {}, music = { kind: 'ninguna' }) {
  const withAudio = music && music.kind !== 'ninguna';
  const list = withAudio ? MIME_AUDIO : MIME_MUTE;
  const mime = window.MediaRecorder && list.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('Este navegador no puede grabar video. Probá desde Chrome o desde el celular.');
  const c = document.createElement('canvas');
  c.width = 720;
  c.height = 1280;
  const ctx = c.getContext('2d');
  const frame = (t) => {
    ctx.setTransform(720 / W, 0, 0, 720 / W, 0, 0);
    reel.draw(ctx, t);
  };
  frame(0);
  const tracks = [...c.captureStream(30).getVideoTracks()];
  let ac = null;
  let audioDest = null;
  if (withAudio) {
    ac = new AudioContext();
    await ac.resume();
    audioDest = ac.createMediaStreamDestination();
    // Señal muda y una pausa corta: así el audio ya está andando cuando arranca la grabación
    // (si no, a veces el sonido empieza tarde y queda más corto que el video).
    const silent = ac.createConstantSource();
    const zero = ac.createGain();
    zero.gain.value = 0;
    silent.connect(zero).connect(audioDest);
    silent.start();
    tracks.push(...audioDest.stream.getAudioTracks());
    await new Promise((r) => setTimeout(r, 700));
  }
  const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start(500);
  if (ac) await startAudio(ac, audioDest, music, reel.duration, reel.sfx);
  const t0 = performance.now();
  try {
    await new Promise((resolve) => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        frame(Math.min(t, reel.duration));
        onProgress(Math.min(1, t / reel.duration));
        if (t >= reel.duration + 0.2) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  } finally {
    rec.stop();
    await stopped;
    ac?.close();
  }
  const type = mime.split(';')[0];
  return new File([new Blob(chunks, { type })], `unica-reel.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type });
}
