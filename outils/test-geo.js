import assert from 'node:assert/strict';
import fs from 'node:fs';
import { distanceKm, marcheLePlusProche, distanceLisible, localiser, affiner, etatPermission, consignesActivation } from '../js/geo.js';

const d = JSON.parse(fs.readFileSync('data/prix.json', 'utf8'));
let n = 0;
const test = (nom, fn) => { fn(); n++; console.log('  ✓ ' + nom); };
const asyncTest = async (nom, fn) => { await fn(); n++; console.log('  ✓ ' + nom); };

console.log('\nDistance et marché le plus proche');
test('distance nulle entre un point et lui-même', () => {
  assert.equal(distanceKm({ lat: -4.26, lon: 15.27 }, { lat: -4.26, lon: 15.27 }), 0);
});
test('les quatre marchés tiennent dans une dizaine de kilomètres', () => {
  const [a, b] = [d.marches[0].position, d.marches[3].position];
  const km = distanceKm(a, b);
  assert.ok(km > 4 && km < 12, `Total ↔ Ouenzé = ${km.toFixed(1)} km`);
});
test('un point posé sur un marché retourne ce marché', () => {
  for (const m of d.marches) {
    const trouve = marcheLePlusProche(m.position, d.marches);
    assert.equal(trouve.marche.id, m.id);
    assert.ok(trouve.km < 0.01);
  }
});
test('un point entre deux marchés retourne le plus proche', () => {
  const moungali = d.marches.find(m => m.id === 'moungali').position;
  const proche = { lat: moungali.lat + 0.004, lon: moungali.lon + 0.004 };
  assert.equal(marcheLePlusProche(proche, d.marches).marche.id, 'moungali');
});
test('hors de Brazzaville : aucun marché proposé', () => {
  assert.equal(marcheLePlusProche({ lat: -4.7889, lon: 11.8653 }, d.marches), null); // Pointe-Noire
});
test('distance lisible en mètres puis en kilomètres', () => {
  assert.equal(distanceLisible(0.42), 'à 400 m');
  assert.equal(distanceLisible(2.34), 'à 2,3 km');
});

console.log('\nRefus et indisponibilité');
await asyncTest('sans API de géolocalisation, le motif est « indisponible »', async () => {
  await assert.rejects(() => localiser({ api: null }), /indisponible/);
});
const faussePosition = reponse => ({ getCurrentPosition: (ok, ko) => reponse(ok, ko) });

await asyncTest('permission refusée : motif « refus », jamais une exception nue', async () => {
  await assert.rejects(() => localiser({ api: faussePosition((_ok, ko) => ko({ code: 1 })) }), /refus/);
});
await asyncTest('délai dépassé : motif « delai »', async () => {
  await assert.rejects(() => localiser({ api: faussePosition((_ok, ko) => ko({ code: 3 })) }), /delai/);
});
await asyncTest('autre panne : motif « echec »', async () => {
  await assert.rejects(() => localiser({ api: faussePosition((_ok, ko) => ko({ code: 2 })) }), /echec/);
});
await asyncTest('connexion non sécurisée : motif « non-securise »', async () => {
  await assert.rejects(
    () => localiser({ api: faussePosition(ok => ok({})), securise: false }), /non-securise/);
});
await asyncTest('position obtenue : coordonnées normalisées', async () => {
  const api = faussePosition(ok => ok({ coords: { latitude: -4.26, longitude: 15.27, accuracy: 42 } }));
  assert.deepEqual(await localiser({ api }), { lat: -4.26, lon: 15.27, precision: 42 });
});

await asyncTest('à la demande : localisation précise, sans position en cache', async () => {
  let options;
  const api = { getCurrentPosition: (ok, _ko, o) => { options = o; ok({ coords: { latitude: -4.26, longitude: 15.27, accuracy: 12 } }); } };
  const p = await localiser({ api, precis: true });
  assert.equal(options.enableHighAccuracy, true);
  assert.equal(options.maximumAge, 0);
  assert.equal(p.precision, 12);
});
await asyncTest('par défaut : précision basse, position récente acceptée', async () => {
  let options;
  const api = { getCurrentPosition: (ok, _ko, o) => { options = o; ok({ coords: { latitude: -4.26, longitude: 15.27, accuracy: 900 } }); } };
  await localiser({ api });
  assert.equal(options.enableHighAccuracy, false);
  assert.ok(options.maximumAge > 0);
});

const suiviFactice = reponses => {
  const etat = { efface: false };
  const api = {
    watchPosition: (ok, ko) => {
      reponses.forEach((r, i) => setTimeout(() => (r.code ? ko(r) : ok({ coords: r })), 10 * (i + 1)));
      return 7;
    },
    clearWatch: id => { etat.efface = id === 7; },
    getCurrentPosition: () => { throw new Error('ne doit pas servir en mode précis'); }
  };
  return { etat, api };
};

console.log('\nMesure précise affinée');
await asyncTest('garde la meilleure mesure et s’arrête dès la précision visée', async () => {
  const { etat, api } = suiviFactice([
    { latitude: -4.2, longitude: 15.2, accuracy: 900 },
    { latitude: -4.26, longitude: 15.27, accuracy: 60 },
    { latitude: -4.2603, longitude: 15.269, accuracy: 12 },
    { latitude: 0, longitude: 0, accuracy: 5000 }
  ]);
  const p = await localiser({ api, precis: true });
  assert.deepEqual(p, { lat: -4.2603, lon: 15.269, precision: 12 });
  assert.equal(etat.efface, true);
});
await asyncTest('sans mesure assez fine, rend la meilleure obtenue au bout du délai', async () => {
  const { api } = suiviFactice([{ latitude: -4.2, longitude: 15.2, accuracy: 3200 }, { latitude: -4.25, longitude: 15.26, accuracy: 1400 }]);
  const p = await affiner(api, { duree: 200, cible: 25 });
  assert.equal(p.precision, 1400);
});
await asyncTest('refus de permission pendant la mesure', async () => {
  const { api } = suiviFactice([{ code: 1 }]);
  await assert.rejects(() => affiner(api, { duree: 200 }), /refus/);
});
await asyncTest('aucune mesure dans le délai', async () => {
  const { api } = suiviFactice([]);
  await assert.rejects(() => affiner(api, { duree: 100 }), /delai/);
});

console.log('\nAutorisation et consignes');
await asyncTest('état de l’autorisation lu sans déclencher de demande', async () => {
  for (const s of ['granted', 'prompt', 'denied']) {
    assert.equal(await etatPermission({ query: async () => ({ state: s }) }), s);
  }
});
await asyncTest('API des autorisations absente ou en échec : « inconnu »', async () => {
  assert.equal(await etatPermission(null), 'inconnu');
  assert.equal(await etatPermission({ query: async () => { throw new Error('non prise en charge'); } }), 'inconnu');
});
test('consignes adaptées à l’appareil', () => {
  const android = 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const bureau = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
  assert.equal(consignesActivation(android).plateforme, 'Android · Chrome');
  assert.equal(consignesActivation(iphone).plateforme, 'iPhone · Safari');
  assert.equal(consignesActivation(bureau).plateforme, 'Ordinateur · Chrome ou Edge');
  for (const ua of [android, iphone, bureau]) {
    const c = consignesActivation(ua);
    assert.ok(c.site.length >= 2 && c.systeme.length >= 1);
  }
});

console.log(`\n✓ ${n} tests passés\n`);
