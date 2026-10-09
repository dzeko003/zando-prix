#!/usr/bin/env node
'use strict';

/**
 * Génère data/prix.json et data/prix-demo.json.
 *
 * data/prix.json porte les dates RÉELLES des relevés terrain (DATES_RELEVES) :
 * elles ne bougent pas d'un build à l'autre, les prix vieillissent donc
 * normalement (vert → orange → périmé, règle R6). Après un nouveau relevé,
 * mets à jour DATES_RELEVES et DATE_GENERATION.
 *
 * data/prix-demo.json reste calculé par rapport au jour où le script tourne,
 * pour que la recette exerce toujours toutes les branches de R6 et R9.
 *
 *   node outils/generer-donnees.js
 */

import fs from 'node:fs';
import path from 'node:path';

const DOSSIER = path.join(import.meta.dirname, '..', 'data');
const SEUIL_DEPLACEMENT = 2000; // F CFA — repli quand le marché de départ est inconnu : un aller-retour en taxi, 1 000 F par course au minimum

/**
 * Prix d'un aller-retour entre deux marchés, en F CFA.
 * Le protocole prévoit que le PM relève ces montants le premier jour :
 * sans eux, la règle R4 ne peut pas dire si le déplacement vaut le coup.
 * En taxi à Brazzaville, une course coûte 1 000 F au minimum : un aller-retour 2 000 F,
 * davantage quand la distance augmente. Les suppléments ci-dessous sont provisoires.
 */
const TRAJETS = {
  'moungali|ouenze':    2000,   // ~3 km
  'moungali|poto-poto': 2000,   // ~1 km
  'moungali|total':     2500,   // ~5 km
  'ouenze|poto-poto':   2000,   // ~3,5 km
  'ouenze|total':       3000,   // ~6,5 km
  'poto-poto|total':    2500    // ~5 km
};

/**
 * `position` sert à deviner le marché le plus proche et à placer les épingles de la carte.
 * Coordonnées reprises d'OpenStreetMap (© contributeurs OpenStreetMap, ODbL).
 * OpenStreetMap ne recense pas de « Marché de Ouenzé » : on utilise le Marché Soukissa,
 * dans Ouenzé — à confirmer au GPS par le binôme lors du prochain relevé.
 */
const MARCHES = [
  { id: 'total',     nom: 'Marché Total', nom_court: 'Total',
    arrondissement: 'Bacongo (2ᵉ)',    position: { lat: -4.28957, lon: 15.24923 } },
  { id: 'poto-poto', nom: 'Marché de Poto-Poto', nom_court: 'Poto',
    arrondissement: 'Poto-Poto (3ᵉ)',  position: { lat: -4.26314, lon: 15.28621 } },
  { id: 'moungali',  nom: 'Marché de Moungali (Texaco)', nom_court: 'Moungali',
    arrondissement: 'Moungali (4ᵉ)',   position: { lat: -4.25833, lon: 15.27896 } },
  { id: 'ouenze',    nom: 'Marché de Ouenzé', nom_court: 'Ouenzé',
    arrondissement: 'Ouenzé (5ᵉ)',     position: { lat: -4.2335, lon: 15.27478 } }
];

const IDS = MARCHES.map(m => m.id);

// Protocole : deux marchés par matinée, sur deux matinées consécutives.
// Dates fixes du dernier relevé terrain — à modifier uniquement après un nouveau relevé.
const DATES_RELEVES = { 'total': '2026-09-18', 'poto-poto': '2026-09-18', 'moungali': '2026-09-19', 'ouenze': '2026-09-19' };
const DATE_GENERATION = '2026-09-20';

function jour(decalage) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + decalage);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Chaque case : nombre = prix relevé, null = pas vu ce jour,
 * [min, max] = prix instable (fourchette, protocole des 40 %).
 * `mots` porte le mot employé par la vendeuse, marché par marché.
 */
