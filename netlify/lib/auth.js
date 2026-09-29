// Token firmado con HMAC-SHA256 (ADMIN_SECRET). Formato: base64url(payload).base64url(firma)
import { createHmac, timingSafeEqual } from 'node:crypto';

export const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

function secret() {
  const s = process.env.ADMIN_SECRET;
  if (!s || s.length < 32) throw new Error('ADMIN_SECRET no está configurado (mínimo 32 caracteres).');
  return s;
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => createHmac('sha256', secret()).update(data).digest();

export function createToken(now = Date.now()) {
  const payload = b64url(JSON.stringify({ sub: 'admin', iat: now, exp: now + TOKEN_TTL_MS }));
  return { token: `${payload}.${b64url(sign(payload))}`, expiresAt: now + TOKEN_TTL_MS };
}

export function verifyToken(token) {
  if (typeof token !== 'string' || token.length > 512) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  let expected;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.sub === 'admin' && Number(data.exp) > Date.now() ? data : null;
  } catch {
    return null;
  }
}

/** Comparación en tiempo constante de la contraseña (vía HMAC para igualar longitudes). */
export function passwordMatches(given) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) throw new Error('ADMIN_PASSWORD no está configurado.');
  const a = sign(`pw:${String(given)}`);
  const b = sign(`pw:${real}`);
  return timingSafeEqual(a, b);
}
