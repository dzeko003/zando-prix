'use strict';

/**
 * Contributions des utilisateurs — règle R7 et US-07/US-08.
 *
 * Elles vivent dans le navigateur du téléphone de leur auteur et ne sont
 * transmises nulle part : la collecte et le partage entre utilisateurs sont
 * exclus du MVP. Une contribution n'est jamais un relevé.
 */

const CLE = 'zando.contributions';

function memoire() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k)
  };
}

let stockage = memoire();
try {
  if (typeof localStorage !== 'undefined' && localStorage) stockage = localStorage;
} catch { /* navigation privée, stockage bloqué : on reste en mémoire */ }

/** Pour les tests hors navigateur. */
export function utiliserStockage(s) { stockage = s; }

export function lire() {
  try {
    const brut = stockage.getItem(CLE);
    const liste = brut ? JSON.parse(brut) : [];
    return Array.isArray(liste) ? liste : [];
  } catch { return []; }
}

function ecrire(liste) {
  try { stockage.setItem(CLE, JSON.stringify(liste)); return true; }
  catch { return false; }
}

/** Les plus récentes d'abord. */
export function pourProduit(id) {
  return lire()
    .filter(c => c.produit === id)
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

/**
 * R7 — plus de 50 % d'écart avec le dernier relevé du même marché.
 * Si ce marché n'a pas de relevé, il n'y a rien à comparer : pas de mention.
 */
export function ecartImportant(prix, reference) {
  if (!reference || reference <= 0) return false;
  return Math.abs(prix - reference) > reference * 0.5;
}

/**
 * US-07 — le refus silencieux est interdit : on dit toujours ce qui manque.
 * R2 — francs CFA, sans décimale.
 */
export function valider(marche, saisie) {
  const propre = String(saisie ?? '').replace(/[\s  ]/g, '');
  const manques = [];
  if (!marche) manques.push('choisissez un marché');
  if (!propre) manques.push('saisissez un prix');
  if (manques.length) {
    return { ok: false, message: 'Pour enregistrer : ' + manques.join(' et ') + '.' };
  }
  if (!/^\d+$/.test(propre)) {
    return { ok: false, message: 'Saisissez un prix en francs, sans décimale ni lettre.' };
  }
  const prix = Number(propre);
  if (prix <= 0) return { ok: false, message: 'Le prix doit être supérieur à zéro.' };
  return { ok: true, prix };
}

export function ajouter({ produit, marche, prix, unite, date, reference }) {
  const contribution = {
    produit, marche, prix, unite, date,
    ecart_important: ecartImportant(prix, reference)
  };
  const liste = lire();
  liste.push(contribution);
  return ecrire(liste) ? contribution : null;
}
