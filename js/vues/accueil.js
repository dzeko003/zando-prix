'use strict';

/**
 * Accueil (/) : en-tête avec recherche, carrousel « Vaut le déplacement »,
 * tableau de tous les prix, légende et méthode de relevé.
 */

import { chercher, fcfa, joursEcoules, libelleJours } from '../regles.js';
import { etatPermission } from '../geo.js';
import { invitationFermee, fermerInvitation } from '../prefs.js';
import { donnees, MAINTENANT, evaluation, vaut, departMarche, libelleDepart } from '../etat.js';
import { $, esc, ic, nombre, pluriel, joursCourt } from '../html.js';
import { HAUT } from '../composants.js';
import { fleches, activerDefilement } from '../carrousel.js';
import { definirDepuisPosition } from '../position.js';

/* Grille du tableau des prix : la même pour l'en-tête et chaque ligne. */
const GRILLE = 'grid grid-cols-[minmax(0,1fr)_repeat(4,2.55rem)] min-[400px]:grid-cols-[minmax(0,1fr)_repeat(4,3.35rem)] items-center gap-x-1 lg:grid-cols-[minmax(0,1fr)_repeat(4,5.5rem)] lg:gap-x-3';

/* Recherche et filtre : conservés quand on revient à l'accueil. */
const recherche = { texte: '', filtre: 'tous' };

export function rendreAccueil(vue) {
  const depart = departMarche();
  const valent = donnees.produits.filter(vaut);

  vue.innerHTML = `
  ${enTete(depart, valent)}

  <div id="filtres" class="flex gap-2 overflow-x-auto px-4 pt-4 [scrollbar-width:none] md:px-0" ${recherche.filtre === 'tous' ? 'hidden' : ''}>
    ${[['tous', 'Tous'], ['vaut', depart ? 'Vaut le déplacement' : 'Écart entre marchés'], ['gros', 'Gros'], ['detail', 'Détail']].map(([v, t]) =>
      `<button type="button" data-filtre="${v}" class="shrink-0 rounded-full px-4 py-2.5 text-[0.82rem] font-semibold ring-1 transition">${t}</button>`).join('')}
  </div>

  <div class="space-y-7 pt-6 lg:grid lg:grid-cols-12 lg:gap-x-8 lg:gap-y-10 lg:space-y-0 lg:pt-8">
    <div id="invitation-position" class="px-4 md:px-0 lg:col-span-12" hidden></div>
    ${blocVaut(depart, valent)}
    ${blocPrix()}
    ${piedMethode()}
  </div>`;

  brancherRecherche();
  majFiltres();
  majListe();
  activerDefilement($('#defile-vaut'), 'vaut');
  preparerInvitation();
}

/* ---------------------------------------------------------------- gabarits */

