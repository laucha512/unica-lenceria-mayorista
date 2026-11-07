// Convierte los horarios de una sucursal al formato que entiende Google (schema.org).
// Lo usan la tienda (src/store/branches.js) y las páginas para buscadores (netlify/lib/seo-pages.js).

const DAY_NAMES = { lun: 'Monday', mar: 'Tuesday', mie: 'Wednesday', jue: 'Thursday', vie: 'Friday', sab: 'Saturday', dom: 'Sunday' };
const DAY_KEYS = Object.keys(DAY_NAMES);
const pad = (h, m) => `${h.padStart(2, '0')}:${m || '00'}`;

/** "Lun a Vie" + "9:00 a 13:00 y 16:00 a 20:00 hs" → horarios para Google. Lo que no se entiende se omite. */
export function openingHours(rows) {
  return rows.flatMap((row) => {
    const text = row.days.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const found = [...text.matchAll(/\b(lun|mar|mie|jue|vie|sab|dom)[a-z]*/g)].map((m) => m[1]);
    if (!found.length) return [];
    const isRange = found.length === 2 && /\sa\s/.test(text);
    const keys = isRange ? DAY_KEYS.slice(DAY_KEYS.indexOf(found[0]), DAY_KEYS.indexOf(found[1]) + 1) : found;
    const dayOfWeek = keys.map((k) => DAY_NAMES[k]);
    return [...row.hours.matchAll(/(\d{1,2})(?::(\d{2}))?\s*a\s*(\d{1,2})(?::(\d{2}))?/g)].map((m) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek,
      opens: pad(m[1], m[2]),
      closes: pad(m[3], m[4]),
    }));
  });
}
