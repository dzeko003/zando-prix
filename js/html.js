'use strict';

/**
 * Petits outils d'affichage partagés par tous les écrans.
 * Aucun état, aucune donnée : uniquement du formatage et de l'échappement.
 */

export const $ = (s, racine = document) => racine.querySelector(s);

/** Échappe une valeur avant de l'insérer dans un gabarit HTML. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Icône du sprite Lucide déclaré dans index.html. */
export const ic = (nom, cls = 'size-5') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${nom}"/></svg>`;

export const nombre = n => new Intl.NumberFormat('fr-FR').format(n);

/** « 3 produits », « 1 produit ». */
export const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** Date locale au format AAAA-MM-JJ. */
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Distance ou précision GPS : « 25 m », « 1,4 km ». */
export const metres = m => (m < 1000 ? `${Math.max(5, Math.round(m / 5) * 5)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

export const coordonnees = p => `${p.lat.toFixed(5).replace('.', ',')} ; ${p.lon.toFixed(5).replace('.', ',')}`;

/** Âge d'un relevé en version courte, pour les cellules du tableau. */
export function joursCourt(j) {
  if (j === null || j < 0) return 'date ?';
  if (j > 14) return 'périmé';
  if (j === 0) return 'auj.';
  if (j === 1) return 'hier';
  return `${j} j`;
}

/* Les mots du marché, accordés : « au sac », « au tas », « à la mesure », « à la boîte ». */
const FEMININS = new Set(['mesure', 'boîte', 'bouteille', 'boule', 'cuvette', 'botte']);
export const auUnite = mot => (FEMININS.has(mot) ? 'à la ' : 'au ') + mot;