function enTete(depart, valent) {
  const stats = statistiques();
  const total = donnees.produits.length;
  const accord = valent.length > 1 ? 'valent' : 'vaut';
  const titre = !valent.length ? 'Aucun écart ne couvre le transport'
    : depart ? `${pluriel(valent.length, 'produit')} sur ${total} ${accord} le déplacement`
    : `${pluriel(valent.length, 'produit')} sur ${total} avec un écart entre marchés`;
  const lieu = depart ? libelleDepart(depart, depart.marche.nom_court) : 'Choisir mon point de départ';
  const trajet = depart ? `Trajets depuis ${depart.marche.nom_court}` : `A/R ~${fcfa(donnees.meta.seuil_deplacement_fcfa)}`;

  return `<section class="relative overflow-hidden rounded-b-hero bg-foret text-white md:mt-4 md:flex md:min-h-80 md:items-end md:rounded-hero">
    <img src="/images/marche-total.webp" alt="" fetchpriority="high" decoding="async"
         class="absolute inset-0 size-full object-cover">
    <span class="absolute inset-0 bg-gradient-to-b from-foret/40 via-foret/55 to-foret/95 md:bg-gradient-to-r md:from-foret/95 md:via-foret/70 md:to-foret/25"></span>
    <div class="relative w-full px-4 pb-5 ${HAUT} md:p-8 lg:p-10">
      <div class="flex items-center justify-between gap-2 md:hidden">
        <span class="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-vert-300 ring-1 ring-white/25 backdrop-blur" aria-hidden="true">${ic('logo')}</span>
        <a href="/mon-marche" class="flex min-w-0 items-center gap-1.5 rounded-full px-3 py-2 text-[0.86rem] font-medium text-white/90">
          ${ic('position', 'size-4 text-vert-300')}<span class="truncate">${esc(lieu)}</span>${ic('chevron-bas', 'size-4 opacity-70')}</a>
        <a href="/carte" class="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur" aria-label="Carte des marchés">${ic('carte')}</a>
      </div>

      <p class="mt-14 flex items-center gap-1.5 text-[0.8rem] font-medium text-white/75 md:mt-0">${ic('marche', 'size-4')} Marchés de Brazzaville · aujourd’hui</p>
      <h1 class="mt-2 max-w-[17ch] text-[1.95rem] font-medium leading-[1.15] tracking-tight md:max-w-[20ch] md:text-[2.6rem]">${esc(titre)}</h1>

      <div class="mt-4 flex items-center gap-4 text-[0.78rem] text-white/80 md:max-w-xl md:text-[0.84rem]">
        <span class="flex min-w-0 items-center gap-1.5">${ic('etiquette', 'size-4')}<span class="truncate">${esc(trajet)}</span></span>
        <span class="flex shrink-0 items-center gap-1.5">${ic('horloge', 'size-4')} Relevés ${esc(stats.plusRecent === null ? '—' : libelleJours(stats.plusRecent))}</span>
        <span class="pastille ml-auto shrink-0 bg-vert-500 text-encre" title="cases produit × marché relevées">${ic('coche', 'size-3.5')} ${stats.renseignees}/${stats.cases}</span>
      </div>

      <div class="mt-5 flex items-center gap-2.5 md:max-w-xl">
        <div class="relative flex-1">
          ${ic('recherche', 'pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-white/80')}
          <input id="recherche" type="search" autocomplete="off" placeholder="Chercher : riz, makala, mpondu…"
                 aria-label="Chercher un produit" value="${esc(recherche.texte)}"
                 class="h-13 w-full rounded-full bg-white/15 pl-12 pr-13 text-[0.92rem] text-white ring-1 ring-white/20 backdrop-blur-md placeholder:text-white/65 focus:outline-none focus:ring-white/50">
          <button type="button" id="vider-recherche" aria-label="Effacer la recherche" ${recherche.texte ? '' : 'hidden'}
                  class="absolute right-1.5 top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30 active:scale-95">${ic('croix', 'size-[18px]')}</button>
        </div>
        <button id="bouton-filtre" type="button" class="bouton-rond size-13" aria-controls="filtres"
                aria-expanded="${recherche.filtre !== 'tous'}" aria-label="Filtrer les produits">${ic('filtre')}</button>
      </div>
    </div>
  </section>`;
}

/* Cases produit × marché relevées, et âge du relevé le plus récent. */
function statistiques() {
  let renseignees = 0, plusRecent = Infinity;
  for (const p of donnees.produits) {
    for (const r of Object.values(p.releves)) {
      if (r.statut !== 'pas_vu') renseignees++;
      const j = joursEcoules(r.date, MAINTENANT);
      if (j !== null && j >= 0) plusRecent = Math.min(plusRecent, j);
    }
  }
  return {
    renseignees,
    cases: donnees.produits.length * donnees.marches.length,
    plusRecent: Number.isFinite(plusRecent) ? plusRecent : null
  };
}

