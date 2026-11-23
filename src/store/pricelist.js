// Lista de precios descargable (PDF y Excel), armada en el momento con el catálogo actual.
// Solo artículos con stock, agrupados por marca. Este archivo se carga recién al tocar "Descargar".
import { formatPrice, instagramUser, SITE_URL, whatsappDisplay } from '../config.js';

const packPrice = (a) => a.pricePack || a.priceUnit || 0;
const today = () => new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fileDate = () => new Date().toISOString().slice(0, 10);
const sizesText = (a) => (a.sizes || []).join(' - ');
const colorsText = (a) => (a.colors?.length ? a.colors.join(', ') : Object.keys(a.colorsBySize || {}).length ? 'Según talle' : '');

/** Artículos con stock, ordenados por marca y título. */
function listedArticles(articles) {
  return articles
    .filter((a) => a.inStock)
    .sort((x, y) => String(x.brand).localeCompare(String(y.brand), 'es') || String(x.title).localeCompare(String(y.title), 'es'));
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ================================================================ Excel (.xlsx) */
// Archivo .xlsx armado a mano (es un .zip con XML adentro), sin librerías.

const xml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip sin compresión (suficiente para una planilla). */
function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(content);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function buildXlsx(articles) {
  const header = ['Marca', 'Código', 'Artículo', 'Presentación', 'Talles', 'Colores', 'Precio', 'Ver en la web'];
  const col = (i) => String.fromCharCode(65 + i);
  const cell = (v, i, r, style = 0) =>
    typeof v === 'number'
      ? `<c r="${col(i)}${r}" s="${style || 2}"><v>${v}</v></c>`
      : `<c r="${col(i)}${r}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  const rows = [
    `<row r="1">${cell(`ÚNICA LENCERÍA – Lista de precios mayorista (${today()})`, 0, 1, 1)}</row>`,
    `<row r="2">${cell(`WhatsApp ${whatsappDisplay()} · ${SITE_URL.replace('https://', '')} · Instagram @${instagramUser()} · Sin compra mínima`, 0, 2)}</row>`,
    `<row r="4">${header.map((h, i) => cell(h, i, 4, 1)).join('')}</row>`,
    ...articles.map((a, n) => {
      const r = n + 5;
      const values = [a.brand, a.code || '', a.title, a.presentation || '', sizesText(a), colorsText(a), packPrice(a), `${SITE_URL}/producto/${a.id}`];
      return `<row r="${r}">${values.map((v, i) => cell(v, i, r)).join('')}</row>`;
    }),
  ];
  const widths = [16, 10, 48, 16, 22, 34, 12, 46];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
<autoFilter ref="A4:H${articles.length + 4}"/>
</worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot; #,##0"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
</styleSheet>`;
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Lista de precios" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Lista de precios'!$A$4:$H$${articles.length + 4}</definedName></definedNames></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', sheet],
    ['xl/styles.xml', styles],
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

/** kind: "pdf" | "excel". onProgress(texto) para mostrar el avance en el botón. */
export async function downloadPriceList(kind, articles, onProgress = () => {}) {
  const list = listedArticles(articles);
  if (!list.length) throw new Error('Todavía no hay artículos con stock para armar la lista.');
  if (kind === 'excel') {
    saveBlob(buildXlsx(list), `lista-de-precios-unica-${fileDate()}.xlsx`);
    return list.length;
  }
  const blob = await buildPdf(list, (done, total) => onProgress(`Armando la lista… ${Math.round((done / total) * 100)}%`));
  saveBlob(blob, `lista-de-precios-unica-${fileDate()}.pdf`);
  return list.length;
}
