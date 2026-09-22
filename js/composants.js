'use strict';

/**
 * Morceaux d'interface réutilisés par plusieurs écrans.
 * Chaque fonction renvoie une chaîne HTML ; aucune ne touche au DOM.
 */

import { fcfa, joursEcoules, libelleJours } from './regles.js';
import { MAINTENANT, produit, marche } from './etat.js';
import { esc, ic } from './html.js';

/** Marge du haut qui tient compte de l'encoche des téléphones. */
export const HAUT = 'pt-[calc(env(safe-area-inset-top)+14px)]';

/**
 * En-tête des écrans secondaires : bouton retour, titre centré, action à droite.
 * `action` remplace la case vide qui équilibre le bouton retour ; `classe` s'ajoute
 * à l'en-tête (ex. une largeur plus grande sur grand écran).
 */
export function enTetePage({ titre, action = '<span class="size-11 shrink-0"></span>', sousTitre = '', classe = '' }) {
  return `<header class="bg-gradient-to-b from-vert-100 to-fond px-4 ${sousTitre ? 'pb-5' : 'pb-2'} ${HAUT} md:mx-auto md:mt-4 md:max-w-2xl md:rounded-hero md:px-6 md:pt-6 ${classe}">
    <div class="flex items-center gap-3">
      <a href="/" class="bouton-rond" aria-label="Retour">${ic('retour')}</a>
      <h1 class="flex-1 text-center text-[1.1rem] font-semibold tracking-tight">${titre}</h1>
      ${action}
    </div>
    ${sousTitre}
  </header>`;
}

export const lienCalcul = `<a href="/calcul" class="inline-flex items-center gap-1 text-[0.8rem] font-semibold text-gris hover:text-encre">${ic('question', 'size-4')} Comment c’est calculé</a>`;

/**
 * Carte de verdict, commune à la fiche produit et au panier.
 * `titre` et `note` sont du HTML déjà échappé ; `pied` s'ajoute sous la note.
 */
export function carteVerdict({ icone, pastille, chapeau, titre, note, positif = false }, pied = '') {
  return `<div class="carte flex gap-3.5 p-4 ${positif ? 'bg-vert-50 ring-vert-300' : ''}">
    <span class="grid size-11 shrink-0 place-items-center rounded-full ${pastille}">${ic(icone)}</span>
    <div class="min-w-0">
      <p class="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-gris-clair">${chapeau}</p>
      <p class="mt-0.5 text-[1.05rem] font-semibold leading-snug">${titre}</p>
      <p class="mt-1 text-[0.8rem] leading-relaxed text-gris">${note}</p>
      ${pied}
    </div>
  </div>`;
}

/* Vignettes : alt vide, le nom est toujours écrit juste à côté. */
export function tuileMarche(m) {
  return `<img src="/images/marches/${esc(m.id)}-vignette.webp" alt="" width="88" height="88" loading="lazy" decoding="async"
      class="size-11 shrink-0 rounded-xl bg-vert-100 object-cover">`;
}

export function vignetteProduit(p) {
  return `<img src="/images/produits/${esc(p.id)}-vignette.webp" alt="" width="88" height="88" loading="lazy" decoding="async"
             class="size-11 shrink-0 rounded-xl bg-vert-100 object-cover">`;
}

/** Un prix proposé par l'utilisateur. `avecProduit` : pour la liste « Mes prix », qui mélange les produits. */
export function ligneContribution(c, avecProduit = false) {
  const m = marche(c.marche);
  const p = produit(c.produit);
  const j = joursEcoules(c.date, MAINTENANT);
  const alerte = c.ecart_important ? ` · <span class="pastille bg-ocre-pale py-0.5 text-ocre">écart important, à vérifier</span>` : '';
  const visuel = avecProduit && p
    ? `<img src="/images/produits/${p.id}-vignette.webp" alt="" loading="lazy" class="size-11 shrink-0 rounded-xl object-cover">`
    : (m ? tuileMarche(m) : '');
  return `<div class="flex items-center gap-3 py-3">
    ${visuel}
    <div class="min-w-0 flex-1">
      <p class="truncate text-[0.9rem] font-semibold">${esc(avecProduit && p ? p.nom : (m ? m.nom : c.marche))}</p>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-1 text-[0.72rem] text-gris-clair">${avecProduit && m ? esc(m.nom) + ' · ' : ''}${esc(libelleJours(j))}${alerte}</p>
    </div>
    <span class="shrink-0 whitespace-nowrap text-[0.95rem] font-semibold tabular-nums text-gris">${esc(fcfa(c.prix))}</span>
  </div>`;
}
