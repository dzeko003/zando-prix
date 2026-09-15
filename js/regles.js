'use strict';

/**
 * Règles métier du PRD, isolées de l'interface.
 * Aucune dépendance au DOM : ce fichier est testable seul (outils/test-regles.js).
 *
 *   R4 écart utile · R5 badge · R6 fraîcheur · R9 dates
 */

export const JOURS_ORANGE = 7;   // R6 : en dessous, vert
export const JOURS_PERIME = 14;  // R6 : au-delà, périmé

/**
 * R9 — la date de consultation, injectable.
 * `decalage` accepte « +9 », « -3 » (jours) ou une date « 2026-09-30 ».
 * Sans elle, c'est aujourd'hui. Sert à démontrer la péremption sur les vraies données.
 */
export function aujourdhui(decalage) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  if (!decalage) return d;
  // « ?date=+9 » arrive décodé en « 9 » : on retire les espaces avant de lire.
  decalage = String(decalage).trim().replace(/\s+/g, '+');
  if (/^[+-]?\d+$/.test(decalage)) { d.setDate(d.getDate() + parseInt(decalage, 10)); return d; }
  const fixe = new Date(decalage);
  if (!isNaN(fixe)) { fixe.setHours(12, 0, 0, 0); return fixe; }
  return d;
}

export function joursEcoules(date, maintenant) {
  const d = new Date(date + 'T12:00:00');
  if (isNaN(d)) return null;
  return Math.round((maintenant - d) / 86400000);
}

/** R6 — vert / orange / périmé, plus le cas d'une horloge de téléphone fausse. */
export function fraicheur(jours) {
  if (jours === null || jours < 0) return 'incertain';
  if (jours < JOURS_ORANGE) return 'vert';
  if (jours <= JOURS_PERIME) return 'orange';
  return 'perime';
}

/** R9 — jours écoulés uniquement. Jamais de date, jamais de jour de la semaine. */
export function libelleJours(jours) {
  if (jours === null || jours < 0) return 'date incertaine, à vérifier';
  if (jours > JOURS_PERIME) return 'périmé';
  if (jours === 0) return "aujourd'hui";
  if (jours === 1) return 'hier';
  return `il y a ${jours} jours`;
}

/** Forme courte pour les cases du tableau — US-04 : la fraîcheur y figure aussi. */
export function libelleJoursCourt(jours) {
  if (jours === null || jours < 0) return 'date ?';
  if (jours > JOURS_PERIME) return 'périmé';
  if (jours === 0) return "auj.";
  if (jours === 1) return 'hier';
  return `il y a ${jours} j`;
}

/**
 * Enrichit les relevés d'un produit : jours écoulés, fraîcheur, libellés,
 * et l'ordre d'affichage de la fiche (US-01).
 *
 * Ordre : marchés comparables triés du moins cher au plus cher, puis les prix
 * écartés de la comparaison (périmés, date incertaine), puis les « prix instable »,
 * puis les « pas vu ce jour ».
 */
