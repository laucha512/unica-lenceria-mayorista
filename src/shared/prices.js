// Cambio de precios en bloque: la misma cuenta en el admin (vista previa) y en el servidor (al aplicar).

export const ROUND_OPTIONS = [0, 10, 50, 100, 500, 1000];

/** Precio con el porcentaje aplicado y redondeado al múltiplo elegido (0 = sin redondeo). */
export function applyPercent(price, percent, round = 0) {
  const p = Number(price) || 0;
  if (!p) return 0;
  const raw = p * (1 + Number(percent) / 100);
  const r = ROUND_OPTIONS.includes(Number(round)) ? Number(round) : 0;
  const value = r ? Math.round(raw / r) * r : Math.round(raw);
  return Math.max(0, value);
}
