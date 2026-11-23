// Avisos al celular (notificaciones push) para el admin.
// Las claves de los avisos (VAPID) se crean solas la primera vez y se guardan en un store privado de Blobs:
// no hace falta configurar nada en Netlify. Las suscripciones (cada celular o compu que activó los avisos)
// se guardan en el mismo store.
import { getStore } from '@netlify/blobs';
import { generateVAPIDKeys, sendNotification, setVapidDetails } from 'web-push';
import { SITE_URL } from '../../src/config.js';

const privateStore = () => getStore({ name: 'private', consistency: 'strong' });
const KEYS = 'avisos-claves';
const SUBS = 'avisos-suscripciones';
const MAX_SUBS = 20;

export async function vapidKeys() {
  const store = privateStore();
  let keys = await store.get(KEYS, { type: 'json' });
  if (!keys) {
    await store.setJSON(KEYS, generateVAPIDKeys(), { onlyIfNew: true });
    keys = await store.get(KEYS, { type: 'json' });
  }
  return keys;
}

export async function listSubscriptions() {
  return (await privateStore().get(SUBS, { type: 'json' })) || [];
}

async function saveSubscriptions(mutate) {
  const store = privateStore();
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await store.getWithMetadata(SUBS, { type: 'json' });
    const next = mutate(current?.data || []);
    const res = current ? await store.setJSON(SUBS, next, { onlyIfMatch: current.etag }) : await store.setJSON(SUBS, next, { onlyIfNew: true });
    if (res.modified !== false) return next;
  }
  throw new Error('No se pudieron guardar los avisos.');
}

export const addSubscription = (sub, device) =>
  saveSubscriptions((list) => [{ ...sub, device, addedAt: new Date().toISOString() }, ...list.filter((s) => s.endpoint !== sub.endpoint)].slice(0, MAX_SUBS));

export const removeSubscription = (endpoint) => saveSubscriptions((list) => list.filter((s) => s.endpoint !== endpoint));

/**
 * Manda un aviso a todos los dispositivos (o solo a `onlyEndpoint`). Los que ya no existen se borran.
 * payload: { title, body, url, tag }
 */
export async function sendPush(payload, { onlyEndpoint = null } = {}) {
  const subs = (await listSubscriptions()).filter((s) => !onlyEndpoint || s.endpoint === onlyEndpoint);
  if (!subs.length) return { sent: 0 };
  const { publicKey, privateKey } = await vapidKeys();
  setVapidDetails(SITE_URL, publicKey, privateKey);
  const gone = [];
  let sent = 0;
  await Promise.all(
    subs.map(async ({ endpoint, keys }) => {
      try {
        await sendNotification({ endpoint, keys }, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: 'high' });
        sent++;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(endpoint);
        else console.warn('No se pudo enviar un aviso:', err?.statusCode || err?.message);
      }
    })
  );
  if (gone.length) await saveSubscriptions((list) => list.filter((s) => !gone.includes(s.endpoint)));
  return { sent };
}
