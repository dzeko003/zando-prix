'use strict';

/**
 * Coquille d'application hors ligne — US-09.
 * L'accueil complet (styles, code, police, en-tête, vignettes) est mis en cache
 * à l'installation ; les grandes photos et Leaflet le sont à la première consultation.
 * Les prix sont toujours redemandés au réseau d'abord, pour qu'une version en cache
 * ne serve jamais indéfiniment des relevés que le PM a déjà remplacés.
 * Les fonds de carte, d'un autre domaine, ne passent pas par ce cache.
 */

const VERSION = 'zando-25dabce3f7';

const PRODUITS = ['riz-sac', 'riz-detail', 'foufou', 'haricot', 'sucre', 'huile', 'oeufs',
                  'mpiodi-carton', 'mpiodi-detail', 'kwanga', 'saka-saka', 'charbon'];

const COQUILLE = [
  './', 'index.html', 'manifest.json',
  'css/style.css',
  'js/app.js', 'js/regles.js', 'js/contributions.js', 'js/prefs.js', 'js/geo.js', 'js/carte.js', 'js/panier.js',
  'fonts/plus-jakarta-sans.woff2',
  'icones/app-192.png', 'icones/app-512.png',
  'images/marche-total.webp',
  ...PRODUITS.map(id => `images/produits/${id}-vignette.webp`),
  ...['total', 'poto-poto', 'moungali', 'ouenze'].map(id => `images/marches/${id}-vignette.webp`),
  'data/prix.json'
];

self.addEventListener('install', e => {
  // cache: 'reload' : sans lui, le navigateur peut ressortir de son cache HTTP l'ancien code,
  // et la nouvelle version mettrait en cache… l'ancienne.
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(COQUILLE.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(cles => Promise.all(cles.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function mettreEnCache(requete, reponse) {
  if (reponse.ok) {
    const copie = reponse.clone();
    caches.open(VERSION).then(c => c.put(requete, copie));
  }
  return reponse;
}

self.addEventListener('fetch', e => {
  const requete = e.request;
  if (requete.method !== 'GET') return;

  const url = new URL(requete.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.endsWith('prix.json')) {
    e.respondWith(
      fetch(requete)
        .then(r => mettreEnCache(requete, r))
        .catch(() => caches.match(requete)
          .then(r => r || new Response('', { status: 503, statusText: 'Prix indisponibles' })))
    );
    return;
  }

  if (requete.mode === 'navigate') {
    e.respondWith(fetch(requete).catch(() => caches.match('index.html')));
    return;
  }

  e.respondWith(
    caches.match(requete).then(r => r || fetch(requete).then(rep => mettreEnCache(requete, rep)))
  );
});