function blocVaut(depart, valent) {
  return `<section id="bloc-vaut" class="lg:col-span-4">
      <div class="mb-3 flex items-center justify-between gap-3 px-4 md:px-0">
        <h2 class="titre-section">${depart ? 'Vaut le déplacement' : 'Écarts entre marchés'}</h2>
        <span class="flex items-center gap-3">
          ${valent.length ? `<button type="button" id="voir-vaut" class="voir-tout">Voir tout</button>` : ''}
          ${valent.length > 1 ? fleches('vaut') : ''}
        </span>
      </div>
      ${valent.length
        ? `<div id="defile-vaut" class="flex snap-x scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] md:scroll-px-0 md:px-0 lg:grid lg:grid-cols-2 lg:overflow-visible">${valent.map(carteVaut).join('')}</div>`
        : `<div class="mx-4 carte flex gap-3.5 p-4 md:mx-0">
             <span class="grid size-11 shrink-0 place-items-center rounded-full bg-nav">${ic('maison')}</span>
             <p class="text-[0.84rem] leading-relaxed text-gris"><b class="block text-[0.95rem] font-semibold text-encre">Restez dans votre marché</b>
             Aucun écart ne couvre le prix de l’aller-retour. Servez-vous des prix ci-dessous pour vérifier ce qu’on vous annonce sur place.</p>
           </div>`}
    </section>`;
}

function carteVaut(p) {
  const e = evaluation(p.id).ecartUtile;
  return `<a href="/produit/${encodeURIComponent(p.id)}"
      class="relative block aspect-[4/5] w-40 shrink-0 snap-start overflow-hidden rounded-[1.4rem] bg-foret shadow-carte last:snap-end lg:w-auto">
    <img src="/images/produits/${p.id}.webp" alt="" loading="lazy" decoding="async" draggable="false" class="absolute inset-0 size-full object-cover">
    <span class="absolute inset-0 bg-gradient-to-b from-transparent via-foret/10 to-foret/90"></span>
    <span class="pastille absolute right-2.5 top-2.5 bg-white/25 text-white ring-1 ring-white/30 backdrop-blur-md">−${nombre(e.ecart)} F</span>
    <span class="absolute inset-x-3 bottom-3 text-white">
      <span class="block text-[0.95rem] font-semibold leading-tight">${esc(p.nom)}</span>
      <span class="mt-1 flex items-center gap-1 text-[0.72rem] text-white/80">${ic('position', 'size-3.5')} ${esc(e.marche.nom_court)}</span>
    </span>
  </a>`;
}

function blocPrix() {
  return `<section id="bloc-prix" class="scroll-mt-24 px-4 md:px-0 lg:col-span-8">
      <div class="mb-3 flex items-end justify-between">
        <h2 class="titre-section">Tous les prix</h2>
        <span id="compte" class="voir-tout"></span>
      </div>
      <div class="carte overflow-hidden">
        <div class="${GRILLE} border-b border-trait bg-vert-50 px-3 py-2.5 text-[0.64rem] font-semibold text-gris min-[400px]:text-[0.7rem] lg:px-4 lg:py-3 lg:text-[0.78rem]">
          <span>Produit</span>
          ${donnees.marches.map(enTeteColonne).join('')}
        </div>
        <div id="lignes"></div>
        <div id="vide" class="p-6 text-center" hidden>
          <p class="text-[0.92rem] font-semibold">Aucun produit trouvé.</p>
          <button type="button" id="effacer" class="mt-3 h-11 rounded-full bg-nav px-5 text-[0.84rem] font-semibold">Effacer la recherche</button>
        </div>
      </div>
      ${legende()}
    </section>`;
}

function enTeteColonne(m) {
  // sous 400 px, « Moungali » déborde sur la colonne voisine : on abrège
  const court = m.nom_court || m.nom;
  const abrege = court.length > 6 ? court.slice(0, 5) + '.' : court;
  return `<span class="truncate text-right" title="${esc(m.nom)}"><span class="min-[400px]:hidden">${esc(abrege)}</span><span class="hidden min-[400px]:inline">${esc(court)}</span></span>`;
}