const PRODUITS = [
  {
    id: 'riz-sac', nom: 'Riz importé (sac)',
    unite_reference: 'Sac de 25 kg', maniere_de_vendre: 'quantite_scellee', segment: 'gros',
    autres_noms: ['riz', 'loso', 'sac de riz', 'riz importé'],
    cases: { 'total': 22500, 'poto-poto': 21500, 'moungali': 19500, 'ouenze': 20000 },
    mots:  { '*': 'sac' }
  },
  {
    id: 'riz-detail', nom: 'Riz au détail',
    unite_reference: 'Mesure — boîte de tomate, rase', maniere_de_vendre: 'mesure', segment: 'detail',
    autres_noms: ['riz', 'loso', 'riz à la mesure'],
    cases: { 'total': 500, 'poto-poto': 500, 'moungali': 475, 'ouenze': 450 },
    mots:  { '*': 'mesure', 'poto-poto': 'boîte' }
  },
  {
    id: 'foufou', nom: 'Foufou',
    unite_reference: 'Mesure — boîte de tomate, rase', maniere_de_vendre: 'mesure', segment: 'detail',
    autres_noms: ['fufu', 'farine de manioc', 'poudre de manioc', 'manioc'],
    cases: { 'total': null, 'poto-poto': 400, 'moungali': 375, 'ouenze': 400 },
    mots:  { '*': 'mesure', 'ouenze': 'boîte' }
  },
  {
    id: 'haricot', nom: 'Haricot',
    unite_reference: 'Mesure — boîte de tomate, rase', maniere_de_vendre: 'mesure', segment: 'detail',
    autres_noms: ['madesu', 'madezu', 'haricots', 'niébé'],
    cases: { 'total': 750, 'poto-poto': 800, 'moungali': 725, 'ouenze': 700 },
    mots:  { '*': 'mesure' }
  },
  {
    id: 'sucre', nom: 'Sucre',
    unite_reference: 'Paquet scellé de 1 kg', maniere_de_vendre: 'quantite_scellee', segment: 'detail',
    autres_noms: ['sukali', 'sucre en poudre', 'paquet de sucre', 'SARIS'],
    cases: { 'total': 1100, 'poto-poto': 1050, 'moungali': 1000, 'ouenze': 1000 },
    mots:  { '*': 'paquet' }
  },
  {
    id: 'huile', nom: 'Huile végétale',
    unite_reference: 'Bouteille scellée de 1 L', maniere_de_vendre: 'quantite_scellee', segment: 'detail',
    autres_noms: ['mafuta', 'huile', "bouteille d'huile"],
    cases: { 'total': 1900, 'poto-poto': 1850, 'moungali': 1800, 'ouenze': 1750 },
    mots:  { '*': 'bouteille' }
  },
  {
    id: 'oeufs', nom: 'Œufs',
    unite_reference: 'Plateau de 30', maniere_de_vendre: 'quantite_scellee', segment: 'gros',
    autres_noms: ['maki', "plateau d'œufs", 'alvéole'],
    cases: { 'total': 3600, 'poto-poto': 3500, 'moungali': 3400, 'ouenze': 3300 },
    mots:  { '*': 'plateau' }
  },
  {
    id: 'mpiodi-carton', nom: 'Mpiodi (carton)',
    unite_reference: 'Carton entier, poids annoncé noté', maniere_de_vendre: 'quantite_scellee', segment: 'gros',
    autres_noms: ['chinchard', 'poisson chinchard', 'carton de poisson'],
    cases: { 'total': 32000, 'poto-poto': 31000, 'moungali': 29500, 'ouenze': 28500 },
    mots:  { '*': 'carton' }
  },
  {
    id: 'mpiodi-detail', nom: 'Mpiodi au détail',
    unite_reference: 'Tas, nombre de pièces noté', maniere_de_vendre: 'format_variable', segment: 'detail',
    autres_noms: ['chinchard', 'poisson', 'tas de poisson'],
    cases: { 'total': 1500, 'poto-poto': 1500, 'moungali': 1250, 'ouenze': 1250 },
    mots:  { '*': 'tas' }
  },
  {
    id: 'kwanga', nom: 'Kwanga',
    unite_reference: 'Bâton, format courant décrit', maniere_de_vendre: 'format_variable', segment: 'detail',
    autres_noms: ['chikwangue', 'chikwang', 'bâton de manioc', 'manioc'],
    cases: { 'total': 700, 'poto-poto': 700, 'moungali': 600, 'ouenze': 600 },
    mots:  { '*': 'bâton' }
  },
  {
    id: 'saka-saka', nom: 'Saka-saka pilé',
    unite_reference: 'Boule ou sachet, format décrit', maniere_de_vendre: 'format_variable', segment: 'detail',
    autres_noms: ['saka saka', 'sakasaka', 'feuilles de manioc', 'pondu', 'mpondu'],
    cases: { 'total': 400, 'poto-poto': 350, 'moungali': 350, 'ouenze': null },
    mots:  { '*': 'boule', 'poto-poto': 'sachet' }
  },
  {
    id: 'charbon', nom: 'Charbon de bois',
    unite_reference: 'Sac ordinaire, hauteur et remplissage décrits', maniere_de_vendre: 'format_variable', segment: 'gros',
    autres_noms: ['makala', 'charbon', 'braise', 'sac de makala'],
    cases: { 'total': 4000, 'poto-poto': 3800, 'moungali': 2900, 'ouenze': [2500, 4200] },
    mots:  { '*': 'sac' }
  }
];

function mot(prod, marche) {
  return prod.mots[marche] || prod.mots['*'];
}

