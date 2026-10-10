# Zando Prix

**Les prix annoncés aujourd'hui sur quatre marchés de Brazzaville, avant marchandage.**

Zando Prix compare les prix de 12 produits courants (riz, foufou, mpiodi, kwanga, makala…)
sur le Marché Total, Poto-Poto, Moungali et Ouenzé. L'application dit où c'est le moins cher
et, surtout, si l'écart **vaut le prix du taxi** depuis le marché où l'on se trouve.

C'est une application web progressive (PWA) : elle s'installe sur l'écran d'accueil,
fonctionne sans réseau et reste légère (moins de 300 Ko au premier écran).

> ⚠ Les 48 prix du fichier de données sont **provisoires** : plausibles mais inventés,
> en attente des relevés terrain. Voir `../DEMANDES-AU-PM.md`.

---

## Fonctionnalités

- **Tableau des prix** : 12 produits × 4 marchés, avec la fraîcheur de chaque relevé.
- **Fiche produit** : prix par marché du moins cher au plus cher, unité de référence,
  mot employé par la vendeuse, prix « instable » (fourchette) ou « pas vu ce jour ».
- **Badge « le moins cher relevé »**, reconnaissable autrement que par la couleur.
- **Écart utile** : « Ça vaut le déplacement » ou non, calculé depuis le point de départ
  et le prix réel de l'aller-retour.
- **Point de départ** : choisi à la main, ou deviné à partir de la position de l'appareil
  (à la demande uniquement, jamais au chargement).
- **Carte des marchés** en lecture seule (Leaflet + OpenStreetMap), chargée à la demande. Aucun itinéraire.
- **Recherche tolérante** : accents, tirets, majuscules ignorés ; noms locaux reconnus
  (*loso*, *madesu*, *makala*, *pondu*…).
- **Panier** : un écran liste les 12 produits **sans leurs prix** ; on choisit les quantités,
  comptées en unités de référence (4 = quatre sacs de 25 kg). L'application classe alors les
  marchés par total du panier et dit si le déplacement se rembourse, taxi déduit depuis le
  point de départ. Un marché qui ne fournit pas tout le panier est écarté du classement.
- **Mes prix** : l'utilisateur propose un prix vu sur place, sans compte. La contribution
  reste sur son téléphone et n'entre jamais dans les comparaisons.
- **Comment on calcule** : un écran explique les règles avec les chiffres du fichier en cours.
- **Hors ligne** : derniers prix connus consultables sans réseau (sauf la carte).

## Démarrage rapide

Prérequis : **Node.js 22+** (testé avec 24). Python 3 ne sert qu'aux scripts d'images d'`outils/`.

```bash
npm install        # Tailwind CSS (compilation) et Leaflet
npm run build      # données → validation → tests → CSS → version du service worker
npm start          # http://localhost:8000
```

L'application est un site statique : aucun serveur applicatif, aucune base de données.
`npm run build` rassemble les fichiers livrés dans `public/` (sans les sources, les outils
ni `node_modules`) : c'est ce dossier qu'on publie.

### Déploiement sur Vercel

Vercel lance `npm run build` et sert `public/`, son dossier par défaut. `vercel.json` renvoie
`index.html` pour toute adresse sans extension (`/carte`, `/produit/riz-sac`…) : c'est l'application
qui affiche l'écran demandé. Les anciennes adresses à dièse (`/#/carte`) redirigent vers les nouvelles.
Tant que `meta.dates_glissantes` vaut `true` dans `data/prix.json` (données de démonstration),
l'application décale les dates à l'affichage : le relevé le plus récent date toujours d'hier,
et **les prix ne périment jamais**, même sans nouveau déploiement.

> La géolocalisation et le service worker exigent **HTTPS** en production
> (`localhost` est toléré en développement).

## Scripts

