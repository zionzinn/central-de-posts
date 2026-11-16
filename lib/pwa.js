'use strict';
/**
 * v4.27: o service worker do app instalado (servido pelo código, como o manifesto: arquivo solto fica pra trás na
 * sincronização da pasta da nuvem). Guarda SÓ a casca da tela (html, css, js, fontes, ícone) pra abrir rápido e sem rede;
 * NUNCA guarda /api/ (o estado é sempre o do servidor) nem /auth/ ou /login. Rede primeiro: deploy novo chega na hora;
 * sem rede, abre a última casca. A versão no nome do cache troca a cada deploy e o cache velho é apagado.
 * v4.28: recebe o Web Push e abre o painel no evento ao tocar a notificação.
 */
function sw(versao) {
  return `'use strict';
const CACHE = 'bone-casca-${versao}';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('bone-casca-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const casca = u => u.origin === self.location.origin && !u.pathname.startsWith('/api/') && !u.pathname.startsWith('/auth/') && u.pathname !== '/login' && u.pathname !== '/sw.js';
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (!casca(u)) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok && res.type === 'basic' && !res.redirected) { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(r, c)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('/') : undefined)).then(m => m || Response.error())));
});
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titulo: 'B.O.N.E', corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'B.O.N.E', {
    body: d.corpo || '', tag: d.tag || undefined, renotify: !!d.tag, icon: '/icone.png', badge: '/icone.png',
    data: { url: d.url || '/' }, requireInteraction: !!d.urgente,
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (new URL(w.url).origin === self.location.origin) { w.focus(); w.postMessage({ tipo: 'abre', url }); return; }
    return self.clients.openWindow(url);
  }));
});
`;
}
module.exports = { sw };
