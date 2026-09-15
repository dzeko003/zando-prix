#!/usr/bin/env node
'use strict';

/**
 * Estampille le service worker avec l'empreinte des fichiers livrés.
 * Sans ça, un navigateur continue de servir l'ancienne version après un déploiement.
 *
 *   node outils/version-sw.js      (lancé par npm run build)
 */

import fs from 'node:fs';
import crypto from 'node:crypto';

const SUIVIS = [
  'index.html', 'manifest.json', 'css/style.css',
  'js/app.js', 'js/regles.js', 'js/contributions.js', 'js/prefs.js', 'js/geo.js', 'js/carte.js',
  'fonts/plus-jakarta-sans.woff2',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'images/marche-total.webp',
  ...fs.readdirSync('images/produits').sort().map(f => `images/produits/${f}`),
  ...fs.readdirSync('images/marches').sort().map(f => `images/marches/${f}`)
];

const empreinte = crypto.createHash('sha256');
for (const f of SUIVIS) empreinte.update(fs.readFileSync(f));
const version = 'zando-' + empreinte.digest('hex').slice(0, 10);

const sw = fs.readFileSync('sw.js', 'utf8');
const avant = sw.match(/const VERSION = '([^']+)'/)[1];
if (avant === version) {
  console.log(`service worker inchangé (${version})`);
} else {
  fs.writeFileSync('sw.js', sw.replace(/const VERSION = '[^']+'/, `const VERSION = '${version}'`));
  console.log(`service worker : ${avant} → ${version}`);
}
