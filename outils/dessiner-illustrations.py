#!/usr/bin/env python3
"""
Illustrations originales de Zando Prix : 12 produits et 4 marchés, en SVG.
Dessinées pour le projet — aucune licence tierce, aucun crédit à afficher.

  python3 outils/dessiner-illustrations.py     → src/illustrations/*.svg
  python3 outils/rasteriser-illustrations.py   → images/produits/*.webp, images/marches/*.webp
"""
import math
import pathlib
import random

RACINE = pathlib.Path(__file__).resolve().parent.parent
SORTIE = RACINE / 'src' / 'illustrations'
SORTIE.mkdir(parents=True, exist_ok=True)
POLICE = 'font-family="Liberation Sans, Arial, Helvetica, sans-serif"'

DEFS = """
  <radialGradient id="fond" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="#F3FAF1"/><stop offset="1" stop-color="#CBEAC4"/></radialGradient>
  <linearGradient id="plateau" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E4C48A"/><stop offset="1" stop-color="#C79A55"/></linearGradient>
  <linearGradient id="sac" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FCF9F2"/><stop offset="1" stop-color="#D8CEB8"/></linearGradient>
  <linearGradient id="sac-sombre" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3C5A74"/><stop offset="1" stop-color="#1E3242"/></linearGradient>
  <linearGradient id="cuvette" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3D86C8"/><stop offset="1" stop-color="#28598D"/></linearGradient>
  <linearGradient id="cuvette-int" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E1E6E3"/></linearGradient>
  <linearGradient id="riz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFEF9"/><stop offset="1" stop-color="#EAE1CB"/></linearGradient>
  <linearGradient id="farine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E9E5DB"/></linearGradient>
  <linearGradient id="haricot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A5302A"/><stop offset="1" stop-color="#6E1A16"/></linearGradient>
  <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B7BEC3"/><stop offset=".45" stop-color="#F1F3F4"/><stop offset="1" stop-color="#A9B1B6"/></linearGradient>
  <linearGradient id="carton" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DDAE70"/><stop offset="1" stop-color="#B7844A"/></linearGradient>
  <linearGradient id="poisson" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7F97A9"/><stop offset=".55" stop-color="#C5D3DC"/><stop offset="1" stop-color="#EEF3F6"/></linearGradient>
  <linearGradient id="huile" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E7A51B"/><stop offset=".5" stop-color="#F7CF55"/><stop offset="1" stop-color="#DB9612"/></linearGradient>
  <linearGradient id="oeuf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F9E9D2"/><stop offset="1" stop-color="#DDB68A"/></linearGradient>
  <linearGradient id="feuille" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7DBE55"/><stop offset="1" stop-color="#3E7A2C"/></linearGradient>
  <linearGradient id="feuille-sombre" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5E9E3E"/><stop offset="1" stop-color="#2F6322"/></linearGradient>
  <linearGradient id="manioc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6F1E6"/><stop offset="1" stop-color="#DCD2BE"/></linearGradient>
  <linearGradient id="bol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D9E3DC"/></linearGradient>
  <linearGradient id="bois" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C99A5B"/><stop offset="1" stop-color="#9C6E36"/></linearGradient>
  <filter id="ombre" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#041B12" flood-opacity="0.20"/></filter>
  <filter id="ombre-douce" x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#041B12" flood-opacity="0.18"/></filter>
"""


def svg(nom, contenu, w=640, h=400, bulles=None, defs_sup=''):
    if bulles is None:
        bulles = ((92, 70, 46, .45), (w - 80, h - 70, 70, .30))
    ronds = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#FFFFFF" opacity="{o}"/>' for x, y, r, o in bulles)
    (SORTIE / f'{nom}.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">\n'
        f'<!-- Illustration originale Zando Prix — {nom}. Propriété du projet, aucune licence tierce. -->\n'
        f'<defs>{DEFS}{defs_sup}</defs>\n'
        f'<rect width="{w}" height="{h}" fill="url(#fond)"/>\n{ronds}\n{contenu}\n</svg>\n')


# ------------------------------------------------------------------ éléments communs

def ombre_sol(cx, cy, rx, ry=22, o=.12):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#041B12" opacity="{o}"/>'


