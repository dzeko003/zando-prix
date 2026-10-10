'use strict';

/**
 * Point d'entrée : charge les prix, puis affiche l'écran demandé par l'URL.
 *
 *   js/etat.js          données chargées, règles appliquées, point de départ
 *   js/vues/*.js        un fichier par écran, chacun exporte rendreXxx(vue, param)
 *   js/composants.js    morceaux d'interface partagés entre écrans
 *   js/navigation.js    barres de navigation autour des écrans
 *   js/position.js      géolocalisation côté interface
 *   js/regles.js, panier.js, contributions.js, geo.js, prefs.js
 *                       règles métier, sans DOM, couvertes par les tests d'outils/
 */

import { aujourdhui, faireGlisserDates } from './regles.js';
import { initialiser, produit } from './etat.js';
import { $ } from './html.js';
import { naviguer, marquerOnglet, majBarreDepart, majPastillePanier } from './navigation.js';
import { rendreAccueil } from './vues/accueil.js';
import { rendreProduit } from './vues/produit.js';
import { rendreCarte, quitterCarte } from './vues/carte.js';
import { rendrePanier } from './vues/panier.js';
import { rendreMesPrix } from './vues/mes-prix.js';
import { rendreCalcul } from './vues/calcul.js';
import { rendreMonMarche } from './vues/mon-marche.js';

/*
 * Écrans, par premier segment du chemin (/produit/riz-sac → 'produit', param 'riz-sac').
 * `onglet` : l'onglet de navigation à surligner.
 */
const ROUTES = {
  '':           { onglet: 'accueil',    rendre: rendreAccueil },
  'produit':    { onglet: 'accueil',    rendre: (vue, id) => rendreProduit(vue, produit(id)) },
  'carte':      { onglet: 'carte',      rendre: rendreCarte },
  'panier':     { onglet: 'panier',     rendre: rendrePanier },
  'mes-prix':   { onglet: 'mes-prix',   rendre: rendreMesPrix },
  'mon-marche': { onglet: 'mon-marche', rendre: rendreMonMarche },
  'calcul':     { onglet: 'calcul',     rendre: rendreCalcul }
};

async function demarrer() {
  const decalage = new URLSearchParams(location.search).get('date');

  let fichier;
  try {
    const r = await fetch('/data/prix.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    fichier = await r.json();
    if (!fichier.produits?.length) throw new Error('fichier vide');
  } catch (err) {
    // US-02 : jamais de page vide ou bloquée
    $('#chargement').hidden = true;
    $('#erreur').hidden = false;
    console.error('[zando] prix indisponibles :', err.message);
    return;
  }

  initialiser(faireGlisserDates(fichier, aujourdhui()), aujourdhui(decalage));
  $('#chargement').hidden = true;
  $('#app').hidden = false;
  $('#nav').hidden = false;
  $('#barre').hidden = false;

  if (decalage) {
    const b = $('#banniere-date');
    b.textContent = `Date de consultation décalée (${decalage}) — recette de la règle R6`;
    b.hidden = false;
  }

  addEventListener('online', etatReseau);
  addEventListener('offline', etatReseau);
  addEventListener('popstate', router);
  document.addEventListener('click', suivreLien);
  etatReseau();
  router();
  enregistrerServiceWorker();
}

function router() {
  quitterCarte();
  if (redirigerAncienneAdresse()) return;
  let [route, param] = decodeURIComponent(location.pathname).replace(/^\/+/, '').split('/');

  // route inconnue, ou produit inexistant : accueil
  if (!Object.hasOwn(ROUTES, route) || (route === 'produit' && !produit(param))) route = '';

  const { onglet, rendre } = ROUTES[route];
  rendre($('#vue'), param);
  marquerOnglet(onglet);
  majBarreDepart();
  majPastillePanier();
  window.scrollTo(0, 0);
}

/*
 * Anciennes adresses à dièse, encore dans les favoris et les liens partagés :
 * « /#/carte » → « /carte », « /#charbon » → « /produit/charbon ».
 */
function redirigerAncienneAdresse() {
  const ancien = location.hash.replace(/^#\/?/, '');
  if (!ancien) return false;
  naviguer(produit(ancien) ? '/produit/' + ancien : '/' + ancien, { remplacer: true });
  return true;
}

/* Un clic sur un lien vers un écran change l'adresse sans recharger la page. */
function suivreLien(e) {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target || a.origin !== location.origin) return;
  const route = decodeURIComponent(a.pathname).split('/')[1];
  if (!Object.hasOwn(ROUTES, route)) return;   // un fichier (image, PDF…) : le navigateur s'en charge
  e.preventDefault();
  if (a.pathname !== location.pathname) naviguer(a.pathname);   // déjà sur cet écran : rien à faire
}

function etatReseau() {
  $('#hors-ligne').hidden = navigator.onLine !== false;
}

function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Une nouvelle version prend la main : la page tourne encore avec l'ancien code, on recharge une fois.
  // À la première visite il n'y avait pas de contrôleur : rien à rafraîchir.
  const dejaControlee = !!navigator.serviceWorker.controller;
  let rechargee = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!dejaControlee || rechargee) return;
    rechargee = true;
    location.reload();
  });
  navigator.serviceWorker.register('/sw.js').catch(e => console.warn('[zando] sw :', e.message));
}

demarrer();