| Commande | Rôle |
|---|---|
| `npm run donnees` | Régénère `data/prix.json` et `data/prix-demo.json`, datés par rapport à aujourd'hui |
| `npm run valider` | Vérifie `data/prix.json` avant déploiement (structure, dates, trajets, positions) |
| `npm test` | Lance les 90 tests : règles métier, contributions, géolocalisation, panier |
| `npm run css` | Compile `src/styles.css` en `css/style.css` (Tailwind CSS v4, minifié) |
| `npm run version` | Estampille `sw.js` avec l'empreinte des fichiers, pour forcer la mise à jour du cache |
| `npm run publier` | Copie les fichiers livrés dans `public/`, le dossier servi en production |
| `npm run build` | Enchaîne tout ce qui précède ; s'arrête à la première erreur |
| `npm start` | Serveur local sur le port 8000 (`outils/serveur.js`, mêmes réécritures que `vercel.json`) ; il sert `sw.js` avec une version à jour, pour que le cache hors ligne ne ressorte jamais l'ancien code |

## Structure

```
zando-prix/
├── index.html            Coquille de l'application, sprite d'icônes Lucide
├── manifest.json         Manifeste PWA
├── sw.js                 Service worker : cache hors ligne, prix toujours redemandés au réseau
├── js/
│   ├── app.js            Point d'entrée : chargement des prix, table des routes (/carte, /produit/:id…)
│   ├── vues/             Un fichier par écran, chacun exporte rendreXxx(vue, param)
│   │   ├── accueil.js      /             tableau des prix, recherche, carrousel
│   │   ├── produit.js      /produit/:id  verdict, prix par marché, proposer un prix
│   │   ├── carte.js        /carte/:id    carte et cartes des marchés
│   │   ├── panier.js       /panier
│   │   ├── mes-prix.js     /mes-prix
│   │   ├── mon-marche.js   /mon-marche   point de départ
│   │   └── calcul.js       /calcul       « comment on calcule »
│   ├── etat.js           Données chargées, règles appliquées à chaque produit, point de départ
│   ├── composants.js     Morceaux d'interface partagés : en-tête, carte de verdict, vignettes…
│   ├── navigation.js     naviguer('/carte') et barres de navigation autour des écrans
│   ├── position.js       Géolocalisation côté interface : explications, autorisation, marché proche
│   ├── carrousel.js      Carrousels horizontaux à la souris (molette, glisser, flèches)
│   ├── html.js           Outils d'affichage : échappement, icônes, formats
│   ├── regles.js         Règles métier R4, R5, R6, R9 — sans DOM, testables seules
│   ├── contributions.js  Prix proposés par l'utilisateur (R7, US-07, US-08)
│   ├── geo.js            Position de l'appareil et marché le plus proche
│   ├── panier.js         Panier : quantités, total par marché, économie nette du trajet
│   ├── prefs.js          Point de départ mémorisé sur le téléphone
│   └── carte.js          Carte Leaflet, chargée à la demande par vues/carte.js
├── data/
│   ├── prix.json         Fichier servi en production
│   ├── prix-demo.json    Jeu de recette : dates choisies pour exercer chaque cas des règles
│   └── sources-photos.json  Origine et licence de chaque photo
├── src/
│   ├── styles.css        Source Tailwind
│   └── illustrations/    Sources SVG des illustrations
├── css/style.css         CSS compilé (généré)
├── images/               Photos des produits, illustrations des marchés (WebP)
├── fonts/                Plus Jakarta Sans + licence OFL
├── icones/               Icônes de l'application
├── vendor/leaflet/       Leaflet 1.9.4, hébergé avec l'application
├── outils/               Générateur de données, validateur, tests, publication, scripts d'images
└── public/               Site publié (généré par npm run build, non versionné)
```

## Règles métier

Implémentées dans `js/regles.js`, `js/contributions.js` et `js/panier.js`, couvertes par les tests de `outils/`.

