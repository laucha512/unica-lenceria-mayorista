// Lista de precios descargable (PDF y Excel), armada en el momento con el catálogo actual.
// El Excel se arma con src/shared/xlsx.js (el mismo que usa la copia de seguridad del admin).
// Solo artículos con stock, agrupados por marca. Este archivo se carga recién al tocar "Descargar".
import { formatPrice, instagramUser, SITE_URL, whatsappDisplay } from '../config.js';
import { availableColors, availableSizes } from '../shared/stock.js';
import { buildWorkbook, saveBlob } from '../shared/xlsx.js';

import { salePrice as packPrice } from '../shared/prices.js';
const today = () => new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fileDate = () => new Date().toISOString().slice(0, 10);
// Solo lo que hay: los talles y colores agotados del todo no se listan.
const sizesText = (a) => availableSizes(a).join(' - ');
const colorsText = (a) => (a.colors?.length ? availableColors(a).join(', ') : Object.keys(a.colorsBySize || {}).length ? 'Según talle' : '');

/** Artículos con stock, ordenados por marca y título. */
function listedArticles(articles) {
  return articles
    .filter((a) => a.inStock)
    .sort((x, y) => String(x.brand).localeCompare(String(y.brand), 'es') || String(x.title).localeCompare(String(y.title), 'es'));
}


/* ================================================================ Excel (.xlsx) */

function buildXlsx(articles) {
  return buildWorkbook([
    {
      name: 'Lista de precios',
      intro: [
        `ÚNICA LENCERÍA – Lista de precios mayorista (${today()})`,
        `WhatsApp ${whatsappDisplay()} · ${SITE_URL.replace('https://', '')} · Instagram @${instagramUser()} · Sin compra mínima`,
      ],
      header: ['Marca', 'Código', 'Artículo', 'Presentación', 'Talles', 'Colores', 'Precio', 'Ver en la web'],
      rows: articles.map((a) => [a.brand, a.code || '', a.title, a.presentation || '', sizesText(a), colorsText(a), packPrice(a), `${SITE_URL}/producto/${a.id}`]),
      widths: [16, 10, 48, 16, 22, 34, 12, 46],
      money: [6],
    },
  ]);
}

/* ================================================================ PDF */