function ligneTableau(p) {
  const ev = evaluation(p.id);
  const e = ev.ecartUtile;
  const cellules = donnees.marches.map(m =>
    celluleTableau(ev.lignes.find(l => l.marche.id === m.id), ev.badge === m.id)).join('');
  const sousLigne = e.evaluable && e.vaut
    ? `<span class="flex items-center gap-1 font-semibold text-vert-700">${ic('position', 'size-3 shrink-0 text-vert-500')}<span class="truncate"><span class="hidden min-[400px]:inline">${esc(e.marche.nom_court)} · </span>−${nombre(e.ecart)} F</span></span>`
    : `<span class="hidden truncate text-gris-clair min-[400px]:block">${esc(p.unite_reference)}</span>`;
  return `<a href="/produit/${encodeURIComponent(p.id)}" class="${GRILLE} border-b border-trait px-3 py-2.5 last:border-0 hover:bg-vert-50/60 active:bg-vert-50 lg:px-4 lg:py-3">
    <span class="flex min-w-0 items-center gap-2 min-[400px]:gap-2.5">
      <img src="/images/produits/${p.id}-vignette.webp" alt="" width="80" height="80" loading="lazy" decoding="async"
           class="size-8 shrink-0 rounded-lg object-cover min-[400px]:size-10 min-[400px]:rounded-xl lg:size-11">
      <span class="min-w-0">
        <span class="line-clamp-2 block text-[0.76rem] font-semibold leading-tight text-encre min-[400px]:text-[0.86rem] lg:text-[0.95rem]">${esc(p.nom)}</span>
        <span class="mt-0.5 block text-[0.66rem] leading-tight">${sousLigne}</span>
      </span>
    </span>
    ${cellules}
  </a>`;
}

/* US-02 : le moins cher se reconnaît autrement que par la couleur — une pastille. */
function celluleTableau(l, moinsCher) {
  if (l.statut === 'pas_vu') {
    return `<span class="flex flex-col items-end">
      <span class="text-[0.8rem] font-medium leading-5 text-gris-clair">—</span>
      <span class="text-[0.6rem] leading-3 text-gris-clair lg:text-[0.68rem] lg:leading-4">pas vu</span></span>`;
  }
  const instable = l.statut === 'instable';
  let style = 'font-semibold text-encre';
  if (moinsCher) style = 'rounded-full bg-vert-500 px-0.5 font-bold text-encre min-[400px]:px-1';
  else if (l.etat === 'orange') style = 'rounded-full bg-ocre-pale px-0.5 font-semibold text-ocre min-[400px]:px-1';
  else if (l.etat === 'perime') style = 'font-semibold text-gris-clair line-through';
  const taille = instable ? 'text-[0.6rem] min-[400px]:text-[0.66rem] lg:text-[0.74rem]' : 'text-[0.7rem] min-[400px]:text-[0.84rem] lg:text-[0.98rem]';
  return `<span class="flex flex-col items-end"${moinsCher ? ' title="le moins cher relevé"' : ''}>
    <span class="${style} ${taille} whitespace-nowrap tabular-nums leading-5 tracking-tight">${instable ? 'variable' : nombre(l.prix)}</span>
    <span class="text-[0.6rem] leading-3 text-gris-clair lg:text-[0.68rem] lg:leading-4">${esc(joursCourt(l.jours))}</span></span>`;
}

