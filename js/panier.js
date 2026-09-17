'use strict';

/**
 * Panier — « dans quel marché ce panier revient-il le moins cher ? »
 * Mode liste de courses, classé *Could have* au PRD.
 *
 * Aucune dépendance au DOM : ce fichier est testable seul (outils/test-panier.js).
 * Les quantités portent sur l'unité de référence du produit (R1) — 4 × « Carton entier » —
 * jamais sur un poids ni une conversion. Le panier reste dans le navigateur de son auteur.
 */

import { joursEcoules, fraicheur, coutTrajet } from './regles.js';

const CLE = 'zando.panier';
export const QTE_MAX = 99;

function memoire() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

let stockage = memoire();
try { if (typeof localStorage !== 'undefined' && localStorage) stockage = localStorage; }
catch { /* navigation privée, stockage bloqué : on reste en mémoire */ }

/** Pour les tests hors navigateur. */
export function utiliserStockage(s) { stockage = s; }

export function lire() {
  try {
    const brut = stockage.getItem(CLE);
    const liste = brut ? JSON.parse(brut) : [];
    if (!Array.isArray(liste)) return [];
    return liste.filter(l => l && typeof l.produit === 'string' && Number.isInteger(l.qte) && l.qte > 0);
  } catch { return []; }
}

function ecrire(liste) {
  try { stockage.setItem(CLE, JSON.stringify(liste)); return true; }
  catch { return false; }
}

export function quantite(produit) {
  return lire().find(l => l.produit === produit)?.qte ?? 0;
}

/** Fixe la quantité d'un produit. Zéro ou moins retire la ligne. Bornée à QTE_MAX. */
export function definir(produit, qte) {
  const liste = lire().filter(l => l.produit !== produit);
  const n = Math.min(QTE_MAX, Math.trunc(Number(qte) || 0));
  if (n > 0) liste.push({ produit, qte: n });
  return ecrire(liste) ? liste : null;
}

export function ajouter(produit, qte = 1) {
  return definir(produit, quantite(produit) + (Math.trunc(Number(qte)) || 1));
}

export function retirer(produit) { return definir(produit, 0); }

export function vider() {
  try { stockage.removeItem(CLE); return true; } catch { return false; }
}

/** Nombre de lignes et total des quantités — pour la pastille de la navigation. */
export function compte() {
  const liste = lire();
  return { lignes: liste.length, articles: liste.reduce((n, l) => n + l.qte, 0) };
}

const RAISONS = {
  pas_vu: 'pas vu ce jour',
  instable: 'prix instable',
  perime: 'prix périmé',
  incertain: 'date incertaine'
};

/**
 * Un prix n'entre dans un panier que s'il est un relevé de moins de 14 jours.
 * « Pas vu ce jour », prix instable, prix périmé ou date incertaine : le marché ne peut pas
 * fournir cette ligne. On l'écarte du classement, on ne complète jamais avec un prix
 * venu d'un autre marché ou d'une autre semaine.
 */
function releveUtilisable(r, maintenant) {
  const jours = r && r.date ? joursEcoules(r.date, maintenant) : null;
  const etat = fraicheur(jours);
  const ok = Boolean(r) && r.statut === 'releve' && (etat === 'vert' || etat === 'orange');
  return { ok, jours, etat, raison: r && r.statut !== 'releve' ? RAISONS[r.statut] : RAISONS[etat] };
}

/**
 * Évalue le panier sur les quatre marchés.
 * Seuls les marchés capables de fournir TOUT le panier sont classés : comparer deux paniers
 * différents ferait passer pour « moins cher » un marché à qui il manque un article.
 */
export function evaluerPanier(lignes, produits, marches, maintenant, meta, marcheDepart) {
  const articles = [];
  for (const l of lignes || []) {
    const produit = produits.find(p => p.id === l.produit);
    if (produit) articles.push({ produit, qte: l.qte });
  }

  const evaluations = marches.map(marche => {
    const manquants = [], details = [];
    let total = 0, aVerifier = 0, plusAncien = 0;
    for (const a of articles) {
      const r = a.produit.releves[marche.id];
      const u = releveUtilisable(r, maintenant);
      if (!u.ok) { manquants.push({ produit: a.produit, raison: u.raison }); continue; }
      total += r.prix * a.qte;
      if (u.etat === 'orange') aVerifier++;
      plusAncien = Math.max(plusAncien, u.jours);
      details.push({ produit: a.produit, qte: a.qte, prix: r.prix, sousTotal: r.prix * a.qte,
                     jours: u.jours, etat: u.etat, mot: r.mot_vendeuse || null });
    }
    return { marche, complet: articles.length > 0 && manquants.length === 0,
             total, manquants, details, aVerifier, plusAncien };
  });

  const complets = evaluations.filter(e => e.complet).sort((a, b) => a.total - b.total);
  const incomplets = evaluations.filter(e => !e.complet)
    .sort((a, b) => a.manquants.length - b.manquants.length || a.total - b.total);

  return {
    articles, complets, incomplets,
    verdict: verdict(articles, complets, meta, marcheDepart),
    aVerifier: complets.some(c => c.aVerifier > 0)
  };
}

/**
 * Le verdict reprend la logique de R4, appliquée au panier entier : on ne recommande un
 * déplacement que si l'économie dépasse le prix de l'aller-retour depuis le marché de départ.
 */
function verdict(articles, complets, meta, depart) {
  if (!articles.length) return { type: 'vide' };
  if (!complets.length) return { type: 'aucun-complet' };

  const meilleur = complets[0];
  if (!depart) return { type: 'classement', meilleur };

  const mien = complets.find(c => c.marche.id === depart);
  if (!mien) return { type: 'depart-incomplet', meilleur };
  if (mien.marche.id === meilleur.marche.id) return { type: 'sur-place', meilleur, mien };

  const ecart = mien.total - meilleur.total;
  const trajet = coutTrajet(depart, meilleur.marche.id, meta);
  const net = ecart - trajet;
  return { type: net > 0 ? 'vaut' : 'ne-vaut-pas', meilleur, mien, ecart, trajet, net };
}
