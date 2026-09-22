'use strict';

/**
 * Navigation entre écrans, et éléments permanents autour d'eux (index.html) : les deux
 * barres de navigation (bas sur mobile, haut sur grand écran), le point de départ et
 * la pastille du panier.
 *
 * Les adresses sont de vrais chemins (/carte, /produit/riz-sac) gérés par l'History API ;
 * app.js écoute `popstate` et affiche l'écran correspondant.
 */

import { compte as comptePanier } from './panier.js';
import { departMarche, libelleDepart } from './etat.js';
import { $ } from './html.js';

/* Le paramètre ?date= de la recette suit l'utilisateur d'un écran à l'autre. */
const adresse = chemin => chemin + location.search;

/** Ouvre un écran : naviguer('/carte'), naviguer('/produit/riz-sac'). */
export function naviguer(chemin, { remplacer = false } = {}) {
  history[remplacer ? 'replaceState' : 'pushState'](null, '', adresse(chemin));
  redessiner();
}

/** Change l'adresse affichée sans redessiner l'écran (ex. produit choisi sur la carte). */
export function remplacerAdresse(chemin) {
  history.replaceState(null, '', adresse(chemin));
}

/** Redessine l'écran courant, par exemple après un changement de point de départ. */
export function redessiner() {
  dispatchEvent(new PopStateEvent('popstate'));
}

/** Surligne l'onglet de l'écran courant. */
export function marquerOnglet(actif) {
  document.querySelectorAll('[data-nav] a[data-route]').forEach(a => {
    const courant = a.dataset.route === actif;
    a.classList.toggle('bg-vert-500', courant);
    a.classList.toggle('bg-white', !courant);
    if (courant) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

/** Point de départ affiché dans la barre du haut (grand écran). */
export function majBarreDepart() {
  const el = $('#barre-depart');
  if (!el) return;
  const d = departMarche();
  el.textContent = d ? libelleDepart(d, 'le ' + d.marche.nom) : 'Choisir mon point de départ';
}

/** Pastille de l'onglet Panier : quantités cumulées. */
export function majPastillePanier() {
  const { articles } = comptePanier();
  document.querySelectorAll('[data-panier-compte]').forEach(el => {
    el.textContent = articles > 99 ? '99+' : String(articles);
    el.hidden = articles === 0;
  });
}