function legende() {
  const cas = [
    ['<span class="rounded-full bg-vert-500 px-2 py-0.5 font-bold text-encre">2 900</span>', 'Le moins cher relevé', 'pour ce produit, parmi les marchés récents'],
    ['<span class="rounded-full bg-ocre-pale px-2 py-0.5 font-semibold text-ocre">1 900</span>', 'Plus de 7 jours', 'prix à vérifier'],
    ['<s class="font-semibold text-gris-clair">1 900</s>', 'Plus de 14 jours', 'hors comparaison'],
    ['<span class="rounded-full bg-nav px-2 py-0.5 text-[0.68rem] font-semibold text-encre">variable</span>', 'Prix instable', 'dans ce marché, les étals ne s’accordent pas'],
    ['<span class="font-semibold text-gris-clair">—</span>', 'Pas vu', 'pas en vente dans l’unité de référence ce jour-là']
  ];
  return `<div class="carte mt-4 p-4 lg:p-5">
        <p class="flex items-center gap-2 text-[0.84rem] font-semibold">${ic('question', 'size-4 text-vert-600')} Comment lire les prix</p>
        <ul class="mt-3.5 grid grid-cols-1 gap-x-8 gap-y-3.5 sm:grid-cols-2">
          ${cas.map(([echantillon, titre, detail]) => `<li class="flex items-center gap-3">
              <span class="grid h-10 w-[4.25rem] shrink-0 place-items-center rounded-xl bg-fond text-[0.8rem] tabular-nums">${echantillon}</span>
              <span class="min-w-0 leading-tight">
                <b class="block text-[0.82rem] font-semibold text-encre">${titre}</b>
                <span class="text-[0.72rem] text-gris">${detail}</span>
              </span>
            </li>`).join('')}
        </ul>
        <a href="/calcul" class="mt-4 inline-flex items-center gap-1 text-[0.8rem] font-semibold text-vert-700 hover:underline">
          Comment on calcule « vaut le déplacement » ${ic('chevron', 'size-4')}</a>
      </div>`;
}

function piedMethode() {
  const points = [
    ['marche', `${donnees.marches.length} marchés`, 'relevés par un binôme'],
    ['liste', '3 étals', 'par produit, le prix du milieu est retenu'],
    ['horloge', '14 jours', 'au-delà, un prix n’est plus affiché comme un prix']
  ];
  return `<footer class="px-4 pb-2 md:px-0 lg:col-span-12">
      <div class="rounded-hero bg-foret p-5 text-white md:p-7">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div class="max-w-md">
            <p class="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-vert-300">Méthode de relevé</p>
            <p class="mt-1.5 text-[1.2rem] font-semibold leading-snug tracking-tight">Des prix relevés sur place, jamais repris d’un autre marché.</p>
            <span class="pastille mt-3.5 bg-white/10 text-white ring-1 ring-white/15">${ic('etiquette', 'size-3.5 text-vert-300')} Prix annoncés, avant marchandage</span>
          </div>
          <ul class="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:shrink-0 lg:gap-3">
            ${points.map(([icone, chiffre, texte]) => `<li class="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3.5 ring-1 ring-white/10 sm:block lg:w-48">
                <span class="grid size-10 shrink-0 place-items-center rounded-full bg-vert-500 text-encre sm:mb-3">${ic(icone)}</span>
                <span class="block">
                  <b class="block text-[1.05rem] font-semibold leading-tight">${chiffre}</b>
                  <span class="text-[0.74rem] leading-snug text-white/65">${texte}</span>
                </span>
              </li>`).join('')}
          </ul>
        </div>
      </div>
    </footer>`;
}

/* ------------------------------------------------------ recherche et filtres */

function brancherRecherche() {
  const champ = $('#recherche');
  const vider = $('#vider-recherche');
  const effacerRecherche = () => { recherche.texte = ''; champ.value = ''; vider.hidden = true; majListe(); champ.focus(); };
  const choisirFiltre = filtre => { recherche.filtre = filtre; majFiltres(); majListe(); };

  champ.addEventListener('input', () => { recherche.texte = champ.value; vider.hidden = !champ.value; majListe(); });
  vider.addEventListener('click', effacerRecherche);
  $('#effacer').addEventListener('click', effacerRecherche);
  $('#bouton-filtre').addEventListener('click', () => {
    const f = $('#filtres');
    f.hidden = !f.hidden;
    $('#bouton-filtre').setAttribute('aria-expanded', String(!f.hidden));
  });
  $('#filtres').addEventListener('click', e => {
    const b = e.target.closest('[data-filtre]');
    if (b) choisirFiltre(b.dataset.filtre);
  });
  $('#voir-vaut')?.addEventListener('click', () => {
    $('#filtres').hidden = false;
    choisirFiltre('vaut');
    $('#bloc-prix').scrollIntoView({ behavior: 'smooth' });
  });
}

