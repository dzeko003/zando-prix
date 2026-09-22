'use strict';

/**
 * Carte des marchés (/carte/:produit) : la carte Leaflet (js/carte.js, chargée
 * à la demande) et un carrousel des quatre marchés avec le prix du produit choisi.
 */

import { fcfa, coutTrajet } from '../regles.js';
import { distanceKm, distanceLisible } from '../geo.js';
import { donnees, evaluation, vaut, departMarche, changerDepart, produit as trouverProduit, marche } from '../etat.js';
import { $, esc, ic, nombre, joursCourt, metres, coordonnees } from '../html.js';
import { HAUT } from '../composants.js';
import { fleches, activerDefilement } from '../carrousel.js';
import { majBarreDepart, remplacerAdresse } from '../navigation.js';
import { localiserMarcheProche, messageErreur, boutonAmeliorer, dernierePosition } from '../position.js';

let moduleCarte = null;   // js/carte.js, importé seulement à la première ouverture

/** À appeler en quittant l'écran : Leaflet garde sinon des écouteurs sur l'ancien conteneur. */
export function quitterCarte() {
  moduleCarte?.detruire();
}

export async function rendreCarte(vue, idProduit) {
  const depart = departMarche();
  let produit = trouverProduit(idProduit) || donnees.produits.find(vaut) || donnees.produits[0];

  vue.innerHTML = `
  <div class="relative lg:grid lg:grid-cols-12 lg:items-start lg:gap-6 lg:pt-4">
    <div class="lg:sticky lg:top-24 lg:col-span-8">
      <div id="carte" class="h-[62vh] min-h-96 w-full bg-[#E9ECEA] md:mt-4 md:overflow-hidden md:rounded-hero lg:mt-0 lg:h-[calc(100dvh-8rem)]"
           role="region" aria-label="Carte des quatre marchés"></div>
    </div>
    <aside class="lg:col-span-4">
      <div class="pointer-events-none absolute inset-x-0 top-0 z-[500] bg-gradient-to-b from-fond via-fond/85 to-transparent px-4 pb-10 ${HAUT} md:mt-4 md:px-5 md:pt-5 lg:pointer-events-auto lg:static lg:z-auto lg:mt-0 lg:bg-none lg:p-0">
        <div class="pointer-events-auto flex items-center gap-3">
          <a href="/" class="bouton-rond" aria-label="Retour">${ic('retour')}</a>
          <h1 class="flex-1 text-center text-[1.1rem] font-semibold tracking-tight lg:text-left lg:text-[1.3rem]">Marchés près de vous</h1>
          <span class="size-11 shrink-0 lg:hidden"></span>
        </div>
        <div class="pointer-events-auto mt-3 flex items-center gap-2.5">
          <label class="relative flex-1">
            ${ic('recherche', 'pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-gris-clair')}
            <select id="carte-produit" class="champ-recherche appearance-none pr-10" aria-label="Produit affiché sur la carte">
              ${donnees.produits.map(p => `<option value="${esc(p.id)}"${p.id === produit.id ? ' selected' : ''}>${esc(p.nom)}</option>`).join('')}
            </select>
            ${ic('chevron-bas', 'pointer-events-none absolute right-4 top-1/2 z-10 size-4 -translate-y-1/2 text-gris')}
          </label>
          </div>
        <p id="carte-position-info" class="pointer-events-auto mt-2.5 flex items-center gap-2 rounded-2xl bg-white/95 px-3.5 py-2 text-[0.74rem] text-gris shadow-carte ring-1 ring-black/5" hidden></p>
      <p id="carte-msg" class="pointer-events-auto mt-2.5 rounded-2xl bg-ocre-pale px-3.5 py-2 text-[0.76rem] font-semibold text-ocre" hidden></p>
      </div>

      <section class="relative z-[600] -mt-7 rounded-t-hero bg-fond pt-5 md:mt-0 lg:z-auto lg:mt-6 lg:rounded-none lg:bg-transparent lg:pt-0">
        <div class="mb-3 flex items-center justify-between gap-3 px-4 md:px-0">
          <h2 id="carte-titre" class="titre-section shrink-0">${titreListe(depart)}</h2>
          <span class="flex min-w-0 items-center gap-3">
            <span id="carte-produit-nom" class="voir-tout truncate">${esc(produit.nom)}</span>
            ${fleches('marches')}
          </span>
        </div>
        <div id="carte-cartes" class="flex snap-x scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] md:scroll-px-0 md:px-0 lg:grid lg:grid-cols-2 lg:overflow-visible">${cartesMarches(produit, depart)}</div>
        <p class="px-4 pt-3 text-[0.72rem] leading-relaxed text-gris-clair md:px-0">Prix annoncés, avant marchandage.
          Épingle verte : le moins cher relevé pour ce produit.</p>
      </section>
    </aside>
  </div>`;

  const majDefile = activerDefilement($('#carte-cartes'), 'marches');
  const optionsCarte = () => {
    const ev = evaluation(produit.id);
    return { marches: donnees.marches, lignes: ev.lignes, badge: ev.badge, produit, format: fcfa };
  };

  const rafraichir = () => {
    const d = departMarche();
    $('#carte-cartes').innerHTML = cartesMarches(produit, d);
    majDefile();
    $('#carte-titre').textContent = titreListe(d);
    $('#carte-produit-nom').textContent = produit.nom;
    moduleCarte?.epingles(optionsCarte());
  };

  $('#carte-produit').addEventListener('change', e => {
    produit = trouverProduit(e.target.value);
    remplacerAdresse('/carte/' + encodeURIComponent(produit.id));
    rafraichir();
  });
  $('#carte-cartes').addEventListener('click', e => {
    const b = e.target.closest('[data-marche]');
    if (b) moduleCarte?.centrer(marche(b.dataset.marche));
  });

  // « Vous êtes ici » : mesure précise, à la demande, dessinée sur la carte.
  const localiserIci = async () => {
    $('#carte-msg').hidden = true;
    moduleCarte?.enCours(true);
    try {
      const { position, proche, precise } = await localiserMarcheProche();
      moduleCarte?.positionUtilisateur(position, proche?.marche);
      afficherCoordonnees(position);
      if (!proche) throw new Error('loin');
      if (!precise) {
        message(`Position imprécise, à ± ${metres(position.precision)} : elle vient sans doute du réseau (Wi-Fi ou adresse IP), pas du GPS.`,
          boutonAmeliorer(position.precision, localiserIci));
      } else {
        changerDepart(proche.marche.id, 'position', proche.km);
        rafraichir();
        majBarreDepart();
      }
    } catch (err) {
      const texte = messageErreur(err);
      if (texte) message(texte.replace(' ci-dessous', ' dans « Point de départ »'));
    } finally {
      moduleCarte?.enCours(false);
    }
  };

  if (navigator.onLine === false) {
    message('Carte indisponible hors connexion. Les marchés restent listés ci-dessous.');
    return;
  }
  try {
    moduleCarte = await import('../carte.js');
    if (!document.getElementById('carte')) return;   // l'utilisateur est déjà parti
    await moduleCarte.afficher($('#carte'), { ...optionsCarte(), surPosition: localiserIci });
    const connue = dernierePosition();
    if (connue) {
      moduleCarte.positionUtilisateur(connue, null, false);
      afficherCoordonnees(connue);
    }
  } catch (err) {
    console.warn('[zando] carte :', err.message);
    message('La carte n’a pas pu se charger. Les marchés restent listés ci-dessous.');
  }
}