function releve(prod, marche, date) {
  const v = prod.cases[marche];
  if (v === null || v === undefined) return { statut: 'pas_vu', date };
  if (Array.isArray(v)) {
    return { statut: 'instable', prix_min: v[0], prix_max: v[1], mot_vendeuse: mot(prod, marche), date };
  }
  return { statut: 'releve', prix: v, mot_vendeuse: mot(prod, marche), date };
}

/** `dates` donne, par marché, une date fixe « AAAA-MM-JJ » ou un décalage en jours. */
function produit(prod, dates, surcharges = {}) {
  const releves = {};
  for (const id of IDS) {
    const d = dates[id];
    const base = releve(prod, id, typeof d === 'string' ? d : jour(d));
    releves[id] = Object.assign(base, (surcharges[id] || {}));
  }
  return {
    id: prod.id,
    nom: prod.nom,
    unite_reference: prod.unite_reference,
    maniere_de_vendre: prod.maniere_de_vendre,
    segment: prod.segment,
    autres_noms: prod.autres_noms,
    releves
  };
}

function entete(extra) {
  return Object.assign({
    genere_le: DATE_GENERATION,
    seuil_deplacement_fcfa: SEUIL_DEPLACEMENT,
    trajets: TRAJETS,
    source_prix: 'provisoire — valeurs plausibles, à remplacer par les relevés terrain du PM',
    source_positions: 'OpenStreetMap (© contributeurs OpenStreetMap, ODbL) ; Ouenzé = Marché Soukissa, à confirmer sur place',
    note_biais: 'Relevés en début de mois, juste après les salaires : les écarts entre marchés sont probablement plus faibles qu\'en fin de mois.'
  }, extra);
}

/* ---------- fichier de production : dates fixes du relevé terrain ---------- */

const production = {
  meta: entete({}),
  marches: MARCHES,
  produits: PRODUITS.map(p => produit(p, DATES_RELEVES))
};

/* ---------- fichier de recette : chaque branche de R6 et R9 ---------- */

const uniforme = n => ({ 'total': n, 'poto-poto': n, 'moungali': n, 'ouenze': n });

const CAS_DEMO = {
  'riz-sac':       { decalages: uniforme(0) },                    // « aujourd'hui »
  'riz-detail':    { decalages: uniforme(-1) },                   // « hier »
  'foufou':        { decalages: uniforme(-3) },                   // « il y a 3 jours », vert
  'haricot':       { decalages: uniforme(-9) },                   // orange « à vérifier », ni badge ni écart utile
  'sucre':         { decalages: uniforme(-20) },                  // périmé, grisé, hors tri
  'huile':         { decalages: { 'total': 0, 'poto-poto': 0, 'moungali': -20, 'ouenze': -20 } }, // mélange frais / périmé
  'oeufs':         { decalages: uniforme(-2),                     // deux marchés à égalité au prix le plus bas → pas de badge
                     surcharges: { 'moungali': { prix: 3300 } } },
  'mpiodi-carton': { decalages: { 'total': -1, 'poto-poto': -10, 'moungali': -10, 'ouenze': -10 } }, // un seul marché récent → pas de badge
  'mpiodi-detail': { decalages: { 'total': -2, 'poto-poto': -2, 'moungali': -2, 'ouenze': 2 } },     // date future → « date incertaine »
  'kwanga':        { decalages: uniforme(-2) },
  'saka-saka':     { decalages: uniforme(-2) },                   // contient un « pas vu ce jour »
  'charbon':       { decalages: uniforme(-2) }                    // contient une fourchette « prix instable »
};

const demo = {
  meta: entete({
    genere_le: jour(0),
    source_prix: 'jeu de recette — dates choisies pour exercer toutes les branches des règles R6 et R9',
    usage: 'recette et démonstration de la péremption ; ne jamais servir comme fichier de production'
  }),
  marches: MARCHES,
  produits: PRODUITS.map(p => {
    const cas = CAS_DEMO[p.id];
    return produit(p, cas.decalages, cas.surcharges);
  })
};

fs.writeFileSync(path.join(DOSSIER, 'prix.json'), JSON.stringify(production, null, 2) + '\n');
fs.writeFileSync(path.join(DOSSIER, 'prix-demo.json'), JSON.stringify(demo, null, 2) + '\n');

const ko = f => (fs.statSync(path.join(DOSSIER, f)).size / 1024).toFixed(1);
console.log(`prix.json       généré  (${ko('prix.json')} Ko)  — relevés figés au ${DATES_RELEVES.total} / ${DATES_RELEVES.ouenze}`);
console.log(`prix-demo.json  généré  (${ko('prix-demo.json')} Ko)  — dates étalées de +2 à -20 jours`);