function majFiltres() {
  document.querySelectorAll('[data-filtre]').forEach(b => {
    const actif = b.dataset.filtre === recherche.filtre;
    b.classList.toggle('bg-vert-500', actif);
    b.classList.toggle('ring-vert-500', actif);
    b.classList.toggle('bg-white', !actif);
    b.classList.toggle('ring-black/5', !actif);
    b.setAttribute('aria-pressed', String(actif));
  });
}

function produitsFiltres() {
  let liste = chercher(donnees.produits, recherche.texte);
  if (recherche.filtre === 'vaut') liste = liste.filter(vaut);
  else if (recherche.filtre === 'gros' || recherche.filtre === 'detail') liste = liste.filter(p => p.segment === recherche.filtre);
  return liste;
}

function majListe() {
  const liste = produitsFiltres();
  $('#lignes').innerHTML = liste.map(ligneTableau).join('');
  $('#vide').hidden = liste.length > 0;
  $('#compte').textContent = pluriel(liste.length, 'produit');
  const sansCarrousel = Boolean(recherche.texte) || recherche.filtre !== 'tous';
  $('#bloc-vaut').hidden = sansCarrousel;
  // sur grand écran, le tableau reprend toute la largeur quand le carrousel disparaît
  $('#bloc-prix').classList.toggle('lg:col-span-8', !sansCarrousel);
  $('#bloc-prix').classList.toggle('lg:col-span-12', sansCarrousel);
}

/* ------------------------------------------------------------- invitation */

/* Première visite : l'accueil invite à autoriser la position, sans jamais la demander d'office. */
async function preparerInvitation() {
  const el = $('#invitation-position');
  if (!el || departMarche() || invitationFermee()) return;
  const bloquee = (await etatPermission()) === 'denied';
  if (!document.body.contains(el)) return;   // l'utilisateur a déjà changé d'écran
  el.innerHTML = `<div class="carte flex flex-col gap-4 p-4 sm:flex-row sm:items-center lg:p-5">
      <span class="grid size-12 shrink-0 place-items-center rounded-full bg-vert-500 text-encre">${ic('viseur', 'size-6')}</span>
      <div class="min-w-0 flex-1">
        <p class="text-[1rem] font-semibold leading-snug">Trouvez votre marché le plus proche</p>
        <p class="mt-1 text-[0.82rem] leading-relaxed text-gris">${bloquee
          ? 'La localisation est bloquée pour Zando Prix. Réactivez-la pour savoir si le déplacement vaut le coup depuis là où vous êtes.'
          : 'Autorisez votre position : Zando Prix vous dira si le déplacement vaut le coup depuis là où vous êtes. Elle reste sur votre téléphone.'}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2 sm:shrink-0">
        <button type="button" data-invitation="autoriser" class="h-11 rounded-full bg-vert-500 px-5 text-[0.88rem] font-semibold text-encre disabled:opacity-60">${bloquee ? 'Voir comment la réactiver' : 'Autoriser ma position'}</button>
        <a href="/mon-marche" class="inline-flex h-11 items-center rounded-full bg-nav px-4 text-[0.84rem] font-semibold">Choisir moi-même</a>
        <button type="button" data-invitation="fermer" class="grid size-11 place-items-center rounded-full text-gris hover:bg-nav" aria-label="Ne plus afficher">${ic('croix')}</button>
      </div>
    </div>`;
  el.hidden = false;
  el.querySelector('[data-invitation=fermer]').addEventListener('click', () => { fermerInvitation(); el.hidden = true; });
  el.querySelector('[data-invitation=autoriser]').addEventListener('click', e => definirDepuisPosition(e.currentTarget));
}
