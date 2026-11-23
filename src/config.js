// Datos de contacto y condiciones comerciales.
// Se usan en el JS del sitio y, en build, se reemplazan en el HTML
// mediante los marcadores {{WA_NUMBER}}, {{IG_USER}}, etc. (ver vite.config.js).
// El WhatsApp se edita desde el admin (Contacto & WhatsApp); estos valores son el respaldo inicial.

export const SITE_URL = 'https://unicamayoristalenceria.com.ar';

export const BUSINESS_NAME = 'ÚNICA LENCERÍA';

// WhatsApp mayorista en formato internacional (sin +, sin espacios).
export const WHATSAPP_NUMBER = '5493412591367';
export const WHATSAPP_DISPLAY = '+54 9 341 259-1367';

export const INSTAGRAM_USER = 'unicamayoristalenceria';
export const INSTAGRAM_URL = `https://instagram.com/${INSTAGRAM_USER}`;

export const formatPrice = (n) => '$' + Number(n || 0).toLocaleString('es-AR');

// Contacto vigente: arranca con los de arriba y se reemplaza por lo guardado en el admin (Contacto & WhatsApp).
const whatsapp = { number: WHATSAPP_NUMBER, display: WHATSAPP_DISPLAY };
let instagram = INSTAGRAM_USER;

export function setContact({ whatsappNumber, whatsappDisplay, instagramUser } = {}) {
  if (/^\d{11,15}$/.test(String(whatsappNumber || ''))) whatsapp.number = whatsappNumber;
  if (whatsappDisplay) whatsapp.display = whatsappDisplay;
  if (/^[a-z0-9._]{1,30}$/.test(String(instagramUser || ''))) instagram = instagramUser;
}

export const whatsappNumber = () => whatsapp.number;
export const whatsappDisplay = () => whatsapp.display;
export const instagramUser = () => instagram;
export const instagramUrl = () => `https://instagram.com/${instagram}`;

export const whatsappLink = (text) =>
  `https://wa.me/${whatsapp.number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
