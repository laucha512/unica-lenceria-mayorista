// Validación y redimensionado de imágenes en el navegador antes de subirlas.
import { api } from '../shared/utils.js';

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const RASTER = ['image/jpeg', 'image/png', 'image/webp'];

/** Lanza un Error con mensaje legible si el archivo no es aceptable. */
export function validateFile(file, { allowSvg = false } = {}) {
  const ok = RASTER.includes(file.type) || (allowSvg && file.type === 'image/svg+xml');
  if (!ok) throw new Error(`"${file.name}": formato no permitido. Usá JPG, PNG${allowSvg ? ', SVG' : ''} o WebP.`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`"${file.name}" pesa ${(file.size / 1048576).toFixed(1)} MB: el máximo es 4 MB.`);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`"${file.name}" no se pudo leer como imagen.`));
    };
    img.src = url;
  });
}

/**
 * Redimensiona para que el lado mayor no supere `maxSize` y convierte a WebP.
 * Los SVG se rasterizan (nunca se suben SVG al servidor).
 */
export async function resizeImage(file, { maxSize = 1200, quality = 0.85 } = {}) {
  const { img, url } = await loadImage(file);
  try {
    let w = img.naturalWidth || 400;
    let h = img.naturalHeight || 400;
    const scale = Math.min(1, maxSize / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
    // Safari viejo puede no soportar WebP en toBlob: cae a JPEG.
    const out = blob && blob.type === 'image/webp' ? blob : await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (!out) throw new Error(`No se pudo procesar "${file.name}".`);
    if (out.size > MAX_FILE_BYTES) throw new Error(`"${file.name}" sigue superando 4 MB después de optimizarla.`);
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Sube un Blob ya procesado. Devuelve la URL pública (/api/images?key=...). */
export async function uploadBlob(blob, token) {
  const { url } = await api('upload', {
    method: 'POST',
    body: blob,
    raw: true,
    token,
    headers: { 'Content-Type': blob.type },
  });
  return url;
}