def plateau(cx=320, cy=282, rx=236, ry=66):
    return (f'<g filter="url(#ombre)"><ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#plateau)"/></g>'
            f'<ellipse cx="{cx}" cy="{cy - 6}" rx="{rx - 30}" ry="{ry - 14}" fill="none" stroke="#B8894A" stroke-width="5" opacity=".7"/>'
            f'<ellipse cx="{cx}" cy="{cy - 10}" rx="{rx - 70}" ry="{ry - 28}" fill="none" stroke="#B8894A" stroke-width="4" opacity=".6"/>'
            f'<ellipse cx="{cx}" cy="{cy - 13}" rx="{rx - 116}" ry="{ry - 41}" fill="none" stroke="#B8894A" stroke-width="3" opacity=".5"/>')


def cuvette_arriere(cx, cy, rx, ry):
    return (f'<g filter="url(#ombre)"><path d="M{cx - rx} {cy} C {cx - rx + 40} {cy + ry * .6}, {cx + rx - 40} {cy + ry * .6}, {cx + rx} {cy} '
            f'L {cx + rx - 32} {cy + 78} C {cx + 60} {cy + 104}, {cx - 60} {cy + 104}, {cx - rx + 32} {cy + 78} Z" fill="url(#cuvette)"/></g>'
            f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#cuvette-int)" stroke="#2F6DAE" stroke-width="9"/>')


def cuvette_avant(cx, cy, rx, ry):
    return f'<path d="M{cx - rx} {cy} A {rx} {ry} 0 0 0 {cx + rx} {cy}" fill="none" stroke="#2F6DAE" stroke-width="9" stroke-linecap="round"/>'


def monticule(cx, cy, l, h, fill):
    return (f'<path d="M{cx - l - 8} {cy} C {cx - l + 30} {cy - h * .62}, {cx - 50} {cy - h}, {cx} {cy - h} '
            f'C {cx + 50} {cy - h}, {cx + l - 30} {cy - h * .62}, {cx + l + 8} {cy} '
            f'C {cx + 60} {cy + 22}, {cx - 60} {cy + 22}, {cx - l - 8} {cy} Z" fill="{fill}"/>')


def dans_monticule(x, y, cx, cy, l, h):
    t = (x - cx) / (l + 8)
    if abs(t) >= .96:
        return False
    return cy - h * (1 - t * t) ** .9 + 7 < y < cy + 3


def semis(rng, cx, cy, l, h, n, forme):
    out, essais = [], 0
    while len(out) < n and essais < n * 40:
        essais += 1
        x, y = rng.uniform(cx - l, cx + l), rng.uniform(cy - h, cy + 4)
        if dans_monticule(x, y, cx, cy, l, h):
            out.append(forme(x, y))
    return ''.join(out)


def boite_tomate(x, y, dessus):
    return (f'<g transform="translate({x} {y})" filter="url(#ombre-douce)">'
            '<ellipse cx="0" cy="34" rx="40" ry="10" fill="#9DA5AA"/>'
            '<rect x="-40" y="-70" width="80" height="104" fill="url(#metal)"/>'
            '<rect x="-40" y="-52" width="80" height="64" fill="#D9412E"/>'
            '<rect x="-40" y="-52" width="80" height="6" fill="#F4C542"/><rect x="-40" y="6" width="80" height="6" fill="#F4C542"/>'
            '<circle cx="0" cy="-20" r="19" fill="#F26A4B"/><circle cx="-6" cy="-26" r="5" fill="#FFFFFF" opacity=".4"/>'
            '<path d="M-6 -38 q 7 -9 14 -2" stroke="#3E8E2E" stroke-width="4" fill="none" stroke-linecap="round"/>'
            '<ellipse cx="0" cy="-70" rx="40" ry="11" fill="#D3D8DB"/>'
            f'{dessus}</g>')


def poisson(x, y, angle=0, s=1.0, givre=None):
    g = (f'<g transform="translate({x:.1f} {y:.1f}) rotate({angle:.1f}) scale({s:.2f})">'
         '<path d="M66 0 L 100 -24 L 92 0 L 100 24 Z" fill="#8FA3B2"/>'
         '<path d="M-72 0 C -42 -28, 40 -28, 70 0 C 40 26, -42 26, -72 0 Z" fill="url(#poisson)"/>'
         '<path d="M-8 -21 L 22 -34 L 30 -19 Z" fill="#8FA3B2"/>'
         '<path d="M-58 -7 C -28 -21, 32 -21, 64 -4" stroke="#5C7385" stroke-width="5" fill="none" opacity=".55" stroke-linecap="round"/>'
         '<path d="M-46 -1 C -6 -5, 30 2, 64 -1" stroke="#7D93A4" stroke-width="2.5" fill="none"/>'
         '<path d="M-40 -15 C -47 -5, -47 6, -40 15" stroke="#7B90A1" stroke-width="3" fill="none"/>'
         '<circle cx="-54" cy="-5" r="6.5" fill="#F5F5F2"/><circle cx="-54" cy="-5" r="3.2" fill="#141A1F"/>')
    if givre:
        for _ in range(10):
            g += f'<circle cx="{givre.uniform(-60, 60):.1f}" cy="{givre.uniform(-14, 14):.1f}" r="{givre.uniform(1.5, 3.5):.1f}" fill="#FFFFFF" opacity=".75"/>'
    return g + '</g>'


def feuille_manioc(x, y, angle, s):
    lobes = ''.join(
        f'<path d="M0 0 C 11 -22, 12 -62, 0 -86 C -12 -62, -11 -22, 0 0 Z" transform="rotate({a})" fill="url(#feuille)"/>'
        f'<path d="M0 -4 L 0 -78" transform="rotate({a})" stroke="#2E6A22" stroke-width="2" opacity=".5"/>'
        for a in (-64, -32, 0, 32, 64))
    return (f'<g transform="translate({x} {y}) rotate({angle}) scale({s})">{lobes}'
            '<path d="M0 0 L 0 46" stroke="#6B8E3A" stroke-width="5" stroke-linecap="round"/></g>')


def morceau(rng, x, y, t):
    n = rng.choice((5, 6))
    pts = ' '.join(f'{x + t * rng.uniform(.65, 1) * math.cos(2 * math.pi * k / n + rng.uniform(-.3, .3)):.1f},'
                   f'{y + t * rng.uniform(.65, 1) * math.sin(2 * math.pi * k / n + rng.uniform(-.3, .3)) * .8:.1f}'
                   for k in range(n))
    return f'<polygon points="{pts}" fill="{rng.choice(("#2A2E32", "#33383D", "#3D4349"))}" stroke="#5A6168" stroke-width="1.5" stroke-linejoin="round"/>'


# ------------------------------------------------------------------ produits

def riz_sac():
    rng = random.Random(11)
    corps = 'M218 104 C 270 90, 370 90, 422 104 L 452 316 C 380 344, 260 344, 188 316 Z'
    trame = ''.join(f'<path d="M{x} 80 L {x + 200} 360" stroke="#E6DCC6" stroke-width="2"/>' for x in range(-40, 520, 13))
    trame += ''.join(f'<path d="M{x} 80 L {x - 200} 360" stroke="#EFE8D9" stroke-width="1.5"/>' for x in range(160, 720, 13))
    # un petit tas de grains au pied du sac, pleins et sans contour : lisibles même en vignette
    sol = monticule(486, 340, 40, 20, 'url(#riz)')
    sol += semis(rng, 486, 340, 40, 20, 34, grain_riz(rng, ('#FFFFFF', '#EFE7D4', '#DCD0B6')))
    svg('riz-sac', f'''{ombre_sol(320, 338, 178, 24)}
<g filter="url(#ombre)"><path d="{corps}" fill="url(#sac)"/></g>
<g clip-path="url(#corps-sac)">{trame}
  <path d="M170 234 C 260 258, 380 258, 470 234 L 470 268 C 380 292, 260 292, 170 268 Z" fill="#2F80D0"/>
  <path d="M170 280 C 260 304, 380 304, 470 280 L 470 291 C 380 315, 260 315, 170 291 Z" fill="#E0463A"/>
</g>
<path d="M224 108 C 272 96, 368 96, 416 108 L 402 72 C 358 58, 282 58, 238 72 Z" fill="#F1EADB"/>
<path d="M238 72 C 282 58, 358 58, 402 72" stroke="#CFC4AC" stroke-width="5" fill="none" stroke-linecap="round"/>
<text x="320" y="196" text-anchor="middle" {POLICE} font-weight="700" font-size="52" fill="#8C826C">25 kg</text>
<text x="320" y="226" text-anchor="middle" {POLICE} font-weight="700" font-size="17" letter-spacing="8" fill="#AAA08A">RIZ</text>
{sol}''', defs_sup=f'<clipPath id="corps-sac"><path d="{corps}"/></clipPath>')


def scene_mesure(nom, remplissage, texture, dessus_boite, graine):
    rng = random.Random(graine)
    cx, cy, rx, ry, l, h = 262, 236, 146, 30, 118, 90
    svg(nom, f'''{ombre_sol(300, 332, 220, 24)}
{cuvette_arriere(cx, cy, rx, ry)}
{monticule(cx, cy + 2, l, h, remplissage)}
{texture(rng, cx, cy + 2, l, h)}
{cuvette_avant(cx, cy, rx, ry)}
{boite_tomate(470, 268, dessus_boite(rng))}''')


def grain_riz(rng, couleurs=('#FFFFFF', '#F6F0E2', '#E4D9C2')):
    def forme(x, y):
        a = rng.uniform(0, 180)
        return f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="4.4" ry="2" transform="rotate({a:.0f} {x:.1f} {y:.1f})" fill="{rng.choice(couleurs)}"/>'
    return forme


def haricot_forme(rng, echelle=1):
    def forme(x, y):
        a = rng.uniform(0, 180)
        c = rng.choice(('#9A2A24', '#7E1F1B', '#B3382F', '#8C241F'))
        return (f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{7.5 * echelle}" ry="{4.8 * echelle}" transform="rotate({a:.0f} {x:.1f} {y:.1f})" fill="{c}"/>'
                f'<ellipse cx="{x - 2 * echelle:.1f}" cy="{y - 1.5 * echelle:.1f}" rx="{2.6 * echelle}" ry="{1.3 * echelle}" transform="rotate({a:.0f} {x:.1f} {y:.1f})" fill="#FFFFFF" opacity=".3"/>')
    return forme


def dessus_riz(rng):
    grains = ''.join(f'<ellipse cx="{rng.uniform(-26, 26):.1f}" cy="{rng.uniform(-74, -66):.1f}" rx="4" ry="1.8" transform="rotate({rng.uniform(0, 180):.0f})" fill="#E8DEC8" opacity=".9"/>' for _ in range(0))
    return '<ellipse cx="0" cy="-70" rx="34" ry="8" fill="#FBF7EC"/>' + ''.join(
        f'<ellipse cx="{rng.uniform(-24, 24):.1f}" cy="{rng.uniform(-73, -67):.1f}" rx="3.6" ry="1.6" fill="#E6DCC4"/>' for _ in range(14)) + grains


def dessus_haricot(rng):
    return '<ellipse cx="0" cy="-70" rx="34" ry="8" fill="#7E1F1B"/>' + ''.join(
        f'<ellipse cx="{rng.uniform(-24, 24):.1f}" cy="{rng.uniform(-74, -66):.1f}" rx="6" ry="3.6" fill="{rng.choice(("#9A2A24", "#B3382F"))}"/>' for _ in range(12))


def riz_detail():
    scene_mesure('riz-detail', 'url(#riz)',
                 lambda rng, cx, cy, l, h: semis(rng, cx, cy, l, h, 240, grain_riz(rng)),
                 dessus_riz, 4)


def foufou():
    def texture(rng, cx, cy, l, h):
        points = semis(rng, cx, cy, l, h, 70, lambda x, y: f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rng.uniform(1, 2.4):.1f}" fill="#D9D3C4" opacity=".6"/>')
        reflet = f'<path d="M{cx - 60} {cy - 50} C {cx - 30} {cy - 78}, {cx + 10} {cy - 86}, {cx + 30} {cy - 84}" stroke="#FFFFFF" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>'
        return points + reflet
    scene_mesure('foufou', 'url(#farine)', texture,
                 lambda rng: '<ellipse cx="0" cy="-70" rx="34" ry="8" fill="#FFFFFF"/>', 9)


def haricot():
    scene_mesure('haricot', 'url(#haricot)',
                 lambda rng, cx, cy, l, h: semis(rng, cx, cy, l, h, 150, haricot_forme(rng)),
                 dessus_haricot, 13)


def sucre():
    rng = random.Random(5)
    cristaux = ''
    for _ in range(260):
        x, y = rng.uniform(410, 520), rng.uniform(266, 330)
        t = (x - 465) / 56
        if abs(t) >= 1 or y < 330 - 60 * (1 - abs(t)) + 3:
            continue
        s = rng.uniform(3, 5.5)
        cristaux += (f'<rect x="{x - s / 2:.1f}" y="{y - s / 2:.1f}" width="{s:.1f}" height="{s:.1f}" '
                     f'transform="rotate({rng.uniform(0, 90):.0f} {x:.1f} {y:.1f})" fill="{rng.choice(("#FFFFFF", "#F1F4F2", "#D8DFDA"))}"/>')
    svg('sucre', f'''{ombre_sol(320, 334, 210, 22)}
<g filter="url(#ombre)">
  <path d="M200 128 L 340 128 L 340 326 L 200 326 Z" fill="#FAFBFA"/>
  <path d="M340 128 L 392 106 L 392 304 L 340 326 Z" fill="#D5DDD8"/>
  <path d="M200 128 L 252 106 L 392 106 L 340 128 Z" fill="#EEF2EF"/>
</g>
<path d="M200 176 L 340 176 L 340 256 L 200 256 Z" fill="#2D6FB8"/>
<path d="M340 176 L 392 154 L 392 234 L 340 256 Z" fill="#23598F"/>
<text x="270" y="214" text-anchor="middle" {POLICE} font-weight="700" font-size="30" fill="#FFFFFF">SUCRE</text>
<text x="270" y="242" text-anchor="middle" {POLICE} font-weight="700" font-size="20" fill="#CFE3F7">1 kg</text>
<path d="M214 290 L 326 290 M214 304 L 290 304" stroke="#E1E7E3" stroke-width="4" stroke-linecap="round"/>
<g filter="url(#ombre-douce)"><path d="M405 330 C 428 302, 448 272, 465 270 C 482 272, 502 302, 525 330 Z" fill="url(#farine)"/></g>
{cristaux}''')


def huile():
    svg('huile', f'''{ombre_sol(320, 344, 120, 18, .14)}
<g filter="url(#ombre)">
  <path d="M294 132 C 252 150, 238 176, 238 206 L 238 314 C 238 332, 252 342, 270 342 L 370 342 C 388 342, 402 332, 402 314 L 402 206 C 402 176, 388 150, 346 132 Z" fill="url(#huile)"/>
  <path d="M300 104 L 340 104 L 346 132 L 294 132 Z" fill="#F6DC86"/>
  <rect x="294" y="66" width="52" height="30" rx="7" fill="#3E7A2C"/>
  <rect x="290" y="94" width="60" height="12" rx="4" fill="#2F6322"/>
</g>
<path d="M294 132 C 252 150, 238 176, 238 206 L 402 206 C 402 176, 388 150, 346 132 Z" fill="#FBEAB0" opacity=".35"/>
<rect x="238" y="214" width="164" height="80" fill="#FFFFFF"/>
<rect x="238" y="214" width="164" height="14" fill="#42D02D"/>
<text x="320" y="262" text-anchor="middle" {POLICE} font-weight="700" font-size="30" fill="#0B120C">HUILE</text>
<text x="320" y="284" text-anchor="middle" {POLICE} font-weight="700" font-size="16" fill="#6F766F">1 L</text>
<rect x="254" y="146" width="12" height="176" rx="6" fill="#FFFFFF" opacity=".35"/>
<path d="M238 306 L 402 306 M238 322 L 402 322" stroke="#C9870C" stroke-width="2" opacity=".35"/>''')


def oeufs():
    arr_g, arr_d, av_g, av_d = (192, 138), (448, 138), (122, 300), (518, 300)
    contenu = (ombre_sol(320, 326, 210, 22) +
               f'<g filter="url(#ombre)"><path d="M{av_g[0]} {av_g[1]} L {av_d[0]} {av_d[1]} L {av_d[0] - 8} {av_d[1] + 18} L {av_g[0] + 8} {av_g[1] + 18} Z" fill="#B9AB90"/>'
               f'<path d="M{arr_g[0]} {arr_g[1]} L {arr_d[0]} {arr_d[1]} L {av_d[0]} {av_d[1]} L {av_g[0]} {av_g[1]} Z" fill="#D9CEB7"/></g>')
    for r in range(5):
        t = r / 4
        gauche = arr_g[0] + (av_g[0] - arr_g[0]) * t
        droite = arr_d[0] + (av_d[0] - arr_d[0]) * t
        y, s = 152 + r * 32, .78 + r * .07
        for c in range(6):
            x = gauche + (droite - gauche) * (c + .5) / 6
            contenu += (f'<ellipse cx="{x:.1f}" cy="{y + 16 * s:.1f}" rx="{25 * s:.1f}" ry="{10 * s:.1f}" fill="#C6B797"/>'
                        f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{21 * s:.1f}" ry="{26 * s:.1f}" fill="url(#oeuf)"/>'
                        f'<ellipse cx="{x - 7 * s:.1f}" cy="{y - 9 * s:.1f}" rx="{5 * s:.1f}" ry="{8 * s:.1f}" fill="#FFFFFF" opacity=".55"/>')
    svg('oeufs', contenu)


def mpiodi_carton():
    rng = random.Random(8)
    poissons = ''.join(poisson(x, y, a, .92, rng) for x, y, a in
                       ((268, 176, -14), (372, 170, 12), (320, 186, -3), (240, 196, 8), (402, 194, -10)))
    svg('mpiodi-carton', f'''{ombre_sol(320, 338, 196, 24)}
<path d="M196 168 L 444 168 L 422 112 L 218 112 Z" fill="#D2A162"/>
<path d="M196 168 L 444 168 L 470 198 L 170 198 Z" fill="#7F552A"/>
{poissons}
<path d="M170 198 L 196 168 L 150 120 L 116 152 Z" fill="#C38E52"/>
<path d="M444 168 L 470 198 L 528 152 L 492 120 Z" fill="#C38E52"/>
<g filter="url(#ombre)"><path d="M170 198 L 470 198 L 456 336 L 184 336 Z" fill="url(#carton)"/></g>
<path d="M300 198 L 340 198 L 338 336 L 302 336 Z" fill="#E7C28C" opacity=".6"/>
<text x="320" y="272" text-anchor="middle" {POLICE} font-weight="700" font-size="36" fill="#7A5328">MPIODI</text>
<text x="320" y="302" text-anchor="middle" {POLICE} font-weight="700" font-size="18" fill="#8E6737">carton</text>''')


def mpiodi_detail():
    tas = ''.join(poisson(x, y, a, .95) for x, y, a in
                  ((250, 228, -24), (390, 232, 22), (286, 212, -10), (354, 212, 10), (320, 234, 0)))
    svg('mpiodi-detail', plateau() + tas)


def kwanga():
    svg('kwanga', f'''{plateau()}
<g filter="url(#ombre)" transform="translate(336 196) rotate(9)">
  <rect x="-168" y="-36" width="336" height="72" rx="36" fill="url(#feuille-sombre)"/>
  <path d="M-150 -6 C -60 -14, 60 -14, 150 -6" stroke="#25531B" stroke-width="3" fill="none" opacity="0.55"/>
  <rect x="-96" y="-38" width="15" height="76" rx="5" fill="#EADBB8"/>
  <rect x="-8" y="-38" width="15" height="76" rx="5" fill="#EADBB8"/>
  <rect x="80" y="-38" width="15" height="76" rx="5" fill="#EADBB8"/>
</g>
<g filter="url(#ombre)" transform="translate(300 232) rotate(-8)">
  <rect x="-160" y="-38" width="320" height="76" rx="38" fill="url(#manioc)"/>
  <path d="M-130 -8 C -40 -18, 40 -2, 120 -10 M-120 14 C -30 6, 50 20, 130 10" stroke="#CFC3AA" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M-160 0 A38 38 0 0 1 -122 -38 H40 C 20 -20, 20 20, 40 38 H-122 A38 38 0 0 1 -160 0 Z" fill="url(#feuille)"/>
  <path d="M-146 -4 C -90 -12, -30 -12, 24 -4" stroke="#2E6A22" stroke-width="3" fill="none" opacity="0.55"/>
  <path d="M-120 -30 L -104 -6 M-84 -34 L -68 -8 M-48 -34 L -32 -8" stroke="#2E6A22" stroke-width="2.5" opacity="0.4" stroke-linecap="round"/>
  <rect x="-100" y="-40" width="15" height="80" rx="5" fill="#EADBB8"/>
  <rect x="-18" y="-40" width="15" height="80" rx="5" fill="#EADBB8"/>
</g>''')


def saka_saka():
    rng = random.Random(21)
    cx, cy, l, h = 330, 214, 132, 70
    texture = semis(rng, cx, cy + 2, l, h, 190, lambda x, y:
                    f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rng.uniform(2.5, 6.5):.1f}" fill="{rng.choice(("#1F4E19", "#2C6624", "#3F8A34", "#56A043"))}"/>')
    svg('saka-saka', f'''{ombre_sol(330, 336, 190, 22)}
{feuille_manioc(150, 300, -28, 1.0)}
<g filter="url(#ombre)"><path d="M{cx - 160} {cy} C {cx - 150} {cy + 96}, {cx - 70} {cy + 122}, {cx} {cy + 122} C {cx + 70} {cy + 122}, {cx + 150} {cy + 96}, {cx + 160} {cy} Z" fill="url(#bol)"/></g>
<ellipse cx="{cx}" cy="{cy}" rx="160" ry="30" fill="#EEF3EF" stroke="#3E7A2C" stroke-width="8"/>
{monticule(cx, cy + 2, l, h, '#2F6B26')}
{texture}
<path d="M{cx - 160} {cy} A 160 30 0 0 0 {cx + 160} {cy}" fill="none" stroke="#3E7A2C" stroke-width="8"/>
{feuille_manioc(500, 322, 34, .8)}''')


def charbon():
    rng = random.Random(3)
    corps = 'M204 156 C 268 140, 372 140, 436 156 L 460 318 C 386 348, 254 348, 180 318 Z'
    trame = ''.join(f'<path d="M{x} 120 L {x + 200} 380" stroke="#4E6F8B" stroke-width="2" opacity=".45"/>' for x in range(-40, 520, 13))
    morceaux = []
    while len(morceaux) < 75:
        x, y = rng.uniform(206, 434), rng.uniform(80, 166)
        if ((x - 320) / 116) ** 2 + ((y - 166) / 82) ** 2 < 1:
            morceaux.append((y, morceau(rng, x, y, rng.uniform(12, 22))))
    tas = ''.join(m for _, m in sorted(morceaux))
    sol = ''.join(morceau(rng, x, y, t) for x, y, t in ((478, 330, 16), (506, 340, 12), (452, 344, 11)))
    svg('charbon', f'''{ombre_sol(320, 340, 186, 24)}
<g filter="url(#ombre)"><path d="{corps}" fill="url(#sac-sombre)"/></g>
<g clip-path="url(#corps-charbon)">{trame}</g>
<ellipse cx="320" cy="158" rx="118" ry="26" fill="#23272B"/>
{tas}
<path d="M202 158 A 118 26 0 0 0 438 158" fill="none" stroke="#557795" stroke-width="12" stroke-linecap="round"/>
{sol}''', defs_sup=f'<clipPath id="corps-charbon"><path d="{corps}"/></clipPath>')


# ------------------------------------------------------------------ marchés

def tomates(x, base):
    out = ''
    for dx, dy in ((0, 0), (28, 0), (56, 0), (14, -24), (42, -24), (28, -48)):
        cx, cy = x + dx, base - 14 + dy
        out += (f'<circle cx="{cx}" cy="{cy}" r="15" fill="#E0463A"/><circle cx="{cx - 5}" cy="{cy - 5}" r="4" fill="#FFFFFF" opacity=".45"/>'
                f'<path d="M{cx - 5} {cy - 13} l5 4 l5 -4" stroke="#3E7A2C" stroke-width="3" fill="none" stroke-linecap="round"/>')
    return out


def oignons(x, base):
    out = ''
    for dx, dy in ((0, 0), (27, 0), (54, 0), (13, -22), (40, -22)):
        cx, cy = x + dx, base - 13 + dy
        out += (f'<path d="M{cx} {cy - 19} C {cx + 4} {cy - 12}, {cx + 15} {cy - 10}, {cx + 15} {cy + 1} C {cx + 15} {cy + 11}, {cx - 15} {cy + 11}, {cx - 15} {cy + 1} C {cx - 15} {cy - 10}, {cx - 4} {cy - 12}, {cx} {cy - 19} Z" fill="#C98B5A"/>'
                f'<path d="M{cx - 5} {cy - 6} C {cx - 7} {cy}, {cx - 7} {cy + 5}, {cx - 4} {cy + 8}" stroke="#E8B489" stroke-width="2" fill="none"/>')
    return out


def feuilles(x, base):
    return feuille_manioc(x - 18, base - 24, -22, .48) + feuille_manioc(x + 18, base - 24, 22, .48) + feuille_manioc(x, base - 26, 0, .55)


def maniocs(x, base):
    out = ''
    for dx, dy, a in ((0, -10, -4), (14, -26, 5), (4, -42, -8)):
        out += (f'<g transform="translate({x + dx} {base + dy}) rotate({a})">'
                '<path d="M0 0 C 20 -10, 70 -10, 96 0 C 70 10, 20 10, 0 0 Z" fill="#8B5A2B"/>'
                '<ellipse cx="3" cy="0" rx="4" ry="6" fill="#EFE6D2"/></g>')
    return out


def petit_sac(x, base, sombre=False):
    s = .3
    fond = 'url(#sac-sombre)' if sombre else 'url(#sac)'
    bande = '#557795' if sombre else '#2F80D0'
    haut = (''.join(f'<circle cx="{280 + i * 16}" cy="{96 + (i % 2) * 6}" r="14" fill="#2F3438"/>' for i in range(6)) if sombre
            else '<path d="M224 108 C 272 96, 368 96, 416 108 L 402 72 C 358 58, 282 58, 238 72 Z" fill="#F1EADB"/>')
    return (f'<g transform="translate({x - 320 * s:.1f} {base - 340 * s:.1f}) scale({s})" filter="url(#ombre-douce)">'
            '<path d="M218 104 C 270 90, 370 90, 422 104 L 452 316 C 380 344, 260 344, 188 316 Z" fill="' + fond + '"/>'
            f'<path d="M196 236 C 270 258, 370 258, 444 236 L 447 268 C 372 290, 268 290, 193 268 Z" fill="{bande}"/>'
            f'{haut}</g>')


def poissons_plateau(x, base):
    return (f'<ellipse cx="{x + 52}" cy="{base - 8}" rx="66" ry="15" fill="url(#plateau)"/>'
            + poisson(x + 32, base - 18, -12, .38) + poisson(x + 74, base - 20, 10, .38) + poisson(x + 52, base - 28, 0, .38))


def etal(nom, c1, c2, produits):
    bandes = ''.join(f'<rect x="{x}" y="70" width="37" height="90" fill="{c1 if i % 2 == 0 else c2}"/>' for i, x in enumerate(range(56, 430, 37)))
    festons = ''.join(f'<circle cx="{x + 18.5}" cy="146" r="18.5" fill="{c1 if i % 2 == 0 else c2}"/>' for i, x in enumerate(range(56, 424, 37)))
    svg(f'marche-{nom}', f'''{ombre_sol(240, 314, 196, 20, .14)}
<rect x="88" y="120" width="11" height="190" rx="4" fill="url(#bois)"/>
<rect x="381" y="120" width="11" height="190" rx="4" fill="url(#bois)"/>
<g filter="url(#ombre)"><g clip-path="url(#auvent)">{bandes}</g>{festons}</g>
<g filter="url(#ombre-douce)">
  <rect x="80" y="224" width="320" height="16" rx="4" fill="#DDAE6E"/>
  <rect x="90" y="240" width="300" height="66" rx="6" fill="url(#bois)"/>
</g>
<path d="M90 262 L 390 262 M90 284 L 390 284" stroke="#8A5F2E" stroke-width="2" opacity=".45"/>
{produits}''', w=480, h=360, bulles=((70, 52, 36, .45), (420, 318, 54, .30)),
        defs_sup='<clipPath id="auvent"><path d="M70 80 L 410 80 L 424 146 L 56 146 Z"/></clipPath>')


if __name__ == '__main__':
    for dessin in (riz_sac, riz_detail, foufou, haricot, sucre, huile, oeufs,
                   mpiodi_carton, mpiodi_detail, kwanga, saka_saka, charbon):
        dessin()
    etal('total', '#42D02D', '#FFFFFF', tomates(112, 226) + oignons(208, 226) + tomates(296, 226))
    etal('poto-poto', '#F2994A', '#FFF4E0', feuilles(150, 226) + maniocs(196, 226) + feuilles(340, 226))
    etal('moungali', '#2D6FB8', '#FFFFFF', petit_sac(150, 226) + petit_sac(240, 226) + petit_sac(330, 226))
    etal('ouenze', '#D9412E', '#FFFFFF', poissons_plateau(120, 226) + petit_sac(310, 226, sombre=True) + petit_sac(360, 226, sombre=True))
    print(f'{len(list(SORTIE.glob("*.svg")))} illustrations SVG dans {SORTIE.relative_to(RACINE)}')
