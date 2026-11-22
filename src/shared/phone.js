// Número de WhatsApp: de lo que escribe el admin al formato de wa.me (solo dígitos, con código de país).
// Lo usan el admin (vista previa) y el servidor (validación), así ambos dan el mismo resultado.

/**
 * "+54 9 341 259-1367" → "5493412591367"; "341 259-1367" o "0341 259-1367" → "5493412591367".
 * Devuelve '' si no se puede armar un número válido (por ejemplo, si incluye el 15).
 */
export function normalizeWhatsapp(input) {
  const raw = String(input ?? '').trim();
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (!raw.startsWith('+') && !d.startsWith('54')) {
    if (d.startsWith('0')) d = d.slice(1);
    if (d.length !== 10) return '';
    d = `549${d}`;
  }
  if (d.startsWith('54') && !d.startsWith('549') && d.length === 12) d = `549${d.slice(2)}`;
  return /^\d{11,15}$/.test(d) ? d : '';
}

// Códigos de área de Argentina de 3 cifras (el 11 es de 2; el resto, de 4). Solo afecta cómo se ve.
const AREA_3 = new Set(
  '220 221 223 230 236 237 249 260 261 263 264 266 280 291 294 297 298 299 336 341 342 343 345 348 351 353 358 362 364 370 376 379 380 381 383 385 387 388'.split(' ')
);

/**
 * Número de WhatsApp en formato internacional fácil de leer:
 * "341 720 3083" → "+54 9 341 720-3083"; "11 2345 6789" → "+54 9 11 2345-6789".
 * Devuelve '' si no es un número válido.
 */
export function formatWhatsapp(input) {
  const d = normalizeWhatsapp(input);
  if (!d) return '';
  if (!(d.startsWith('549') && d.length === 13)) return `+${d}`; // otro país: se muestra completo
  const rest = d.slice(3); // código de área + número, 10 cifras
  const areaLen = rest.startsWith('11') ? 2 : AREA_3.has(rest.slice(0, 3)) ? 3 : 4;
  const area = rest.slice(0, areaLen);
  const local = rest.slice(areaLen);
  return `+54 9 ${area} ${local.slice(0, -4)}-${local.slice(-4)}`;
}
