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
  return {
    duration,
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

function tap(ctx, cx, cy, t) {
  const p = (t % 1.4) / 1.4;
  ctx.save();
  ctx.globalAlpha = 0.5 * (1 - p);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, 30 + 50 * p, 0, Math.PI * 2);
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
  async novedades(items) {
    const A = await assets(items);
    const n = items.length;
    return sequence([
      {
        dur: 3.2,
        draw(ctx, t, d) {
          const z = 1 + 0.06 * (t / d);
          const half = [W / 2, H / 2];
          A.imgs.slice(0, 4).forEach((img, i) => cover(ctx, img, (i % 2) * half[0], Math.floor(i / 2) * half[1], half[0], half[1], z));
          ctx.fillStyle = 'rgba(131,24,67,0.72)';
          ctx.fillRect(0, 0, W, H);
          logo(ctx, A.logo, W / 2, 620, 200, appear(t, 0));
          text(ctx, 'NUEVOS INGRESOS', W / 2, 860, { size: 46, weight: 800, color: '#fbcfe8', alpha: appear(t, 0.2) });
          text(ctx, 'Llegó lo nuevo ✨', W / 2, 1010, { size: 110, font: SERIF, alpha: appear(t, 0.5), dy: 40 * (1 - appear(t, 0.5)) });
          text(ctx, 'Mirá hasta el final 👀', W / 2, 1220, { size: 48, weight: 600, color: '#fce7f3', alpha: appear(t, 1.1) });
        },
      },
      ...items.map((a, i) => productScene(A, a, A.imgs[i], { index: i + 1, total: n, badge: a.isNew ? 'NOVEDAD' : hasOffer(a) ? 'OFERTA' : '' })),
      ctaScene(A, '¿Cuál sumás a tu local?'),
    ]);
  },

  /** ¿Cuál te llevás? 3 productos + los 3 juntos. ~20 s */
  async elegir(items) {
    const A = await assets(items);
    return sequence([
      {
        dur: 2.8,
        draw(ctx, t) {
          gradientBg(ctx, false);
          logo(ctx, A.logo, W / 2, 600, 180);
          text(ctx, '¿Cuál te llevás?', W / 2, 920, { size: 110, font: SERIF, color: DARK, alpha: appear(t, 0.2), dy: 40 * (1 - appear(t, 0.2)) });
          text(ctx, 'Mirá las 3 y elegí 👇', W / 2, 1100, { size: 52, weight: 600, color: PINK, alpha: appear(t, 0.8) });
        },
      },
      ...items.map((a, i) => {
        const base = productScene(A, a, A.imgs[i], { dur: 3.2 });
        return {
          dur: 3.2,
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
  async pov(items) {
    const A = await assets(items);
    const list = items.slice(0, 6);
    return sequence([
      {
        dur: 3.6,
        draw(ctx, t) {
          gradientBg(ctx, true);
          text(ctx, 'POV:', W / 2, 700, { size: 70, weight: 800, color: '#fbcfe8', alpha: appear(t, 0) });
          text(ctx, 'Te llegó tu pedido de ÚNICA 📦', W / 2, 860, { size: 100, font: SERIF, alpha: appear(t, 0.4), dy: 40 * (1 - appear(t, 0.4)) });
          text(ctx, 'y es todo lo que pediste', W / 2, 1250, { size: 52, weight: 600, color: '#fce7f3', alpha: appear(t, 1.2) });
        },
      },
      {
        dur: 11,
        draw(ctx, t) {
          ctx.fillStyle = SOFT;
          ctx.fillRect(0, 0, W, H);
          const cols = 2;
          const gap = 24;
          const cw = (W - gap * 3) / cols;
          const ch = (H - 380 - gap * 4) / 3;
          list.forEach((a, i) => {
            const pop = appear(t, i * 1.1, 0.5);
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
          pill(ctx, 'Armá tu pedido en la web', W / 2, H - 170, { size: 46, alpha: appear(t, list.length * 1.1 + 0.3) });
        },
      },
      ctaScene(A),
    ]);
  },

  /** Así comprás en la web: un celular dibujado con la tienda, el artículo y el carrito. ~20 s */
  async web(items) {
    const A = await assets(items);
    const caption = (ctx, n, title, t) => {
      pill(ctx, `PASO ${n}`, W / 2, 150, { size: 40, alpha: appear(t, 0) });
      text(ctx, title, W / 2, 390, { size: 74, font: SERIF, color: DARK, alpha: appear(t, 0.2), maxLines: 2 });
    };
    return sequence([
      {
        dur: 3.2,
        draw(ctx, t) {
          gradientBg(ctx, true);
          logo(ctx, A.logo, W / 2, 620, 200);
          text(ctx, '¿Ya compraste en nuestra web? 🛍️', W / 2, 900, { size: 92, font: SERIF, alpha: appear(t, 0.2), dy: 40 * (1 - appear(t, 0.2)) });
          text(ctx, 'Te mostramos lo fácil que es', W / 2, 1250, { size: 52, weight: 600, color: '#fce7f3', alpha: appear(t, 1) });
        },
      },
      {
        dur: 4.6,
        draw(ctx, t) {
          gradientBg(ctx, false);
          caption(ctx, 1, 'Entrá y mirá todo el catálogo', t);
          phone(ctx, (x, y, w) => {
            const scroll = 140 * (t / 4.6);
            const cw = (w - 60) / 2;
            items.slice(0, 6).forEach((a, i) => {
              const cx = x + 20 + (i % 2) * (cw + 20);
              const cy = y + 200 + Math.floor(i / 2) * (cw * 1.35 + 20) - scroll;
              clipRound(ctx, cx, cy, cw, cw * 1.05, 20, () => cover(ctx, A.imgs[i % A.imgs.length], cx, cy, cw, cw * 1.05));
              text(ctx, formatPrice(salePrice(a)), cx + 8, cy + cw * 1.05 + 46, { size: 32, weight: 800, color: PINK, align: 'left', maxW: cw });
            });
            storeHeader(ctx, A, x, y, w);
          });
        },
      },
      {
        dur: 4.6,
        draw(ctx, t) {
          const a = items[0];
          gradientBg(ctx, false);
          caption(ctx, 2, 'Elegí talles, colores y cantidad', t);
          phone(ctx, (x, y, w) => {
            cover(ctx, A.imgs[0], x, y, w, 620, 1.05);
            text(ctx, a.title, x + 30, y + 700, { size: 36, font: SERIF, color: DARK, align: 'left', maxW: w - 60, maxLines: 2 });
            text(ctx, formatPrice(salePrice(a)), x + 30, y + 820, { size: 46, weight: 800, color: PINK, align: 'left' });
            const sizes = (a.sizes?.length ? a.sizes : ['S', 'M', 'L', 'XL']).slice(0, 4);
            const active = Math.min(sizes.length - 1, Math.floor(t / 1.1));
            sizes.forEach((s, i) => {
              const bx = x + 30 + i * 135;
              ctx.fillStyle = i === active ? PINK : '#fce7f3';
              roundRect(ctx, bx, y + 870, 120, 80, 20);
              ctx.fill();
              text(ctx, String(s).slice(0, 5), bx + 60, y + 925, { size: 32, weight: 700, color: i === active ? '#fff' : DARK, maxW: 110 });
            });
            ctx.fillStyle = PINK;
            roundRect(ctx, x + 30, y + 1010, w - 60, 100, 50);
            ctx.fill();
            text(ctx, 'Agregar al pedido', x + w / 2, y + 1075, { size: 36, weight: 800 });
            tap(ctx, x + 30 + active * 135 + 60, y + 910, t);
          });
        },
      },
      {
        dur: 4.6,
        draw(ctx, t) {
          gradientBg(ctx, false);
          caption(ctx, 3, 'Enviá el pedido por WhatsApp', t);
          phone(ctx, (x, y, w, h) => {
            text(ctx, 'Tu pedido mayorista', x + 30, y + 140, { size: 40, font: SERIF, color: DARK, align: 'left' });
            items.slice(0, 3).forEach((a, i) => {
              const ry = y + 190 + i * 190;
              clipRound(ctx, x + 30, ry, 150, 150, 20, () => cover(ctx, A.imgs[i % A.imgs.length], x + 30, ry, 150, 150));
              text(ctx, a.title, x + 200, ry + 50, { size: 28, weight: 600, color: DARK, align: 'left', maxW: w - 240, maxLines: 2 });
              text(ctx, formatPrice(salePrice(a)), x + 200, ry + 130, { size: 32, weight: 800, color: PINK, align: 'left' });
            });
            const total = items.slice(0, 3).reduce((s, a) => s + salePrice(a), 0);
            text(ctx, `Total estimado ${formatPrice(total)}`, x + 30, y + h - 220, { size: 36, weight: 800, color: DARK, align: 'left' });
            const pulse = 1 + 0.03 * Math.sin(t * 6);
            ctx.save();
            ctx.translate(x + w / 2, y + h - 110);
            ctx.scale(pulse, pulse);
            ctx.fillStyle = WA;
            roundRect(ctx, -(w - 60) / 2, -55, w - 60, 110, 55);
            ctx.fill();
            ctx.restore();
            text(ctx, 'Enviar pedido por WhatsApp', x + w / 2, y + h - 97, { size: 34, weight: 800 });
            if (t > 1.5) tap(ctx, x + w / 2, y + h - 110, t);
          });
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
        draw(ctx, t) {
          gradientBg(ctx, true);
          logo(ctx, A.logo, W / 2, 600, 190);
          text(ctx, title, W / 2, 880, { size: 100, font: SERIF, alpha: appear(t, 0.2), dy: 40 * (1 - appear(t, 0.2)) });
          text(ctx, 'Guardalo para después 📌', W / 2, 1340, { size: 50, weight: 600, color: '#fce7f3', alpha: appear(t, 1) });
        },
      },
      ...tips.map(([tTitle, body], i) => ({
        dur: 4.8,
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

/* ---------------------------------------------------------------- Grabación */

const MIME = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

/** Graba el reel en tiempo real (dura lo mismo que el video). Prefiere MP4, que es lo que toma Instagram. */
export async function recordReel(reel, onProgress = () => {}) {
  const mime = window.MediaRecorder && MIME.find((m) => MediaRecorder.isTypeSupported(m));
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
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start(500);
  const t0 = performance.now();
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
  rec.stop();
  await stopped;
  const type = mime.split(';')[0];
  return new File([new Blob(chunks, { type })], `unica-reel.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type });
}
