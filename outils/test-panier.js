import assert from 'node:assert/strict';
import {
  utiliserStockage, lire, definir, ajouter, retirer, vider, quantite, compte,
  evaluerPanier, QTE_MAX
} from '../js/panier.js';
import { aujourdhui } from '../js/regles.js';

function faux() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
utiliserStockage(faux());

let n = 0;
const test = (nom, fn) => { fn(); n++; console.log('  ✓ ' + nom); };

/* ---------- jeu d'essai : dates calculées, jamais écrites en dur ---------- */

const MAINTENANT = aujourdhui();
const jour = d => {
  const x = new Date(MAINTENANT);
  x.setDate(x.getDate() + d);
  const p = v => String(v).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};

const releve = (prix, d = -1) => ({ statut: 'releve', prix, mot_vendeuse: 'sac', date: jour(d) });
const pasVu = () => ({ statut: 'pas_vu', date: jour(-1) });
const instable = (min, max) => ({ statut: 'instable', prix_min: min, prix_max: max, mot_vendeuse: 'sac', date: jour(-1) });

const MARCHES = [
  { id: 'total', nom: 'Marché Total', nom_court: 'Total' },
  { id: 'poto-poto', nom: 'Marché de Poto-Poto', nom_court: 'Poto' },
  { id: 'moungali', nom: 'Marché de Moungali', nom_court: 'Moungali' },
  { id: 'ouenze', nom: 'Marché de Ouenzé', nom_court: 'Ouenzé' }
];

const META = {
  seuil_deplacement_fcfa: 2000,
  trajets: { 'moungali|ouenze': 2000, 'moungali|poto-poto': 2000, 'moungali|total': 2500,
             'ouenze|poto-poto': 2000, 'ouenze|total': 3000, 'poto-poto|total': 2500 }
};

const PRODUITS = [
  { id: 'riz-sac', nom: 'Riz importé (sac)', unite_reference: 'Sac de 25 kg',
    releves: { 'total': releve(22500), 'poto-poto': releve(21500), 'moungali': releve(19500), 'ouenze': releve(20000) } },
  { id: 'sucre', nom: 'Sucre', unite_reference: 'Paquet de 1 kg',
    releves: { 'total': releve(1100), 'poto-poto': releve(1050), 'moungali': releve(1000), 'ouenze': pasVu() } },
  { id: 'charbon', nom: 'Charbon de bois', unite_reference: 'Sac ordinaire',
    releves: { 'total': releve(4000), 'poto-poto': instable(2500, 4200), 'moungali': releve(2900), 'ouenze': releve(3000) } },
  { id: 'huile', nom: 'Huile végétale', unite_reference: 'Bouteille de 1 L',
    releves: { 'total': releve(1900), 'poto-poto': releve(1850), 'moungali': releve(1800, -20), 'ouenze': releve(1750) } },
  { id: 'oeufs', nom: 'Œufs', unite_reference: 'Plateau de 30',
    releves: { 'total': releve(3600, -9), 'poto-poto': releve(3500, -9), 'moungali': releve(3400, -9), 'ouenze': releve(3300, -9) } }
];

const ev = (panier, depart) => evaluerPanier(panier, PRODUITS, MARCHES, MAINTENANT, META, depart);
const marcheDe = (r, id) => r.complets.find(c => c.marche.id === id);

/* ---------- le panier lui-même ---------- */

console.log('\nPanier — contenu et quantités');
test('un produit ajouté est relu avec sa quantité', () => {
  vider();
  ajouter('riz-sac', 4);
  assert.equal(quantite('riz-sac'), 4);
  assert.deepEqual(lire(), [{ produit: 'riz-sac', qte: 4 }]);
});
test('ajouter deux fois cumule les quantités', () => {
  vider(); ajouter('riz-sac', 2); ajouter('riz-sac', 3);
  assert.equal(quantite('riz-sac'), 5);
});
test('définir remplace la quantité, sans dupliquer la ligne', () => {
  vider(); ajouter('riz-sac', 2); definir('riz-sac', 7);
  assert.equal(lire().length, 1);
  assert.equal(quantite('riz-sac'), 7);
});
test('quantité nulle ou négative : la ligne disparaît', () => {
  vider(); ajouter('sucre', 3); definir('sucre', 0);
  assert.equal(quantite('sucre'), 0);
  assert.deepEqual(lire(), []);
});
test('la quantité est bornée', () => {
  vider(); definir('sucre', 5000);
  assert.equal(quantite('sucre'), QTE_MAX);
});
test('le compte distingue lignes et articles', () => {
  vider(); ajouter('riz-sac', 4); ajouter('sucre', 2);
  assert.deepEqual(compte(), { lignes: 2, articles: 6 });
});
test('retirer ne touche pas aux autres lignes', () => {
  vider(); ajouter('riz-sac', 1); ajouter('sucre', 2); retirer('riz-sac');
  assert.deepEqual(lire(), [{ produit: 'sucre', qte: 2 }]);
});
test('stockage indisponible : aucune exception', () => {
  utiliserStockage({ getItem: () => { throw new Error('bloqué'); },
                     setItem: () => { throw new Error('bloqué'); },
                     removeItem: () => { throw new Error('bloqué'); } });
  assert.deepEqual(lire(), []);
  assert.equal(definir('riz-sac', 2), null);
  assert.equal(quantite('riz-sac'), 0);
  utiliserStockage(faux());
});

/* ---------- le calcul ---------- */