const titreListe = depart => (depart ? 'Marchés les plus proches' : 'Les quatre marchés');

/** Message sous la recherche, suivi éventuellement d'un bouton d'action. */
function message(texte, bouton = null) {
  const m = $('#carte-msg');
  m.textContent = texte;
  if (bouton) m.append(' ', bouton);
  m.hidden = false;
}

function afficherCoordonnees(pos) {
  const el = $('#carte-position-info');
  el.innerHTML = `${ic('viseur', 'size-4 shrink-0 text-vert-600')}<span>Votre position : ` +
    `<b class="font-semibold tabular-nums text-encre">${coordonnees(pos)}</b> · à ± ${metres(pos.precision)}</span>`;
  el.hidden = false;
}

/* Une carte par marché, du plus proche au plus loin quand le départ est connu. */
function cartesMarches(produit, depart) {
  const ev = evaluation(produit.id);
  const lignes = [...ev.lignes];
  if (depart) {
    lignes.sort((a, b) => distanceKm(depart.marche.position, a.marche.position) -
                          distanceKm(depart.marche.position, b.marche.position));
  }
  return lignes.map(l => carteMarche(l, ev.badge === l.marche.id, depart)).join('');
}

function carteMarche(l, moinsCher, depart) {
  const m = l.marche;
  const estDepart = depart?.marche.id === m.id;
  const prix = l.statut === 'pas_vu' ? 'pas vu ce jour'
    : l.statut === 'instable' ? `${nombre(l.prix_min)} – ${nombre(l.prix_max)} F` : fcfa(l.prix);
  const couleur = l.etat === 'orange' ? 'text-ocre' : l.etat === 'perime' ? 'text-gris-clair line-through' : 'text-encre';
  const lieu = estDepart ? 'votre marché'
    : depart ? distanceLisible(distanceKm(depart.marche.position, m.position)) : m.arrondissement;
  const trajet = depart && !estDepart ? `A/R ${fcfa(coutTrajet(depart.marche.id, m.id, donnees.meta))}` : '';
  return `<button type="button" data-marche="${esc(m.id)}" class="carte w-44 shrink-0 snap-start p-2.5 text-left transition last:snap-end active:scale-[0.98] lg:w-auto">
      <span class="relative flex aspect-[4/3] items-end overflow-hidden rounded-2xl bg-vert-100 p-2">
        <img src="/images/marches/${esc(m.id)}.webp" alt="" loading="lazy" decoding="async" draggable="false" class="absolute inset-0 size-full object-cover">
        ${moinsCher ? `<span class="pastille relative whitespace-nowrap bg-white text-[0.66rem] text-vert-700 shadow-carte">le moins cher relevé</span>` : ''}
      </span>
      <span class="mt-2.5 block truncate text-[0.88rem] font-semibold">${esc(m.nom)}</span>
      <span class="mt-1 flex items-baseline gap-1.5">
        <span class="whitespace-nowrap text-[0.9rem] font-bold tabular-nums ${couleur}">${esc(prix)}</span>
        <span class="text-[0.68rem] text-gris-clair">${l.statut === 'pas_vu' ? '' : esc(joursCourt(l.jours))}</span>
      </span>
      <span class="mt-1.5 flex items-center justify-between gap-2 text-[0.7rem] text-gris-clair">
        <span class="flex min-w-0 items-center gap-1">${ic('position', 'size-3.5 shrink-0 text-vert-500')}<span class="truncate">${esc(lieu)}</span></span>
        ${trajet ? `<span class="flex shrink-0 items-center gap-1">${ic('aller', 'size-3.5')}${esc(trajet)}</span>` : ''}
      </span>
    </button>`;
}