export function evaluerProduit(produit, marches, maintenant, meta, marcheRef) {
  const lignes = marches.map(m => {
    const r = produit.releves[m.id] || { statut: 'pas_vu', date: null };
    const jours = r.date ? joursEcoules(r.date, maintenant) : null;
    const etat = fraicheur(jours);
    return {
      marche: m,
      statut: r.statut,
      prix: r.prix ?? null,
      prix_min: r.prix_min ?? null,
      prix_max: r.prix_max ?? null,
      mot: r.mot_vendeuse || null,
      jours,
      etat,
      libelle: libelleJours(jours),
      libelleCourt: libelleJoursCourt(jours),
      // R6 : un prix périmé est exclu de toute comparaison. Orange y reste.
      comparable: r.statut === 'releve' && (etat === 'vert' || etat === 'orange'),
      recent: r.statut === 'releve' && etat === 'vert'
    };
  });

  const rang = l => l.statut === 'pas_vu' ? 3 : l.statut === 'instable' ? 2 : l.comparable ? 0 : 1;
  lignes.sort((a, b) => {
    const ra = rang(a), rb = rang(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.prix - b.prix;
    return 0;
  });

  return { lignes, badge: badge(lignes), ecartUtile: ecartUtile(lignes, meta, marcheRef) };
}

/**
 * Prix d'un aller-retour entre deux marchés. À défaut de relevé pour cette
 * paire, on retombe sur le seuil général — jamais sur une valeur inventée.
 */
export function coutTrajet(a, b, meta) {
  if (a === b) return 0;
  const cle = [a, b].sort().join('|');
  const releve = meta.trajets && meta.trajets[cle];
  return Number.isInteger(releve) ? releve : meta.seuil_deplacement_fcfa;
}

/**
 * R5 — « le moins cher relevé ».
 * Au moins deux marchés relevés depuis moins de 7 jours, écart strictement
 * positif, marché non instable. Jamais sur un périmé, un « pas vu » ou une
 * contribution. Égalité au prix le plus bas : pas de badge.
 */
export function badge(lignes) {
  const eligibles = lignes.filter(l => l.recent).sort((a, b) => a.prix - b.prix);
  if (eligibles.length < 2) return null;
  if (eligibles[0].prix >= eligibles[1].prix) return null;
  return eligibles[0].marche.id;
}

/**
 * R4 — écart utile.
 * Évaluable seulement si au moins trois marchés sur quatre ont un relevé
 * de moins de 7 jours pour ce produit. Les marchés instables en sont exclus.
 *
 * Avec un marché de départ connu, l'écart se mesure depuis ce marché et le
 * seuil est le prix de ce trajet précis. Sans lui, on retombe sur l'écart
 * entre le plus cher et le moins cher, comparé au seuil général — utile,
 * mais moins juste : c'est pourquoi l'interface demande le marché de départ.
 */
export function ecartUtile(lignes, meta, marcheRef) {
  const recents = lignes.filter(l => l.recent);
  if (recents.length < 3) return { evaluable: false };

  const moinsCher = recents.reduce((a, b) => (b.prix < a.prix ? b : a));

  if (marcheRef) {
    const mien = recents.find(l => l.marche.id === marcheRef);
    if (mien && moinsCher.marche.id === marcheRef) {
      return { evaluable: true, surPlace: true, vaut: false, depuis: mien.marche, marche: mien.marche,
               ecart: 0, seuil: 0 };
    }
    if (mien) {
      const ecart = mien.prix - moinsCher.prix;
      const seuil = coutTrajet(marcheRef, moinsCher.marche.id, meta);
      return { evaluable: true, vaut: ecart > seuil, ecart, seuil,
               marche: moinsCher.marche, depuis: mien.marche };
    }
    // Pas de relevé récent dans son marché : on ne peut pas partir de son prix.
  }

  const prix = recents.map(l => l.prix);
  const ecart = Math.max(...prix) - Math.min(...prix);
  return { evaluable: true, vaut: ecart > meta.seuil_deplacement_fcfa,
           ecart, seuil: meta.seuil_deplacement_fcfa, marche: moinsCher.marche, general: true };
}

/** US-03 — espaces, tirets, majuscules et accents ignorés. */
export function normaliser(texte) {
  return (texte || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s\-']/g, '');
}

/** US-03 — recherche sur le nom affiché et sur la liste des autres noms. */
export function chercher(produits, saisie) {
  const q = normaliser(saisie);
  if (!q) return produits;
  return produits.filter(p =>
    [p.nom, ...(p.autres_noms || [])].some(n => normaliser(n).includes(q))
  );
}

/** R2 — francs CFA, sans décimale. */
export function fcfa(n) {
  return new Intl.NumberFormat('fr-FR').format(n) + ' F';
}