// Las letras estándar del PDF no tienen emojis ni símbolos raros: se quitan para que no salgan cuadraditos.
const pdfText = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^ -~ -ÿ–—•…]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/** Foto chica en JPG para el PDF (la achica el servicio de imágenes de Netlify). */
async function thumb(src, w, h) {
  try {
    if (!/^\/(api\/images\?|img\/)/.test(String(src || ''))) return null;
    const res = await fetch(`/.netlify/images?url=${encodeURIComponent(src)}&w=${w}&h=${h}&fit=cover&fm=jpg&q=70`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.type === 'image/jpeg' ? await blobToDataUrl(blob) : null;
  } catch {
    return null;
  }
}

async function buildPdf(articles, onProgress) {
  const { jsPDF } = await import('jspdf');
  const images = new Array(articles.length).fill(null);
  let done = 0;
  const queue = articles.map((a, i) => [a, i]);
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const [a, i] = queue.shift();
        images[i] = await thumb(a.images?.[0], 160, 200);
        onProgress(++done, articles.length);
      }
    })
  );
  const logo = await thumb('/img/logo-unica.webp', 120, 120);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const H = 297;
  const M = 12;
  const PINK = [190, 24, 93];
  const DARK = [15, 23, 42];
  const GRAY = [71, 85, 105];
  let y = M;

  // Encabezado
  if (logo) doc.addImage(logo, 'JPEG', M, y, 16, 16);
  const tx = logo ? M + 20 : M;
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...DARK);
  doc.text('ÚNICA LENCERÍA – Lista de precios mayorista', tx, y + 6);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GRAY);
  doc.text(pdfText(`Actualizada el ${today()} · ${articles.length} artículos con stock · Sin compra mínima`), tx, y + 11);
  doc.text(pdfText(`WhatsApp ${whatsappDisplay()} · ${SITE_URL.replace('https://', '')} · Instagram @${instagramUser()}`), tx, y + 15.5);
  y += 22;
  doc.setDrawColor(...PINK).setLineWidth(0.6).line(M, y, W - M, y);
  y += 4;

  const ROW = 29;
  const PHOTO_W = 18;
  const PHOTO_H = 22.5;
  const TEXT_X = M + PHOTO_W + 4;
  const PRICE_W = 30;
  const TEXT_W = W - M - PRICE_W - TEXT_X - 2;
  const newPage = () => {
    doc.addPage();
    y = M;
  };

  let brand = null;
  articles.forEach((a, i) => {
    if (a.brand !== brand) {
      brand = a.brand;
      if (y + 9 + ROW > H - 14) newPage();
      doc.setFillColor(253, 242, 248).rect(M, y, W - 2 * M, 7.5, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...PINK);
      doc.text(pdfText(brand).toUpperCase(), M + 2.5, y + 5.2);
      y += 10;
    }
    if (y + ROW > H - 14) newPage();

    if (images[i]) doc.addImage(images[i], 'JPEG', M, y, PHOTO_W, PHOTO_H);
    else doc.setFillColor(252, 231, 243).rect(M, y, PHOTO_W, PHOTO_H, 'F');

    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...DARK);
    const title = doc.splitTextToSize(pdfText(a.title), TEXT_W).slice(0, 2);
    doc.text(title, TEXT_X, y + 4);
    let ty = y + 4 + title.length * 4.2;
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GRAY);
    const lines = [
      pdfText([a.code && `Art. ${a.code}`, a.presentation].filter(Boolean).join(' · ')),
      sizesText(a) && pdfText(`Talles: ${sizesText(a)}`),
      colorsText(a) && pdfText(`Colores: ${colorsText(a)}`),
    ].filter(Boolean);
    for (const line of lines) {
      if (ty > y + PHOTO_H) break;
      const wrapped = doc.splitTextToSize(line, TEXT_W)[0];
      doc.text(wrapped, TEXT_X, ty);
      ty += 3.8;
    }
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...PINK);
    doc.text(pdfText(formatPrice(packPrice(a))), W - M, y + 5, { align: 'right' });
    doc.link(TEXT_X, y, W - M - TEXT_X, PHOTO_H, { url: `${SITE_URL}/producto/${a.id}` });

    y += ROW;
    doc.setDrawColor(252, 231, 243).setLineWidth(0.2).line(M, y - 3, W - M, y - 3);
  });

  // Pie de página
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRAY);
    doc.text(pdfText(`Precios mayoristas sujetos a cambio sin previo aviso · Generada el ${today()}`), M, H - 7);
    doc.text(`Página ${p} de ${pages}`, W - M, H - 7, { align: 'right' });
  }
  return doc.output('blob');
}

/* ================================================================ Entrada */

/** kind: "pdf" | "excel". onProgress(texto) para mostrar el avance en el botón. Devuelve el archivo listo. */
export async function buildPriceList(kind, articles, onProgress = () => {}) {
  const list = listedArticles(articles);
  if (!list.length) throw new Error('Todavía no hay artículos con stock para armar la lista.');
  if (kind === 'excel') {
    const blob = buildXlsx(list);
    return { count: list.length, file: new File([blob], `lista-de-precios-unica-${fileDate()}.xlsx`, { type: blob.type ||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) };
  }
  const blob = await buildPdf(list, (done, total) => onProgress(`Armando la lista… ${Math.round((done / total) * 100)}%`));
  return { count: list.length, file: new File([blob], `lista-de-precios-unica-${fileDate()}.pdf`, { type: 'application/pdf' }) };
}

// iPhone/iPad: la descarga directa falla seguido (sobre todo abriendo desde WhatsApp o Instagram),
// así que se abre el menú de compartir, que tiene "Guardar en Archivos" y WhatsApp.
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Guarda el archivo. Si el teléfono pide otro toque (tardó mucho en armarse), tira un error con code "tap". */
export async function deliverFile(file) {
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Lista de precios Única' });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (err.name === 'NotAllowedError') throw Object.assign(new Error('Tocá de nuevo para guardar'), { code: 'tap' });
    }
  }
  saveBlob(file, file.name);
}
