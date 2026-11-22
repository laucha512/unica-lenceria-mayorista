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
