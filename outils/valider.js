#!/usr/bin/env node
'use strict';

/**
 * Valide un fichier de prix avant déploiement.
 * Le PM édite ce fichier à la main après trois heures de marché :
 * une virgule oubliée et l'application est morte en production.
 *
 *   node outils/valider.js data/prix.json
 *   node outils/valider.js data/prix-demo.json --recette
 */

import fs from 'node:fs';
import { faireGlisserDates } from '../js/regles.js';

const fichier = process.argv[2] || 'data/prix.json';
const recette = process.argv.includes('--recette');

const erreurs = [];
const alertes = [];
const e = m => erreurs.push(m);
const a = m => alertes.push(m);

let d;
try {
  d = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  // Même traitement que l'application : en dates glissantes, le plus récent date d'hier.
  const midi = new Date(); midi.setHours(12, 0, 0, 0);
  d = faireGlisserDates(d, midi);
} catch (err) {
  console.error(`✗ ${fichier} illisible : ${err.message}`);
  process.exit(1);
}

const STATUTS = ['releve', 'pas_vu', 'instable'];
const VENTES  = ['quantite_scellee', 'mesure', 'format_variable'];
const entier  = v => Number.isInteger(v) && v > 0;

// ---- marchés
const ids = (d.marches || []).map(m => m.id);
if (ids.length !== 4) e(`4 marchés attendus, ${ids.length} trouvés`);
if (new Set(ids).size !== ids.length) e('identifiants de marché en double');
for (const m of d.marches || []) {
  const pos = m.position;
  if (!pos || typeof pos.lat !== 'number' || typeof pos.lon !== 'number') {
    e(`marché « ${m.id} » : position manquante — la détection du marché le plus proche en dépend`);
  } else if (pos.lat < -5 || pos.lat > -3.5 || pos.lon < 14.5 || pos.lon > 16) {
    e(`marché « ${m.id} » : position hors de la région de Brazzaville`);
  }
}

// ---- meta
if (!entier(d.meta?.seuil_deplacement_fcfa))
  e('meta.seuil_deplacement_fcfa manquant ou invalide — la règle R4 ne peut rien calculer');
const paires = Object.keys(d.meta?.trajets || {});
if (paires.length !== 6) e(`meta.trajets : 6 paires de marchés attendues, ${paires.length} trouvées — règle R4`);
for (const [cle, v] of Object.entries(d.meta?.trajets || {})) {
  const [a, b] = cle.split('|');
  if (!ids.includes(a) || !ids.includes(b)) e(`meta.trajets « ${cle} » : marché inconnu`);
  if ([a, b].sort().join('|') !== cle) e(`meta.trajets « ${cle} » : les marchés doivent être en ordre alphabétique`);
  if (!entier(v)) e(`meta.trajets « ${cle} » : montant invalide`);
}
if (d.meta?.dates_glissantes)
  a('dates glissantes activées — les prix ne vieillissent pas ; passer meta.dates_glissantes à false avec les vrais relevés');
if (/provisoire/i.test(d.meta?.source_prix || ''))
  a('les prix sont marqués « provisoire » — à remplacer par les relevés terrain');

// ---- produits
const aujourdhui = new Date(); aujourdhui.setHours(12, 0, 0, 0);
const vus = new Set();
let renseignees = 0, pasVues = 0;
const fraicheur = { vert: 0, orange: 0, perime: 0, incertain: 0 };

for (const p of d.produits || []) {
  const ou = `produit « ${p.id || '?'} »`;
  if (!p.id || vus.has(p.id)) e(`${ou} : identifiant manquant ou en double`);
  vus.add(p.id);
  if (!p.nom) e(`${ou} : nom affiché manquant`);
  if (!p.unite_reference) e(`${ou} : unité de référence manquante — règle R1`);
  if (!VENTES.includes(p.maniere_de_vendre)) e(`${ou} : manière de vendre invalide`);
  if (!Array.isArray(p.autres_noms) || !p.autres_noms.length) a(`${ou} : aucun autre nom — US-03 en souffrira`);

  for (const id of ids) {
    const r = p.releves?.[id];
    const cas = `${ou}, marché « ${id} »`;
    if (!r) { e(`${cas} : case absente`); continue; }
    if (!STATUTS.includes(r.statut)) { e(`${cas} : statut « ${r.statut} » inconnu`); continue; }
    if (!r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) { e(`${cas} : date manquante ou mal formée — règle R1`); continue; }

    if (r.statut === 'releve') {
      if (!entier(r.prix)) e(`${cas} : prix manquant ou non entier`);
      if (!r.mot_vendeuse) e(`${cas} : mot employé par la vendeuse manquant`);
      renseignees++;
    } else if (r.statut === 'instable') {
      if (!entier(r.prix_min) || !entier(r.prix_max)) e(`${cas} : fourchette incomplète`);
      else if (r.prix_min >= r.prix_max) e(`${cas} : fourchette incohérente (${r.prix_min} ≥ ${r.prix_max})`);
      if (r.prix !== undefined) e(`${cas} : un prix instable porte une fourchette, pas un prix`);
      renseignees++;
    } else {
      if (r.prix !== undefined) e(`${cas} : « pas vu ce jour » ne peut pas porter de prix`);
      pasVues++;
    }

    const jours = Math.floor((aujourdhui - new Date(r.date + 'T12:00:00')) / 86400000);
    if (jours < 0) {
      if (recette) fraicheur.incertain++;
      else e(`${cas} : date dans le futur (${r.date})`);
    } else if (r.statut !== 'pas_vu') {
      if (jours < 7) fraicheur.vert++;
      else if (jours <= 14) fraicheur.orange++;
      else fraicheur.perime++;
    }
  }
}

// ---- rapport
const total = vus.size * ids.length;
console.log(`\n${fichier}`);
console.log(`  couverture   ${renseignees}/${total} cases renseignées, ${pasVues} « pas vu ce jour »`);
console.log(`  fraîcheur    ${fraicheur.vert} vert · ${fraicheur.orange} orange · ${fraicheur.perime} périmé` +
            (fraicheur.incertain ? ` · ${fraicheur.incertain} date incertaine` : ''));
console.log(`  seuil R4     ${d.meta?.seuil_deplacement_fcfa} F`);

if (!recette && fraicheur.orange + fraicheur.perime > 0)
  a(`${fraicheur.orange + fraicheur.perime} prix ne sont plus verts — relance le générateur avant la démo, sinon ni badge ni écart utile`);

for (const m of alertes) console.log(`  ⚠ ${m}`);
for (const m of erreurs) console.log(`  ✗ ${m}`);

console.log(erreurs.length ? `\n✗ ${erreurs.length} erreur(s) — ne pas déployer\n` : `\n✓ fichier valide\n`);
process.exit(erreurs.length ? 1 : 0);
