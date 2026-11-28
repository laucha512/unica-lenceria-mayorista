// Época del año en Argentina (hemisferio sur), para que Redes publique según el clima:
// productos de la época primero, ganchos y textos pensados para el frío o el calor.
// Unas semanas antes de que empiece una época ya se toma como "la que se viene".

const AHEAD_DAYS = 28;

const CLIMATES = {
  verano: {
    name: 'Verano ☀️',
    starts: [11, 1], // 1 de diciembre (mes 0-11, día)
    keywords: ['malla', 'bikini', 'traje de bano', 'bano', 'algodon', 'top', 'body', 'musculosa', 'short', 'pareo'],
    kicker: 'ESPECIAL VERANO ☀️',
    comingKicker: 'SE VIENE EL VERANO ☀️',
    posts: [
      ['Se viene el verano: ¿tu local está listo? ☀️', 'Mallas, bikinis y prendas frescas: es la temporada que más mueve.'],
      ['Algodón en verano, siempre', 'Es fresco, deja respirar la piel y es lo que más piden con el calor.'],
      ['Temporada de mallas 👙', 'Pedí con tiempo: los talles más buscados se agotan primero.'],
      ['Colores claros para el calor', 'Blanco, nude y pasteles son los más elegidos en verano.'],
      ['Vacaciones = más ventas', 'Muchas clientas renuevan su ropa interior antes de viajar.'],
      ['Tip de verano', 'Enjuagá las mallas con agua fría después del cloro o la sal: duran mucho más.'],
    ],
  },
  otono: {
    name: 'Otoño 🍂',
    starts: [2, 1],
    keywords: ['pijama', 'media', 'conjunto', 'camiseta', 'manga larga', 'algodon'],
    kicker: 'NUEVA TEMPORADA 🍂',
    comingKicker: 'LLEGA EL OTOÑO 🍂',
    posts: [
      ['Llega el otoño: renová tu stock 🍂', 'Pijamas livianos y medias empiezan a pedirse más.'],
      ['Cambio de temporada, cambio de vidriera', 'Mostrá los colores otoñales: bordó, verde y tostado.'],
      ['Empiezan las noches frescas', 'Los pijamas de algodón son los primeros en salir.'],
      ['Preparate antes del frío', 'Las que piden con tiempo tienen todos los talles.'],
      ['Medias: el básico de la temporada', 'Se venden por pack y rotan muchísimo.'],
      ['Vuelta a la rutina', 'Conjuntos cómodos para todos los días: los que más se reponen.'],
    ],
  },
  invierno: {
    name: 'Invierno ❄️',
    starts: [5, 1],
    keywords: ['pijama', 'pantufla', 'media', 'termic', 'polar', 'peluche', 'camiseta', 'manga larga', 'bata', 'invierno'],
    kicker: 'LLEGÓ EL FRÍO ❄️',
    comingKicker: 'SE VIENE EL FRÍO ❄️',
    posts: [
      ['Llegó el frío ❄️ ¿Ya tenés stock de invierno?', 'Pijamas, pantuflas y medias térmicas: lo más pedido de la temporada.'],
      ['Medias de peluche: las más pedidas del invierno 🧦', 'Se venden solas cuando baja la temperatura.'],
      ['Pijamas para toda la familia', 'Mujer, hombre y niños: en invierno se vende todo.'],
      ['El frío vende', 'Las clientas buscan abrigo y comodidad para estar en casa.'],
      ['Tip de invierno', 'Ofrecé combos de pijama + pantuflas: son el regalo perfecto.'],
      ['Pedí antes de que se agoten los talles', 'En invierno los pijamas vuelan.'],
    ],
  },
  primavera: {
    name: 'Primavera 🌸',
    starts: [8, 1],
    keywords: ['conjunto', 'encaje', 'bombacha', 'corpino', 'top', 'body', 'algodon'],
    kicker: 'ESPECIAL PRIMAVERA 🌸',
    comingKicker: 'SE VIENE LA PRIMAVERA 🌸',
    posts: [
      ['Llegó la primavera 🌸', 'Colores claros, encaje y conjuntos livianos: renová tu vidriera.'],
      ['Primavera = conjuntos nuevos', 'Es la época en que más se renueva la ropa interior.'],
      ['Se viene el Día de la Madre 💐', 'La fecha que más vende en lencería: armá tu pedido con tiempo.'],
      ['Colores pastel, los más elegidos', 'Rosa, celeste y lila vuelven en primavera.'],
      ['Empieza el calorcito', 'Las prendas de algodón y microfibra son las que más rotan.'],
      ['Preparate para el verano', 'Las mallas se empiezan a pedir antes de lo que pensás.'],
    ],
  },
};

const ORDER = ['verano', 'otono', 'invierno', 'primavera'];

function startOf(key, year) {
  const [m, d] = CLIMATES[key].starts;
  return new Date(year, m, d);
}

/** Época actual; si falta poco para la siguiente, devuelve esa con `coming: true`. */
export function currentClimate(now = new Date()) {
  const m = now.getMonth();
  const key = m === 11 || m <= 1 ? 'verano' : m <= 4 ? 'otono' : m <= 7 ? 'invierno' : 'primavera';
  const next = ORDER[(ORDER.indexOf(key) + 1) % 4];
  let nextStart = startOf(next, now.getFullYear());
  if (nextStart < now) nextStart = startOf(next, now.getFullYear() + 1);
  const days = (nextStart - now) / 86400000;
  if (days <= AHEAD_DAYS) return { key: next, coming: true, ...CLIMATES[next] };
  return { key, coming: false, ...CLIMATES[key] };
}

const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** ¿El nombre de la subcategoría (o el artículo) es de la época? */
export function fitsClimate(text, climate = currentClimate()) {
  const t = plain(text);
  return climate.keywords.some((k) => t.includes(k));
}
