// Datos de contacto y condiciones comerciales: única fuente de verdad.
// Se usan en el JS del sitio y, en build, se reemplazan en el HTML
// mediante los marcadores {{WA_NUMBER}}, {{MIN_PURCHASE}}, etc. (ver vite.config.js).

export const SITE_URL = 'https://unica-lenceria-mayorista.netlify.app';

export const BUSINESS_NAME = 'ÚNICA LENCERÍA';

// WhatsApp mayorista en formato internacional (sin +, sin espacios).
export const WHATSAPP_NUMBER = '5493412591367';
export const WHATSAPP_DISPLAY = '+54 9 341 259-1367';

export const INSTAGRAM_USER = 'unicamayoristalenceria';
export const INSTAGRAM_URL = `https://instagram.com/${INSTAGRAM_USER}`;

// Compra mínima mayorista en pesos.
export const MIN_PURCHASE = 50000;

export const formatPrice = (n) => '$' + Number(n || 0).toLocaleString('es-AR');

export const MIN_PURCHASE_LABEL = formatPrice(MIN_PURCHASE);

export const whatsappLink = (text) =>
  `https://wa.me/${WHATSAPP_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
