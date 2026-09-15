#!/usr/bin/env python3
"""
Convertit les illustrations SVG en WebP aux emplacements lus par l'application.
Rendu par Chrome sans interface, à 2×, puis réduit : les courbes restent nettes.

Les produits utilisent désormais des photos libres de droits (voir SOURCES-IMAGES.md) : par défaut,
seules les illustrations des marchés sont converties. `--produits` régénère aussi celles des produits,
en secours — elles écraseraient alors les photos.

  python3 outils/rasteriser-illustrations.py [--produits] [planche.jpg]
"""
import pathlib
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

RACINE = pathlib.Path(__file__).resolve().parent.parent
SRC = RACINE / 'src' / 'illustrations'
PRODUITS = ['riz-sac', 'riz-detail', 'foufou', 'haricot', 'sucre', 'huile', 'oeufs',
            'mpiodi-carton', 'mpiodi-detail', 'kwanga', 'saka-saka', 'charbon']
MARCHES = ['total', 'poto-poto', 'moungali', 'ouenze']


def rendre(svg, w, h):
    dossier = pathlib.Path(tempfile.mkdtemp())
    png = dossier / 'rendu.png'
    subprocess.run(['google-chrome', '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
                    f'--user-data-dir={dossier / "profil"}', '--force-device-scale-factor=2',
                    f'--window-size={w},{h}', f'--screenshot={png}', svg.as_uri()],
                   check=True, capture_output=True, timeout=90)
    image = Image.open(png).convert('RGB')
    image.load()
    shutil.rmtree(dossier, ignore_errors=True)
    return image


def webp(image, chemin, taille, qualite=84):
    image.resize(taille, Image.LANCZOS).save(chemin, 'WEBP', quality=qualite, method=6)
    return chemin.stat().st_size


AVEC_PRODUITS = '--produits' in sys.argv
PLANCHE = next((a for a in sys.argv[1:] if not a.startswith('--')), None)

rendus, total = [], 0
for pid in (PRODUITS if AVEC_PRODUITS else []):
    im = rendre(SRC / f'{pid}.svg', 640, 400)
    g = webp(im, RACINE / 'images' / 'produits' / f'{pid}.webp', (640, 400))
    v = webp(im.crop((240, 0, 1040, 800)), RACINE / 'images' / 'produits' / f'{pid}-vignette.webp', (160, 160))
    total += g + v
    rendus.append(im.resize((320, 200)))
    print(f'  {pid:14s} {g / 1024:5.1f} Ko   vignette {v / 1024:4.1f} Ko')
for mid in MARCHES:
    im = rendre(SRC / f'marche-{mid}.svg', 480, 360)
    g = webp(im, RACINE / 'images' / 'marches' / f'{mid}.webp', (480, 360))
    v = webp(im.crop((120, 0, 840, 720)), RACINE / 'images' / 'marches' / f'{mid}-vignette.webp', (160, 160))
    total += g + v
    rendus.append(im.resize((266, 200)))
    print(f'  marché {mid:7s} {g / 1024:5.1f} Ko   vignette {v / 1024:4.1f} Ko')
print(f'  total : {total / 1024:.0f} Ko')

if PLANCHE:
    planche = Image.new('RGB', (4 * 330 + 10, 4 * 210 + 10), 'white')
    for i, r in enumerate(rendus):
        planche.paste(r, (10 + (i % 4) * 330, 10 + (i // 4) * 210))
    planche.save(PLANCHE, quality=90)
    print('  planche :', PLANCHE)
