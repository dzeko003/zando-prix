import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  aujourdhui, joursEcoules, fraicheur, libelleJours,
  evaluerProduit, chercher, normaliser, coutTrajet
} from '../js/regles.js';

const d = JSON.parse(fs.readFileSync('data/prix-demo.json', 'utf8'));
const maintenant = aujourdhui();
const prod = id => d.produits.find(p => p.id === id);
const ev = (id, depart) => evaluerProduit(prod(id), d.marches, maintenant, d.meta, depart);

let n = 0;
const test = (nom, fn) => { fn(); n++; console.log('  ✓ ' + nom); };

console.log('\nRègles R6 et R9 — fraîcheur et dates');
test('moins de 7 jours : vert', () => assert.equal(fraicheur(3), 'vert'));
test('7 à 14 jours : orange', () => { assert.equal(fraicheur(7), 'orange'); assert.equal(fraicheur(14), 'orange'); });
test('au-delà de 14 jours : périmé', () => assert.equal(fraicheur(15), 'perime'));
test('horloge en retard : date incertaine', () => assert.equal(fraicheur(-2), 'incertain'));
test('libellés en jours écoulés, jamais de date', () => {
  assert.equal(libelleJours(0), "aujourd'hui");
  assert.equal(libelleJours(1), 'hier');
  assert.equal(libelleJours(3), 'il y a 3 jours');
  assert.equal(libelleJours(20), 'périmé');
  assert.equal(libelleJours(-1), 'date incertaine, à vérifier');
});

console.log('\nRègle R5 — badge « le moins cher relevé »');
test('badge sur le moins cher quand au moins deux marchés sont récents', () => {
  assert.equal(ev('riz-sac').badge, 'moungali');
});
test('pas de badge si deux marchés sont à égalité au prix le plus bas', () => {
  assert.equal(ev('oeufs').badge, null);
});
test('pas de badge si un seul marché est récent', () => {
  assert.equal(ev('mpiodi-carton').badge, null);
});
test('pas de badge quand tous les prix sont orange', () => {
  assert.equal(ev('haricot').badge, null);
});

console.log('\nRègle R4 — écart utile');
test('écart supérieur au seuil : ça vaut le déplacement', () => {
  const e = ev('riz-sac').ecartUtile;
  assert.equal(e.evaluable, true); assert.equal(e.vaut, true); assert.equal(e.ecart, 3000);
});
test('écart inférieur au seuil : ça ne vaut pas le déplacement', () => {
  const e = ev('kwanga').ecartUtile;
  assert.equal(e.evaluable, true); assert.equal(e.vaut, false);
});
test('moins de trois marchés récents : non évaluable', () => {
  assert.equal(ev('mpiodi-carton').ecartUtile.evaluable, false);
});

console.log('\nR4 — écart mesuré depuis le marché de départ');
test('le coût du trajet vient de la paire de marchés relevée', () => {
  assert.equal(coutTrajet('total', 'moungali', d.meta), 2500);
  assert.equal(coutTrajet('moungali', 'total', d.meta), 2500);
  assert.equal(coutTrajet('total', 'total', d.meta), 0);
});
test('paire inconnue : repli sur le seuil général, jamais sur une valeur inventée', () => {
  assert.equal(coutTrajet('total', 'inexistant', d.meta), d.meta.seuil_deplacement_fcfa);
});
test('depuis le marché le plus cher, le déplacement vaut le coup', () => {
  const e = ev('riz-sac', 'total').ecartUtile;
  assert.equal(e.vaut, true);
  assert.equal(e.ecart, 3000);          // 22 500 au Total − 19 500 à Moungali
  assert.equal(e.seuil, 2500);          // aller-retour Total ↔ Moungali
  assert.equal(e.depuis.id, 'total');
  assert.equal(e.marche.id, 'moungali');
});
test('même produit, depuis un marché proche : il ne vaut plus le coup', () => {
  const e = ev('riz-sac', 'ouenze').ecartUtile;
  assert.equal(e.vaut, false);
  assert.equal(e.ecart, 500);           // 20 000 à Ouenzé − 19 500 à Moungali
  assert.equal(e.seuil, 2000);          // aller-retour Moungali ↔ Ouenzé
});
test('écart égal au prix du trajet : il ne vaut pas le coup', () => {
  const e = ev('riz-sac', 'poto-poto').ecartUtile;
  assert.equal(e.ecart, 2000);          // 21 500 à Poto-Poto − 19 500 à Moungali
  assert.equal(e.seuil, 2000);          // aller-retour Poto-Poto ↔ Moungali
  assert.equal(e.vaut, false);          // il faut dépasser le coût, pas l'égaler
});
test('déjà au moins cher : on ne propose aucun déplacement', () => {
  const e = ev('riz-sac', 'moungali').ecartUtile;
  assert.equal(e.surPlace, true);
  assert.equal(e.vaut, false);
});
test('sans marché de départ, on retombe sur l’écart entre marchés', () => {
  const e = ev('riz-sac').ecartUtile;
  assert.equal(e.general, true);
  assert.equal(e.ecart, 3000);
  assert.equal(e.seuil, d.meta.seuil_deplacement_fcfa);
});
test('marché de départ sans relevé récent : repli sur l’écart général', () => {
  const e = ev('riz-sac', 'inexistant').ecartUtile;
  assert.equal(e.general, true);
});

console.log('\nUS-01 — ordre et exclusions');
test('les périmés sortent du tri', () => {
  const l = ev('huile').lignes;
  assert.equal(l.slice(0, 2).every(x => x.comparable), true);
  assert.equal(l.slice(2).every(x => !x.comparable), true);
});
test('« prix instable » placé avant « pas vu ce jour »', () => {
  const l = ev('charbon').lignes.map(x => x.statut);
  assert.equal(l[l.length - 1], 'instable');
});
test('« pas vu ce jour » en dernière position', () => {
  const l = ev('saka-saka').lignes;
  assert.equal(l[l.length - 1].statut, 'pas_vu');
});

console.log('\nUS-03 — recherche');
test('un autre nom trouve le produit', () => {
  assert.equal(chercher(d.produits, 'chikwangue')[0].id, 'kwanga');
  assert.equal(chercher(d.produits, 'makala')[0].id, 'charbon');
});
test('« manioc » retourne les trois produits issus du manioc', () => {
  const ids = chercher(d.produits, 'manioc').map(p => p.id).sort();
  assert.deepEqual(ids, ['foufou', 'kwanga', 'saka-saka']);
});
test('espaces, tirets, majuscules et accents ignorés', () => {
  for (const s of ['saka saka', 'Saka-Saka', 'sakasaka', 'SAKA SAKA'])
    assert.equal(chercher(d.produits, s)[0].id, 'saka-saka');
});
test('aucune correspondance approximative', () => {
  assert.equal(chercher(d.produits, 'zzz').length, 0);
});

console.log(`\n✓ ${n} tests passés\n`);
