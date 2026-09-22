#!/usr/bin/env node
'use strict';

/**
 * Estampille le service worker avec l'empreinte des fichiers livrés.
 * Sans ça, un navigateur continue de servir l'ancienne version après un déploiement.
 *
 *   node outils/version-sw.js      (lancé par npm run build)
 *
 * Le serveur de développement (outils/serveur.js) réutilise `estampiller` à chaque
 * demande de sw.js : une modification du code est vue dès le rechargement suivant.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(import.meta.dirname, '..');
const lire = f => fs.readFileSync(path.join(RACINE, f));
const lister = dossier => fs.readdirSync(path.join(RACINE, dossier), { recursive: true }).sort();

/** Empreinte des fichiers livrés : change dès qu'un seul d'entre eux change. */
export function calculerVersion() {
  const suivis = [
    'index.html', 'manifest.json', 'css/style.css',
    ...lister('js').filter(f => f.endsWith('.js')).map(f => `js/${f}`),
    'fonts/plus-jakarta-sans.woff2',
    'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
    'images/marche-total.webp',
    ...lister('images/produits').map(f => `images/produits/${f}`),
    ...lister('images/marches').map(f => `images/marches/${f}`)
  ];
  const empreinte = crypto.createHash('sha256');
  for (const f of suivis) empreinte.update(lire(f));
  return 'zando-' + empreinte.digest('hex').slice(0, 10);
}

/** Le texte de sw.js avec la version donnée. */
export const estampiller = (sw, version = calculerVersion()) =>
  sw.replace(/const VERSION = '[^']+'/, `const VERSION = '${version}'`);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = calculerVersion();
  const sw = lire('sw.js').toString('utf8');
  const avant = sw.match(/const VERSION = '([^']+)'/)[1];
  if (avant === version) {
    console.log(`service worker inchangé (${version})`);
  } else {
    fs.writeFileSync(path.join(RACINE, 'sw.js'), estampiller(sw, version));
    console.log(`service worker : ${avant} → ${version}`);
  }
}