| Règle | Comportement |
|---|---|
| **R2** | Prix en francs CFA, sans décimale |
| **R4** — écart utile | Évaluable si au moins 3 marchés sur 4 ont un relevé de moins de 7 jours. Depuis un point de départ connu : écart comparé au prix de ce trajet précis. Sinon : écart max − min comparé au seuil général (2 000 F) |
| **R5** — badge | Au moins 2 marchés récents, prix le plus bas strictement inférieur aux autres, jamais sur un prix instable, périmé ou une contribution |
| **R6** — fraîcheur | Moins de 7 jours : vert · 7 à 14 jours : orange « à vérifier » · au-delà : périmé, exclu des comparaisons |
| **R7** — écart important | Une contribution à plus de 50 % du dernier relevé du même marché est signalée |
| **R9** — dates | Toujours en jours écoulés (« hier », « il y a 3 jours »), jamais de date affichée |
| **Panier** | Total = prix unitaire × quantité, à unité de référence identique. Seuls les marchés ayant un prix utilisable pour **tous** les produits sont classés ; « pas vu », instable et périmé écartent le marché. Le verdict applique R4 au panier entier : économie − aller-retour |

## Mettre à jour les prix

Les prix et les trajets sont définis dans `outils/generer-donnees.js`. Les dates y sont
**calculées par rapport au jour d'exécution**, jamais écrites en dur.

1. Reporter les relevés terrain dans `PRODUITS` (un nombre = prix relevé, `null` = pas vu ce jour,
   `[min, max]` = prix instable) et les prix d'aller-retour dans `TRAJETS`.
2. Retirer la mention « provisoire » de `source_prix` une fois les vrais relevés saisis.
3. Lancer `npm run build`. Le validateur refuse le déploiement en cas d'erreur
   (virgule oubliée, date future, fourchette incohérente…) et alerte si des prix ne sont plus verts.

Le fichier `data/prix.json` peut aussi être édité à la main : lancer alors au minimum `npm run valider`.

> **Démo client** : rien à faire. Avec les dates glissantes, les relevés restent au vert.
> Quand les vrais relevés terrain sont saisis, passer `dates_glissantes` à `false` dans
> `outils/generer-donnees.js` : les prix vieillissent alors normalement (orange à 7 jours, périmés après 14).

## Recette : simuler une autre date

Le paramètre `?date=` décale la date de consultation pour vérifier la péremption sans toucher aux données :

```
http://localhost:8000/?date=+9           → dans 9 jours : prix en orange
http://localhost:8000/?date=+20          → dans 20 jours : prix périmés
http://localhost:8000/?date=2026-09-30   → à une date fixe
```

Un bandeau signale que la date est décalée. Pour valider le jeu de recette :
`node outils/valider.js data/prix-demo.json --recette`.

## Vie privée

- La position de l'appareil n'est **ni enregistrée ni envoyée** : elle sert à un calcul local
  et reste en mémoire le temps de la session. Seul l'identifiant du marché retenu est conservé.
- Les contributions restent dans le `localStorage` du téléphone. Rien n'est transmis.
- Quand la carte est ouverte, les tuiles sont demandées aux serveurs OpenStreetMap.

## Limites connues

- **Prix provisoires** : à remplacer par les relevés terrain.
- **Positions des marchés** reprises d'OpenStreetMap ; « Marché de Ouenzé » = Marché Soukissa, à confirmer.
- **Tuiles de carte** : les serveurs OpenStreetMap conviennent à un prototype, pas à la production.
  Prévoir un fournisseur avec clé (MapTiler, Stadia Maps…) ou des tuiles hébergées.
- **Pas de carte hors ligne** ; la liste des marchés reste disponible.

Les décisions en attente côté produit sont détaillées dans `../DEMANDES-AU-PM.md`.

## Crédits et licences

| Ressource | Licence |
|---|---|
| Photos des produits et photo d'en-tête | CC0 / domaine public — détail dans `../SOURCES-IMAGES.md` |
| Illustrations des marchés | Créations originales |
| Plus Jakarta Sans | SIL Open Font License 1.1 |
| Leaflet 1.9.4 | BSD 2 clauses |
| Tailwind CSS 4 | MIT |
| Icônes Lucide | ISC |
| Fonds de carte | © contributeurs OpenStreetMap, ODbL |
