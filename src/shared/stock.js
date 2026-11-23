// Stock por talle y color. Cada artículo puede tener `soldOut`: lista de combinaciones agotadas
// con la forma "talle|color" (talle o color vacíos si el artículo no tiene talles o colores).
// Lo usan el admin (para marcarlas), la tienda (para no dejar elegirlas) y el servidor (validación).

export const comboKey = (size, color) => `${size || ''}|${color || ''}`;

const bySize = (a) => Object.keys(a.colorsBySize || {}).length > 0;

/** Todas las combinaciones posibles del artículo: [{ size, color }]. */
export function combos(a) {
  const sizes = a.sizes?.length ? a.sizes : [''];
  if (bySize(a)) return sizes.flatMap((size) => (a.colorsBySize[size]?.length ? a.colorsBySize[size] : ['']).map((color) => ({ size, color })));
  const colors = a.colors?.length ? a.colors : [''];
  return sizes.flatMap((size) => colors.map((color) => ({ size, color })));
}

const soldOutSet = (a) => new Set(a.soldOut || []);

export const isSoldOut = (a, size, color) => soldOutSet(a).has(comboKey(size, color));

/** ¿Queda algún color de este talle? (o el color pedido, si se indica) */
export function sizeAvailable(a, size, color = null) {
  const out = soldOutSet(a);
  return combos(a).some((c) => c.size === size && (color == null || c.color === color) && !out.has(comboKey(c.size, c.color)));
}

/** ¿Queda algún talle con este color? (o el talle pedido, si se indica) */
export function colorAvailable(a, color, size = null) {
  const out = soldOutSet(a);
  return combos(a).some((c) => c.color === color && (size == null || c.size === size) && !out.has(comboKey(c.size, c.color)));
}

/** Talles y colores que todavía tienen alguna combinación disponible. */
export const availableSizes = (a) => (a.sizes || []).filter((s) => sizeAvailable(a, s));
export const availableColors = (a) => (a.colors || []).filter((c) => colorAvailable(a, c));

/** Cantidad de combinaciones agotadas que siguen existiendo en el artículo. */
export function soldOutCount(a) {
  const out = soldOutSet(a);
  return combos(a).filter((c) => out.has(comboKey(c.size, c.color))).length;
}
