// Fotos del tamaño justo para cada pantalla, usando el servicio de imágenes de Netlify.
// Solo se transforman fotos propias; cualquier otra dirección se devuelve tal cual.

const isOwnImage = (src) => /^\/(api\/images\?|img\/)/.test(String(src || ''));

/** Dirección de la foto a `w` píxeles de ancho (y recortada a `h` de alto, si se indica). */
export function imageUrl(src, w, h) {
  if (!isOwnImage(src)) return src;
  const crop = h ? `&h=${h}&fit=cover` : '';
  return `/.netlify/images?url=${encodeURIComponent(src)}&w=${w}${crop}`;
}

/** Valor de `srcset` con varios anchos para que el navegador baje el que necesita. */
export function imageSrcset(src, widths = [320, 480, 640, 800]) {
  if (!isOwnImage(src)) return '';
  return widths.map((w) => `${imageUrl(src, w)} ${w}w`).join(', ');
}

/** Anchos habituales de las tarjetas: 1 columna en celular, 2 en tablet y 3 o más en computadora. */
export const CARD_SIZES = '(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw';
