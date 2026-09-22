#!/usr/bin/env node
'use strict';

/**
 * Serveur local de développement. Sert les fichiers du projet, et index.html pour
 * toute adresse sans extension (/carte, /produit/riz-sac…) : c'est l'application
 * qui lit l'adresse et affiche l'écran. Même règle que vercel.json en production.
 *
 *   node outils/serveur.js          (npm start)   → http://localhost:8000
 *   PORT=8080 node outils/serveur.js
 *
 * sw.js est servi avec la version calculée à l'instant sur les fichiers : sinon, tant que
 * personne ne lance `npm run version`, le service worker ressert l'ancien code depuis son cache.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { estampiller } from './version-sw.js';

const RACINE = path.join(import.meta.dirname, '..');
const PORT = Number(process.env.PORT) || 8000;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  let chemin;
  try { chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400).end(); return; }

  let fichier = path.join(RACINE, path.normalize(chemin));
  if (!fichier.startsWith(RACINE)) { res.writeHead(403).end(); return; }

  // une route de l'application : pas d'extension, pas de fichier → index.html
  const estFichier = fs.existsSync(fichier) && fs.statSync(fichier).isFile();
  if (!estFichier) {
    if (path.extname(chemin)) { res.writeHead(404).end('introuvable'); return; }
    fichier = path.join(RACINE, 'index.html');
  }

  if (fichier === path.join(RACINE, 'sw.js')) {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-cache' });
    res.end(estampiller(fs.readFileSync(fichier, 'utf8')));
    return;
  }

  res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(fichier).pipe(res);
}).listen(PORT, () => console.log(`Zando Prix : http://localhost:${PORT}`));
