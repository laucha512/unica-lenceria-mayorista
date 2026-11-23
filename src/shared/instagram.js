// Usuario de Instagram: de lo que escribe el admin ("@usuario", "usuario" o el link completo) al usuario solo.
// Lo usan el admin (vista previa) y el servidor (validación).

/** "@Unica.Mayorista", "instagram.com/unica.mayorista/?hl=es" → "unica.mayorista". '' si no es válido. */
export function normalizeInstagram(input) {
  const raw = String(input ?? '').trim().replace(/^https?:\/\//i, '');
  const isProfileLink = /^(www\.)?instagram\.com\//i.test(raw);
  if (!isProfileLink && /[/:]/.test(raw)) return ''; // link de otra página
  const user = raw
    .replace(/^(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(user) && !/^\.|\.$|\.\./.test(user) ? user : '';
}

export const instagramUrlOf = (user) => `https://instagram.com/${user}`;
