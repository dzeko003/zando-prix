import assert from 'node:assert/strict';
import {
  utiliserStockage, valider, ecartImportant, ajouter, pourProduit, lire
} from '../js/contributions.js';

function faux() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
utiliserStockage(faux());

let n = 0;
const test = (nom, fn) => { fn(); n++; console.log('  ✓ ' + nom); };

console.log('\nUS-07 — validation de la saisie');
test('marché manquant : refus explicite', () => {
  const v = valider('', '2500');
  assert.equal(v.ok, false);
  assert.match(v.message, /marché/);
});
test('prix manquant : refus explicite', () => {
  const v = valider('total', '');
  assert.equal(v.ok, false);
  assert.match(v.message, /prix/);
});
test('les deux manquent : les deux sont nommés', () => {
  const v = valider('', '');
  assert.match(v.message, /marché/); assert.match(v.message, /prix/);
});
test('décimale refusée — R2', () => assert.equal(valider('total', '137,5').ok, false));
test('lettres refusées', () => assert.equal(valider('total', '2500 F').ok, false));
test('espaces tolérés dans la saisie', () => {
  const v = valider('total', '2 500');
  assert.equal(v.ok, true); assert.equal(v.prix, 2500);
});

console.log('\nR7 — écart important avec le dernier relevé');
test('plus de 50 % au-dessus : signalé', () => assert.equal(ecartImportant(2500, 1000), true));
test('plus de 50 % en dessous : signalé', () => assert.equal(ecartImportant(400, 1000), true));
test('écart modéré : non signalé', () => assert.equal(ecartImportant(1200, 1000), false));
test('exactement 50 % : non signalé', () => assert.equal(ecartImportant(1500, 1000), false));
test('aucun relevé de référence : rien à comparer', () => assert.equal(ecartImportant(2500, null), false));

console.log('\nUS-08 — enregistrement et persistance');
test('une contribution est enregistrée puis relue', () => {
  ajouter({ produit: 'charbon', marche: 'moungali', prix: 2800, unite: 'Sac ordinaire', date: '2026-09-15', reference: 2900 });
  const l = pourProduit('charbon');
  assert.equal(l.length, 1);
  assert.equal(l[0].prix, 2800);
  assert.equal(l[0].unite, 'Sac ordinaire');
  assert.equal(l[0].ecart_important, false);
});
test('un prix aberrant porte la mention', () => {
  ajouter({ produit: 'charbon', marche: 'total', prix: 9000, unite: 'Sac ordinaire', date: '2026-09-16', reference: 4000 });
  assert.equal(pourProduit('charbon')[0].ecart_important, true);
});
test('les contributions sont filtrées par produit', () => {
  ajouter({ produit: 'sucre', marche: 'total', prix: 1100, unite: 'Paquet', date: '2026-09-16', reference: 1100 });
  assert.equal(pourProduit('charbon').length, 2);
  assert.equal(pourProduit('sucre').length, 1);
  assert.equal(lire().length, 3);
});
test('les plus récentes en premier', () => {
  assert.equal(pourProduit('charbon')[0].date, '2026-09-16');
});
test('stockage indisponible : aucune exception', () => {
  utiliserStockage({ getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); } });
  assert.deepEqual(lire(), []);
  assert.equal(ajouter({ produit: 'x', marche: 'y', prix: 1, unite: 'u', date: '2026-09-16' }), null);
});

console.log(`\n✓ ${n} tests passés\n`);
