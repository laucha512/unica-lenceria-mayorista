// Avisa al servidor que esta pestaña sigue en la tienda y qué está mirando (para "En la web ahora" del admin).
// Es anónimo: un id al azar por pestaña, sin datos personales. Si la pestaña queda en segundo plano, deja de contar.

const PING_MS = 60 * 1000;

function sessionId() {
  try {
    let id = sessionStorage.getItem('unica_visita');
    if (!/^[a-z0-9]{16,32}$/.test(id || '')) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('').padEnd(16, '0');
      sessionStorage.setItem('unica_visita', id);
    }
    return id;
  } catch {
    return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('').padEnd(16, '0');
  }
}

const sid = sessionId();

function currentView() {
  const cart = document.querySelector('#cartDrawer');
  if (cart && !cart.classList.contains('hidden')) return { view: 'pedido' };
  const m = location.hash.match(/^#producto\/([\w-]{1,64})$/);
  if (m && document.body.dataset.productOpen === 'true') return { view: 'producto', productId: m[1] };
  return { view: 'tienda' };
}

function send(body) {
  fetch('/api/presence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sid, ...body }),
    keepalive: true,
  }).catch(() => {});
}

export function initPresence({ cartCount }) {
  let timer = null;
  let last = '';
  const ping = (force = false) => {
    if (document.visibilityState !== 'visible') return;
    const body = { ...currentView(), cart: cartCount() };
    const key = JSON.stringify(body);
    if (!force && key === last) return; // sin cambios: espera al próximo aviso periódico
    last = key;
    send(body);
  };
  const start = () => {
    clearInterval(timer);
    ping(true);
    timer = setInterval(() => ping(true), PING_MS);
  };
  const leave = () => {
    clearInterval(timer);
    last = '';
    send({ leave: true });
  };

  // Cambios de lo que se está mirando (ficha abierta, carrito abierto): aviso al instante.
  let soon;
  const changed = () => {
    clearTimeout(soon);
    soon = setTimeout(() => ping(), 400);
  };
  new MutationObserver(changed).observe(document.body, { attributes: true, attributeFilter: ['data-product-open'] });
  const cart = document.querySelector('#cartDrawer');
  if (cart) new MutationObserver(changed).observe(cart, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('hashchange', changed);

  document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? start() : leave()));
  window.addEventListener('pagehide', leave);
  start();
}
