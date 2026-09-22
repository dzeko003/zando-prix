'use strict';

/**
 * État partagé par tous les écrans : le fichier de prix, la date de consultation,
 * les règles appliquées à chaque produit et le point de départ de l'utilisateur.
 *
 * `donnees` et `MAINTENANT` sont en lecture seule pour les écrans : seul
 * `initialiser` les écrit, et les imports ES les voient à jour.
 */

import { evaluerProduit } from './regles.js';
import { departComplet, definirMarcheDepart } from './prefs.js';
import { distanceLisible } from './geo.js';

export let donnees = null;       // le fichier data/prix.json
export let MAINTENANT = null;    // date de consultation (R9), décalable pour la recette
const evaluations = new Map();   // id produit → règles appliquées (evaluerProduit)

export function initialiser(fichier, maintenant) {
  donnees = fichier;
  MAINTENANT = maintenant;
  evaluerTout();
}

/* Le point de départ change l'écart utile de chaque produit : on réévalue tout. */
function evaluerTout() {
  const depart = departComplet()?.id ?? null;
  evaluations.clear();
  for (const p of donnees.produits) {
    evaluations.set(p.id, evaluerProduit(p, donnees.marches, MAINTENANT, donnees.meta, depart));
  }
}

/** Règles appliquées à un produit : { lignes, badge, ecartUtile }. */
export const evaluation = idProduit => evaluations.get(idProduit);

/** Le produit vaut-il le déplacement (ou, sans départ, présente-t-il un écart utile) ? */
export function vaut(p) {
  const e = evaluation(p.id).ecartUtile;
  return e.evaluable && e.vaut;
}

export const produit = id => donnees.produits.find(p => p.id === id);
export const marche = id => donnees.marches.find(m => m.id === id);

/* ------------------------------------------------------------ point de départ */

/** { id, source, km, marche } ou null si aucun départ connu. */
export function departMarche() {
  const d = departComplet();
  const m = d && marche(d.id);
  return m ? { ...d, marche: m } : null;
}

/** Change (ou efface, avec `null`) le point de départ, puis réévalue les produits. */
export function changerDepart(id, source = 'choix', km = null) {
  definirMarcheDepart(id, source, km);
  evaluerTout();
}

/** « Depuis Poto-Poto · 1,2 km » : le repère n'apparaît que pour un départ déduit de la position. */
export function libelleDepart(depart, nom) {
  const repere = depart.source === 'position' && depart.km != null ? ' · ' + distanceLisible(depart.km) : '';
  return `Depuis ${nom}${repere}`;
}

/* ------------------------------------------------ message entre deux écrans */

/* Un écran peut laisser un message à « Point de départ », qui l'affiche une fois. */
let messageDepart = null;
export function laisserMessageDepart(texte) { messageDepart = texte; }
export function prendreMessageDepart() {
  const m = messageDepart;
  messageDepart = null;
  return m;
}
