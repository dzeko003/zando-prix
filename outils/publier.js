#!/usr/bin/env node
'use strict';

/**
 * Copie les fichiers livrés dans public/, le dossier que Vercel sert.
 * Les sources, les outils et node_modules restent hors du site publié.
 *
 *   node outils/publier.js      (lancé en dernier par npm run build)
 */

import fs from 'node:fs';
import path from 'node:path';

const RACINE = path.join(import.meta.dirname, '..');
const SORTIE = path.join(RACINE, 'public');

const LIVRES = [
  'index.html', 'manifest.json', 'sw.js',
  'css', 'js', 'fonts', 'icones', 'images', 'vendor',
  'data/prix.json', 'data/sources-photos.json'
];

fs.rmSync(SORTIE, { recursive: true, force: true });
for (const f of LIVRES) {
  const source = path.join(RACINE, f);
  if (!fs.existsSync(source)) {
    console.error(`✗ ${f} introuvable — publication interrompue`);
    process.exit(1);
  }
  fs.cpSync(source, path.join(SORTIE, f), { recursive: true });
}

console.log(`✓ ${LIVRES.length} éléments copiés dans public/`);