console.log('\nTotal du panier — quantités et unité de référence');
test('la quantité multiplie le prix de l’unité de référence', () => {
  const r = ev([{ produit: 'riz-sac', qte: 4 }]);
  assert.equal(marcheDe(r, 'moungali').total, 4 * 19500);
  assert.equal(marcheDe(r, 'total').total, 4 * 22500);
});
test('plusieurs produits : les sous-totaux s’additionnent', () => {
  const r = ev([{ produit: 'riz-sac', qte: 2 }, { produit: 'sucre', qte: 3 }]);
  assert.equal(marcheDe(r, 'moungali').total, 2 * 19500 + 3 * 1000);
});
test('chaque ligne garde son prix unitaire et son sous-total', () => {
  const r = ev([{ produit: 'riz-sac', qte: 4 }]);
  const d = marcheDe(r, 'total').details[0];
  assert.equal(d.prix, 22500);
  assert.equal(d.qte, 4);
  assert.equal(d.sousTotal, 90000);
});
test('panier vide : aucun marché classé', () => {
  const r = ev([]);
  assert.equal(r.verdict.type, 'vide');
  assert.equal(r.complets.length, 0);
});
test('produit inconnu : ignoré, jamais une erreur', () => {
  const r = ev([{ produit: 'introuvable', qte: 2 }]);
  assert.equal(r.articles.length, 0);
});

console.log('\nMarchés écartés — on ne compare jamais deux paniers différents');
test('« pas vu ce jour » écarte le marché du classement', () => {
  const r = ev([{ produit: 'sucre', qte: 1 }]);
  assert.equal(marcheDe(r, 'ouenze'), undefined);
  assert.equal(r.incomplets.find(i => i.marche.id === 'ouenze').manquants[0].raison, 'pas vu ce jour');
});
test('un prix instable écarte le marché', () => {
  const r = ev([{ produit: 'charbon', qte: 1 }]);
  assert.equal(marcheDe(r, 'poto-poto'), undefined);
  assert.equal(r.incomplets.find(i => i.marche.id === 'poto-poto').manquants[0].raison, 'prix instable');
});
test('un prix périmé écarte le marché', () => {
  const r = ev([{ produit: 'huile', qte: 1 }]);
  assert.equal(marcheDe(r, 'moungali'), undefined);
  assert.equal(r.incomplets.find(i => i.marche.id === 'moungali').manquants[0].raison, 'prix périmé');
});
test('le marché écarté n’est pas complété par le prix d’un autre marché', () => {
  const r = ev([{ produit: 'sucre', qte: 1 }]);
  assert.equal(r.incomplets.find(i => i.marche.id === 'ouenze').total, 0);
});
test('un prix orange compte, mais le panier est signalé à vérifier', () => {
  const r = ev([{ produit: 'oeufs', qte: 1 }]);
  assert.equal(r.complets.length, 4);
  assert.equal(r.aVerifier, true);
});

console.log('\nClassement et verdict');
test('les marchés complets sont triés du moins cher au plus cher', () => {
  const r = ev([{ produit: 'riz-sac', qte: 1 }, { produit: 'sucre', qte: 1 }]);
  assert.deepEqual(r.complets.map(c => c.marche.id), ['moungali', 'poto-poto', 'total']);
});
test('sans point de départ : classement seul, aucune recommandation', () => {
  const r = ev([{ produit: 'riz-sac', qte: 1 }]);
  assert.equal(r.verdict.type, 'classement');
  assert.equal(r.verdict.meilleur.marche.id, 'moungali');
});
test('économie supérieure au taxi : ça vaut le déplacement', () => {
  // 4 sacs : 90 000 F au Total, 78 000 F à Moungali — 12 000 F d’écart, taxi 2 500 F
  const r = ev([{ produit: 'riz-sac', qte: 4 }], 'total');
  assert.equal(r.verdict.type, 'vaut');
  assert.equal(r.verdict.ecart, 12000);
  assert.equal(r.verdict.trajet, 2500);
  assert.equal(r.verdict.net, 9500);
});
test('économie inférieure au taxi : ça ne vaut pas le déplacement', () => {
  // 1 sac depuis Ouenzé : 20 000 F contre 19 500 F à Moungali — 500 F, taxi 2 000 F
  const r = ev([{ produit: 'riz-sac', qte: 1 }], 'ouenze');
  assert.equal(r.verdict.type, 'ne-vaut-pas');
  assert.equal(r.verdict.net, -1500);
});
test('économie égale au taxi : ça ne vaut pas le déplacement', () => {
  // 1 sac depuis Poto-Poto : 21 500 contre 19 500, soit 2 000 F, et le taxi coûte 2 000 F
  const r = ev([{ produit: 'riz-sac', qte: 1 }], 'poto-poto');
  assert.equal(r.verdict.ecart, 2000);
  assert.equal(r.verdict.trajet, 2000);
  assert.equal(r.verdict.type, 'ne-vaut-pas');
});
test('déjà dans le marché le moins cher : on ne bouge pas', () => {
  const r = ev([{ produit: 'riz-sac', qte: 1 }], 'moungali');
  assert.equal(r.verdict.type, 'sur-place');
  assert.equal(r.verdict.meilleur.marche.id, 'moungali');
});
test('le marché de départ ne fournit pas le panier : on le dit', () => {
  const r = ev([{ produit: 'sucre', qte: 1 }], 'ouenze');
  assert.equal(r.verdict.type, 'depart-incomplet');
  assert.equal(r.verdict.meilleur.marche.id, 'moungali');
});
test('aucun marché ne fournit le panier entier', () => {
  const r = ev([{ produit: 'sucre', qte: 1 }, { produit: 'charbon', qte: 1 },
                { produit: 'huile', qte: 1 }], 'total');
  const complets = r.complets.map(c => c.marche.id);
  assert.deepEqual(complets, ['total']);
  assert.equal(r.verdict.type, 'sur-place');
});

console.log(`\n✓ ${n} tests passés\n`);
