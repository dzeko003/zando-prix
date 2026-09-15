'use strict';

import {
  aujourdhui, evaluerProduit, chercher, fcfa, joursEcoules, libelleJours, coutTrajet
} from './regles.js';
import { valider, ajouter, pourProduit, lire as toutesLesContributions } from './contributions.js';
import { departComplet, definirMarcheDepart, invitationFermee, fermerInvitation } from './prefs.js';
import { localiser, marcheLePlusProche, distanceKm, distanceLisible, MESSAGES, etatPermission, consignesActivation } from './geo.js';

const metres = m => (m < 1000 ? `${Math.max(5, Math.round(m / 5) * 5)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
const coordonnees = p => `${p.lat.toFixed(5).replace('.', ',')} ; ${p.lon.toFixed(5).replace('.', ',')}`;
const PRECISION_SUFFISANTE = 500;   // m — au-delà, on risque de se tromper de marché

const $ = (s, racine = document) => racine.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nombre = n => new Intl.NumberFormat('fr-FR').format(n);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ic = (nom, cls = 'size-5') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${nom}"/></svg>`;

/* Grille du tableau des prix : la même pour l'en-tête et chaque ligne. */
const GRILLE = 'grid grid-cols-[minmax(0,1fr)_repeat(4,2.55rem)] min-[400px]:grid-cols-[minmax(0,1fr)_repeat(4,3.35rem)] items-center gap-x-1 lg:grid-cols-[minmax(0,1fr)_repeat(4,5.5rem)] lg:gap-x-3';
const HAUT = 'pt-[calc(env(safe-area-inset-top)+14px)]';

let D = null;              // le fichier de prix
let MAINTENANT = null;     // date de consultation (R9), décalable pour la recette
let moduleCarte = null;    // Leaflet, chargé seulement à l'ouverture de la carte
let positionSession = null; // dernière position obtenue, en mémoire le temps de la session, jamais enregistrée
const EVALS = new Map();   // produit → règles appliquées
const etat = { texte: '', filtre: 'tous', message: null };

/* ------------------------------------------------------------------ départ */

async function demarrer() {
  const decalage = new URLSearchParams(location.search).get('date');
  MAINTENANT = aujourdhui(decalage);

  try {
    const r = await fetch('data/prix.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    D = await r.json();
    if (!D.produits?.length) throw new Error('fichier vide');
  } catch (err) {
    // US-02 : jamais de page vide ou bloquée
    $('#chargement').hidden = true;
    $('#erreur').hidden = false;
    console.error('[zando] prix indisponibles :', err.message);
    return;
  }

  evaluerTout();
  $('#chargement').hidden = true;
  $('#app').hidden = false;
  $('#nav').hidden = false;
  $('#barre').hidden = false;

  if (decalage) {
    const b = $('#banniere-date');
    b.textContent = `Date de consultation décalée (${decalage}) — recette de la règle R6`;
    b.hidden = false;
  }

  addEventListener('online', etatReseau);
  addEventListener('offline', etatReseau);
  addEventListener('hashchange', router);
  etatReseau();
  router();

  if ('serviceWorker' in navigator) {
    // Une nouvelle version prend la main : la page tourne encore avec l'ancien code, on recharge une fois.
    // À la première visite il n'y avait pas de contrôleur : rien à rafraîchir.
    const dejaControlee = !!navigator.serviceWorker.controller;
    let rechargee = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!dejaControlee || rechargee) return;
      rechargee = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('[zando] sw :', e.message));
  }
}

function evaluerTout() {
  const depart = departComplet()?.id ?? null;
  EVALS.clear();
  for (const p of D.produits) EVALS.set(p.id, evaluerProduit(p, D.marches, MAINTENANT, D.meta, depart));
}

function etatReseau() {
  $('#hors-ligne').hidden = navigator.onLine !== false;
}

function departMarche() {
  const d = departComplet();
  const marche = d && D.marches.find(m => m.id === d.id);
  return marche ? { ...d, marche } : null;
}

const vaut = p => { const e = EVALS.get(p.id).ecartUtile; return e.evaluable && e.vaut; };

/* Les mots du marché, accordés : « au sac », « au tas », « à la mesure », « à la boîte ». */
const FEMININS = new Set(['mesure', 'boîte', 'bouteille', 'boule', 'cuvette', 'botte']);
const auUnite = mot => (FEMININS.has(mot) ? 'à la ' : 'au ') + mot;

function joursCourt(j) {
  if (j === null || j < 0) return 'date ?';
  if (j > 14) return 'périmé';
  if (j === 0) return 'auj.';
  if (j === 1) return 'hier';
  return `${j} j`;
}

/* Flèches des carrousels : visibles seulement avec une souris, et masquées quand le carrousel devient une grille. */
function fleches(nom) {
  return `<span class="hidden items-center gap-1.5 pointer-fine:flex lg:hidden!" data-fleches="${nom}">
    <button type="button" data-sens="-1" class="bouton-rond size-9 disabled:opacity-35" aria-label="Précédent">${ic('chevron', 'size-4 rotate-180')}</button>
    <button type="button" data-sens="1" class="bouton-rond size-9 disabled:opacity-35" aria-label="Suivant">${ic('chevron', 'size-4')}</button>
  </span>`;
}

/**
 * Un carrousel horizontal doit se parcourir sans écran tactile : molette, glisser
 * à la souris, flèches. Au doigt, le défilement natif suffit et rien de ceci n'intervient.
 * Renvoie la fonction qui remet l'état des flèches à jour.
 */
function activerDefilement(el, nom) {
  if (!el) return () => {};
  const boutons = [...document.querySelectorAll(`[data-fleches="${nom}"] button`)];
  const deborde = () => el.scrollWidth > el.clientWidth + 1;
  const maj = () => {
    for (const b of boutons) {
      const sens = Number(b.dataset.sens);
      b.disabled = !deborde() || (sens < 0 ? el.scrollLeft <= 1 : el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    }
  };

  // Une flèche vise le début d'une carte, jamais une distance arbitraire : sinon
  // l'aimantation ramène le carrousel là d'où il part. Positions bornées entre 0 et la butée.
  const aller = sens => {
    const max = el.scrollWidth - el.clientWidth;
    const debut = el.getBoundingClientRect().left + (parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0);
    const positions = [...el.children].map(c =>
      Math.min(max, Math.max(0, Math.round(c.getBoundingClientRect().left - debut + el.scrollLeft))));
    const ici = el.scrollLeft;
    let cible;
    if (sens > 0) {
      const droite = el.getBoundingClientRect().right;
      const i = [...el.children].findIndex(c => c.getBoundingClientRect().right > droite + 1);
      cible = i < 0 ? max : positions[i];
      if (cible <= ici + 1) cible = positions.find(x => x > ici + 1) ?? max;
    } else {
      const but = Math.max(0, ici - el.clientWidth / 2);
      cible = [...positions].reverse().find(x => x <= but + 1) ?? 0;
      if (cible >= ici - 1) cible = [...positions].reverse().find(x => x < ici - 1) ?? 0;
    }
    const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: cible, behavior: reduit ? 'auto' : 'smooth' });
    setTimeout(maj, 450);   // l'événement scroll n'est pas garanti : on remet les flèches à jour nous-mêmes
  };
  boutons.forEach(b => b.addEventListener('click', () => aller(Number(b.dataset.sens))));

  // molette verticale → défilement horizontal ; en butée, la page reprend la main
  el.addEventListener('wheel', e => {
    if (!deborde() || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const avant = el.scrollLeft;
    el.scrollLeft += e.deltaY;
    if (el.scrollLeft !== avant) e.preventDefault();
  }, { passive: false });

  // glisser à la souris, sans déclencher le lien de la carte relâchée
  let prise = null, glisse = false;
  el.addEventListener('dragstart', e => e.preventDefault());
  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !deborde()) return;
    prise = { x: e.clientX, gauche: el.scrollLeft };
    glisse = false;
  });
  el.addEventListener('pointermove', e => {
    if (!prise) return;
    const dx = e.clientX - prise.x;
    if (!glisse && Math.abs(dx) < 6) return;
    glisse = true;
    el.style.scrollSnapType = 'none';
    el.style.cursor = 'grabbing';
    el.scrollLeft = prise.gauche - dx;
  });
  const lacher = () => {
    if (!prise) return;
    prise = null;
    el.style.scrollSnapType = '';
    el.style.cursor = '';
  };
  el.addEventListener('pointerup', lacher);
  el.addEventListener('pointerleave', lacher);
  el.addEventListener('click', e => {
    if (glisse) { e.preventDefault(); e.stopPropagation(); glisse = false; }
  }, true);

  el.addEventListener('scroll', maj, { passive: true });
  maj();
  return maj;
}

function majBarre() {
  const el = $('#barre-depart');
  if (!el) return;
  const d = departMarche();
  el.textContent = d
    ? `Depuis le ${d.marche.nom}${d.source === 'position' && d.km != null ? ' · ' + distanceLisible(d.km) : ''}`
    : 'Choisir mon point de départ';
}

/* ------------------------------------------------- autorisation de la position */

let dialogue = null;

/**
 * Fenêtre d'explication autour de la demande de position.
 *   demande  — avant la demande du navigateur : pourquoi, et quoi répondre
 *   bloquee  — refus enregistré : une page web ne peut pas redemander, on montre où réactiver
 *   appareil — autorisée, mais l'appareil ne donne pas de position fiable
 * Résout `true` si l'utilisateur veut continuer ou réessayer.
 */
function ouvrirDialogue(mode, precision = null) {
  if (!dialogue) {
    dialogue = document.createElement('dialog');
    dialogue.className = 'm-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-hero bg-white p-0 text-encre ' +
      'shadow-nav backdrop:bg-foret/55 sm:m-auto sm:max-w-md sm:rounded-hero';
    document.body.append(dialogue);
  }
  const c = consignesActivation();
  const etapes = liste => `<ol class="mt-4 space-y-3">${liste.map((texte, i) => `<li class="flex gap-3 text-[0.85rem] leading-snug">
      <span class="grid size-6 shrink-0 place-items-center rounded-full bg-vert-100 text-[0.72rem] font-bold text-vert-700">${i + 1}</span>
      <span>${esc(texte)}</span></li>`).join('')}</ol>`;
  const vues = {
    demande: {
      icone: 'viseur', teinte: 'bg-vert-500 text-encre', titre: 'Autoriser votre position ?',
      corps: `<p class="mt-2 text-[0.88rem] leading-relaxed text-gris">Zando Prix s’en sert pour trouver le marché le plus proche de vous
          et vous situer sur la carte. Votre position reste sur votre téléphone : elle n’est ni enregistrée ni envoyée.</p>
        <p class="mt-4 flex items-start gap-2 rounded-2xl bg-vert-50 p-3 text-[0.82rem] leading-snug text-vert-700">
          ${ic('question', 'mt-0.5 size-4 shrink-0')} Votre navigateur va ensuite vous demander l’autorisation : choisissez « Autoriser ».</p>`,
      principal: 'Continuer', secondaire: 'Pas maintenant'
    },
    bloquee: {
      icone: 'alerte', teinte: 'bg-ocre-pale text-ocre', titre: 'La localisation est bloquée',
      corps: `<p class="mt-2 text-[0.88rem] leading-relaxed text-gris">Elle a été refusée pour Zando Prix, et un site ne peut pas
          la réactiver lui-même. Voici comment faire — ${esc(c.plateforme)} :</p>${etapes(c.site)}`,
      principal: 'J’ai autorisé, réessayer', secondaire: 'Choisir mon marché moi-même'
    },
    appareil: {
      icone: 'viseur', teinte: 'bg-ocre-pale text-ocre',
      titre: precision ? `Position approximative, à ± ${metres(precision)}` : 'Position introuvable',
      corps: `<p class="mt-2 text-[0.88rem] leading-relaxed text-gris">${precision
          ? 'Votre appareil ne donne qu’une position estimée depuis le réseau, pas celle du GPS.'
          : 'L’autorisation est donnée, mais votre appareil ne fournit pas de position.'} Activez sa localisation :</p>${etapes(c.systeme)}`,
      principal: 'Réessayer', secondaire: 'Choisir mon marché moi-même'
    }
  };
  const v = vues[mode];
  dialogue.innerHTML = `<form method="dialog" class="p-6" data-mode="${mode}">
      <div class="flex items-start justify-between gap-4">
        <span class="grid size-12 shrink-0 place-items-center rounded-full ${v.teinte}">${ic(v.icone, 'size-6')}</span>
        <button value="fermer" class="bouton-rond size-10" aria-label="Fermer">${ic('croix')}</button>
      </div>
      <h2 class="mt-4 text-[1.2rem] font-semibold leading-snug tracking-tight">${esc(v.titre)}</h2>
      ${v.corps}
      <div class="mt-6 grid gap-2.5">
        <button value="principal" class="h-12 rounded-full bg-vert-500 text-[0.95rem] font-semibold text-encre">${esc(v.principal)}</button>
        <button value="secondaire" class="h-12 rounded-full bg-nav text-[0.9rem] font-semibold text-encre">${esc(v.secondaire)}</button>
      </div>
    </form>`;
  return new Promise(resoudre => {
    dialogue.addEventListener('close', () => {
      const choix = dialogue.returnValue;
      if (choix === 'secondaire' && mode !== 'demande') location.hash = '#/mon-marche';
      resoudre(choix === 'principal');
    }, { once: true });
    dialogue.returnValue = '';
    dialogue.showModal();
  });
}

/**
 * Demander la position comme une application : on explique d'abord, puis le navigateur affiche
 * sa propre demande. Refus ou appareil muet : la fenêtre montre quoi faire, et `gere` signale
 * à l'appelant qu'il n'a rien à afficher de plus.
 */
async function obtenirPosition() {
  const autorisation = await etatPermission();
  if (autorisation === 'denied') {
    if (await ouvrirDialogue('bloquee')) return obtenirPosition();
    throw new Error('gere');
  }
  if (autorisation === 'prompt' && !(await ouvrirDialogue('demande'))) throw new Error('gere');
  try {
    return await localiser({ precis: true });
  } catch (err) {
    const mode = err.message === 'refus' ? 'bloquee' : (err.message === 'echec' || err.message === 'delai') ? 'appareil' : null;
    if (!mode) throw err;
    if (await ouvrirDialogue(mode)) return obtenirPosition();
    throw new Error('gere');
  }
}

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
        <a href="#/mon-marche" class="inline-flex h-11 items-center rounded-full bg-nav px-4 text-[0.84rem] font-semibold">Choisir moi-même</a>
        <button type="button" data-invitation="fermer" class="grid size-11 place-items-center rounded-full text-gris hover:bg-nav" aria-label="Ne plus afficher">${ic('croix')}</button>
      </div>
    </div>`;
  el.hidden = false;
  el.querySelector('[data-invitation=fermer]').addEventListener('click', () => { fermerInvitation(); el.hidden = true; });
  el.querySelector('[data-invitation=autoriser]').addEventListener('click', async e => {
    const bouton = e.currentTarget;
    bouton.disabled = true;
    try {
      const position = await obtenirPosition();
      positionSession = position;
      const proche = marcheLePlusProche(position, D.marches);
      if (proche && position.precision <= PRECISION_SUFFISANTE) {
        definirMarcheDepart(proche.marche.id, 'position', proche.km);
        evaluerTout();
        router();
        return;
      }
      etat.messageDepart = proche
        ? `Votre position n’est connue qu’à ± ${metres(position.precision)} : trop imprécis pour choisir à votre place. ` +
          `Le plus proche serait le ${proche.marche.nom} — confirmez-le ci-dessous.`
        : MESSAGES.loin;
      location.hash = '#/mon-marche';
    } catch (err) {
      bouton.disabled = false;
      if (err.message !== 'gere') { etat.messageDepart = MESSAGES[err.message] || MESSAGES.echec; location.hash = '#/mon-marche'; }
    }
  });
}

/* --------------------------------------------------------------- navigation */

function router() {
  moduleCarte?.detruire();
  const [route, param] = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
  const vue = $('#vue');

  // anciens liens « #charbon » : on les redirige
  if (route && D.produits.some(p => p.id === route)) { location.replace('#/produit/' + route); return; }

  let actif = 'accueil';
  if (route === 'produit' && D.produits.some(p => p.id === param)) {
    etat.message = null;
    rendreProduit(vue, D.produits.find(p => p.id === param));
  } else if (route === 'carte') {
    actif = 'carte'; rendreCarte(vue, param);
  } else if (route === 'mes-prix') {
    actif = 'mes-prix'; rendreMesPrix(vue);
  } else if (route === 'mon-marche') {
    actif = 'mon-marche'; rendreMonMarche(vue);
  } else if (route === 'calcul') {
    actif = 'calcul'; rendreCalcul(vue);
  } else {
    rendreAccueil(vue);
  }

  document.querySelectorAll('[data-nav] a[data-route]').forEach(a => {
    const courant = a.dataset.route === actif;
    a.classList.toggle('bg-vert-500', courant);
    a.classList.toggle('bg-white', !courant);
    if (courant) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  majBarre();
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------ accueil */

function statistiques() {
  let renseignees = 0, plusRecent = Infinity;
  for (const p of D.produits) {
    for (const r of Object.values(p.releves)) {
      if (r.statut !== 'pas_vu') renseignees++;
      const j = joursEcoules(r.date, MAINTENANT);
      if (j !== null && j >= 0) plusRecent = Math.min(plusRecent, j);
    }
  }
  return {
    renseignees,
    cases: D.produits.length * D.marches.length,
    plusRecent: Number.isFinite(plusRecent) ? plusRecent : null
  };
}

function rendreAccueil(vue) {
  const depart = departMarche();
  const valent = D.produits.filter(vaut);
  const stats = statistiques();
  const pluriel = valent.length > 1;
  const titre = valent.length
    ? `${valent.length} produit${pluriel ? 's' : ''} sur ${D.produits.length} ${pluriel ? 'valent' : 'vaut'} le déplacement`
    : 'Aucun écart ne couvre le transport';
  const lieu = depart
    ? `Depuis ${depart.marche.nom_court}${depart.source === 'position' && depart.km != null ? ' · ' + distanceLisible(depart.km) : ''}`
    : 'Choisir mon point de départ';
  const trajet = depart ? `Trajets depuis ${depart.marche.nom_court}` : `A/R ~${fcfa(D.meta.seuil_deplacement_fcfa)}`;

  vue.innerHTML = `
  <section class="relative overflow-hidden rounded-b-hero bg-foret text-white md:mt-4 md:flex md:min-h-80 md:items-end md:rounded-hero">
    <img src="images/marche-total.webp" alt="" fetchpriority="high" decoding="async"
         class="absolute inset-0 size-full object-cover">
    <span class="absolute inset-0 bg-gradient-to-b from-foret/40 via-foret/55 to-foret/95 md:bg-gradient-to-r md:from-foret/95 md:via-foret/70 md:to-foret/25"></span>
    <div class="relative w-full px-4 pb-5 ${HAUT} md:p-8 lg:p-10">
      <div class="flex items-center justify-between gap-2 md:hidden">
        <span class="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-vert-300 ring-1 ring-white/25 backdrop-blur" aria-hidden="true">${ic('logo')}</span>
        <a href="#/mon-marche" class="flex min-w-0 items-center gap-1.5 rounded-full px-3 py-2 text-[0.86rem] font-medium text-white/90">
          ${ic('position', 'size-4 text-vert-300')}<span class="truncate">${esc(lieu)}</span>${ic('chevron-bas', 'size-4 opacity-70')}</a>
        <a href="#/carte" class="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur" aria-label="Carte des marchés">${ic('carte')}</a>
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
                 aria-label="Chercher un produit" value="${esc(etat.texte)}"
                 class="h-13 w-full rounded-full bg-white/15 pl-12 pr-13 text-[0.92rem] text-white ring-1 ring-white/20 backdrop-blur-md placeholder:text-white/65 focus:outline-none focus:ring-white/50">
          <button type="button" id="vider-recherche" aria-label="Effacer la recherche" ${etat.texte ? '' : 'hidden'}
                  class="absolute right-1.5 top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30 active:scale-95">${ic('croix', 'size-[18px]')}</button>
        </div>
        <button id="bouton-filtre" type="button" class="bouton-rond size-13" aria-controls="filtres"
                aria-expanded="${etat.filtre !== 'tous'}" aria-label="Filtrer les produits">${ic('filtre')}</button>
      </div>
    </div>
  </section>

  <div id="filtres" class="flex gap-2 overflow-x-auto px-4 pt-4 [scrollbar-width:none] md:px-0" ${etat.filtre === 'tous' ? 'hidden' : ''}>
    ${[['tous', 'Tous'], ['vaut', 'Vaut le déplacement'], ['gros', 'Gros'], ['detail', 'Détail']].map(([v, t]) =>
      `<button type="button" data-filtre="${v}" class="shrink-0 rounded-full px-4 py-2.5 text-[0.82rem] font-semibold ring-1 transition">${t}</button>`).join('')}
  </div>

  <div class="space-y-7 pt-6 lg:grid lg:grid-cols-12 lg:gap-x-8 lg:gap-y-10 lg:space-y-0 lg:pt-8">
    <div id="invitation-position" class="px-4 md:px-0 lg:col-span-12" hidden></div>
    <section id="bloc-vaut" class="lg:col-span-4">
      <div class="mb-3 flex items-center justify-between gap-3 px-4 md:px-0">
        <h2 class="titre-section">Vaut le déplacement</h2>
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
    </section>

    <section id="bloc-prix" class="scroll-mt-24 px-4 md:px-0 lg:col-span-8">
      <div class="mb-3 flex items-end justify-between">
        <h2 class="titre-section">Tous les prix</h2>
        <span id="compte" class="voir-tout"></span>
      </div>
      <div class="carte overflow-hidden">
        <div class="${GRILLE} border-b border-trait bg-vert-50 px-3 py-2.5 text-[0.64rem] font-semibold text-gris min-[400px]:text-[0.7rem] lg:px-4 lg:py-3 lg:text-[0.78rem]">
          <span>Produit</span>
          ${D.marches.map(m => {
            // sous 400 px, « Moungali » déborde sur la colonne voisine : on abrège
            const court = m.nom_court || m.nom;
            const abrege = court.length > 6 ? court.slice(0, 5) + '.' : court;
            return `<span class="truncate text-right" title="${esc(m.nom)}"><span class="min-[400px]:hidden">${esc(abrege)}</span><span class="hidden min-[400px]:inline">${esc(court)}</span></span>`;
          }).join('')}
        </div>
        <div id="lignes"></div>
        <div id="vide" class="p-6 text-center" hidden>
          <p class="text-[0.92rem] font-semibold">Aucun produit trouvé.</p>
          <button type="button" id="effacer" class="mt-3 h-11 rounded-full bg-nav px-5 text-[0.84rem] font-semibold">Effacer la recherche</button>
        </div>
      </div>
      <div class="carte mt-4 p-4 lg:p-5">
        <p class="flex items-center gap-2 text-[0.84rem] font-semibold">${ic('question', 'size-4 text-vert-600')} Comment lire les prix</p>
        <ul class="mt-3.5 grid grid-cols-1 gap-x-8 gap-y-3.5 sm:grid-cols-2">
          ${[
            ['<span class="rounded-full bg-vert-500 px-2 py-0.5 font-bold text-encre">2 900</span>', 'Le moins cher relevé', 'pour ce produit, parmi les marchés récents'],
            ['<span class="rounded-full bg-ocre-pale px-2 py-0.5 font-semibold text-ocre">1 900</span>', 'Plus de 7 jours', 'prix à vérifier'],
            ['<s class="font-semibold text-gris-clair">1 900</s>', 'Plus de 14 jours', 'hors comparaison'],
            ['<span class="rounded-full bg-nav px-2 py-0.5 text-[0.68rem] font-semibold text-encre">variable</span>', 'Prix instable', 'dans ce marché, les étals ne s’accordent pas'],
            ['<span class="font-semibold text-gris-clair">—</span>', 'Pas vu', 'pas en vente dans l’unité de référence ce jour-là']
          ].map(([echantillon, titre, detail]) => `<li class="flex items-center gap-3">
              <span class="grid h-10 w-[4.25rem] shrink-0 place-items-center rounded-xl bg-fond text-[0.8rem] tabular-nums">${echantillon}</span>
              <span class="min-w-0 leading-tight">
                <b class="block text-[0.82rem] font-semibold text-encre">${titre}</b>
                <span class="text-[0.72rem] text-gris">${detail}</span>
              </span>
            </li>`).join('')}
        </ul>
        <a href="#/calcul" class="mt-4 inline-flex items-center gap-1 text-[0.8rem] font-semibold text-vert-700 hover:underline">
          Comment on calcule « vaut le déplacement » ${ic('chevron', 'size-4')}</a>
      </div>
    </section>

    <footer class="px-4 pb-2 md:px-0 lg:col-span-12">
      <div class="rounded-hero bg-foret p-5 text-white md:p-7">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div class="max-w-md">
            <p class="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-vert-300">Méthode de relevé</p>
            <p class="mt-1.5 text-[1.2rem] font-semibold leading-snug tracking-tight">Des prix relevés sur place, jamais repris d’un autre marché.</p>
            <span class="pastille mt-3.5 bg-white/10 text-white ring-1 ring-white/15">${ic('etiquette', 'size-3.5 text-vert-300')} Prix annoncés, avant marchandage</span>
          </div>
          <ul class="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:shrink-0 lg:gap-3">
            ${[
              ['marche', `${D.marches.length} marchés`, 'relevés par un binôme'],
              ['liste', '3 étals', 'par produit, le prix du milieu est retenu'],
              ['horloge', '14 jours', 'au-delà, un prix n’est plus affiché comme un prix']
            ].map(([icone, chiffre, texte]) => `<li class="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3.5 ring-1 ring-white/10 sm:block lg:w-48">
                <span class="grid size-10 shrink-0 place-items-center rounded-full bg-vert-500 text-encre sm:mb-3">${ic(icone)}</span>
                <span class="block">
                  <b class="block text-[1.05rem] font-semibold leading-tight">${chiffre}</b>
                  <span class="text-[0.74rem] leading-snug text-white/65">${texte}</span>
                </span>
              </li>`).join('')}
          </ul>
        </div>
      </div>
    </footer>
  </div>`;

  const champ = $('#recherche');
  const vider = $('#vider-recherche');
  const effacerRecherche = () => { etat.texte = ''; champ.value = ''; vider.hidden = true; majListe(); champ.focus(); };
  champ.addEventListener('input', () => { etat.texte = champ.value; vider.hidden = !champ.value; majListe(); });
  vider.addEventListener('click', effacerRecherche);
  $('#effacer').addEventListener('click', effacerRecherche);
  $('#bouton-filtre').addEventListener('click', () => {
    const f = $('#filtres');
    f.hidden = !f.hidden;
    $('#bouton-filtre').setAttribute('aria-expanded', String(!f.hidden));
  });
  $('#filtres').addEventListener('click', e => {
    const b = e.target.closest('[data-filtre]');
    if (!b) return;
    etat.filtre = b.dataset.filtre;
    majFiltres(); majListe();
  });
  $('#voir-vaut')?.addEventListener('click', () => {
    etat.filtre = 'vaut';
    $('#filtres').hidden = false;
    majFiltres(); majListe();
    $('#bloc-prix').scrollIntoView({ behavior: 'smooth' });
  });

  majFiltres();
  majListe();
  activerDefilement($('#defile-vaut'), 'vaut');
  preparerInvitation();
}

function majFiltres() {
  document.querySelectorAll('[data-filtre]').forEach(b => {
    const actif = b.dataset.filtre === etat.filtre;
    b.classList.toggle('bg-vert-500', actif);
    b.classList.toggle('ring-vert-500', actif);
    b.classList.toggle('bg-white', !actif);
    b.classList.toggle('ring-black/5', !actif);
    b.setAttribute('aria-pressed', String(actif));
  });
}

function produitsFiltres() {
  let liste = chercher(D.produits, etat.texte);
  if (etat.filtre === 'vaut') liste = liste.filter(vaut);
  else if (etat.filtre === 'gros' || etat.filtre === 'detail') liste = liste.filter(p => p.segment === etat.filtre);
  return liste;
}

function majListe() {
  const liste = produitsFiltres();
  $('#lignes').innerHTML = liste.map(ligneTableau).join('');
  $('#vide').hidden = liste.length > 0;
  $('#compte').textContent = `${liste.length} produit${liste.length > 1 ? 's' : ''}`;
  const sansCarrousel = Boolean(etat.texte) || etat.filtre !== 'tous';
  $('#bloc-vaut').hidden = sansCarrousel;
  // sur grand écran, le tableau reprend toute la largeur quand le carrousel disparaît
  $('#bloc-prix').classList.toggle('lg:col-span-8', !sansCarrousel);
  $('#bloc-prix').classList.toggle('lg:col-span-12', sansCarrousel);
}

function carteVaut(p) {
  const e = EVALS.get(p.id).ecartUtile;
  return `<a href="#/produit/${encodeURIComponent(p.id)}"
      class="relative block aspect-[4/5] w-40 shrink-0 snap-start overflow-hidden rounded-[1.4rem] bg-foret shadow-carte last:snap-end lg:w-auto">
    <img src="images/produits/${p.id}.webp" alt="" loading="lazy" decoding="async" draggable="false" class="absolute inset-0 size-full object-cover">
    <span class="absolute inset-0 bg-gradient-to-b from-transparent via-foret/10 to-foret/90"></span>
    <span class="pastille absolute right-2.5 top-2.5 bg-white/25 text-white ring-1 ring-white/30 backdrop-blur-md">−${nombre(e.ecart)} F</span>
    <span class="absolute inset-x-3 bottom-3 text-white">
      <span class="block text-[0.95rem] font-semibold leading-tight">${esc(p.nom)}</span>
      <span class="mt-1 flex items-center gap-1 text-[0.72rem] text-white/80">${ic('position', 'size-3.5')} ${esc(e.marche.nom_court)}</span>
    </span>
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

function ligneTableau(p) {
  const ev = EVALS.get(p.id);
  const e = ev.ecartUtile;
  const cellules = D.marches.map(m =>
    celluleTableau(ev.lignes.find(l => l.marche.id === m.id), ev.badge === m.id)).join('');
  const sousLigne = e.evaluable && e.vaut
    ? `<span class="flex items-center gap-1 font-semibold text-vert-700">${ic('position', 'size-3 shrink-0 text-vert-500')}<span class="truncate"><span class="hidden min-[400px]:inline">${esc(e.marche.nom_court)} · </span>−${nombre(e.ecart)} F</span></span>`
    : `<span class="hidden truncate text-gris-clair min-[400px]:block">${esc(p.unite_reference)}</span>`;
  return `<a href="#/produit/${encodeURIComponent(p.id)}" class="${GRILLE} border-b border-trait px-3 py-2.5 last:border-0 hover:bg-vert-50/60 active:bg-vert-50 lg:px-4 lg:py-3">
    <span class="flex min-w-0 items-center gap-2 min-[400px]:gap-2.5">
      <img src="images/produits/${p.id}-vignette.webp" alt="" width="80" height="80" loading="lazy" decoding="async"
           class="size-8 shrink-0 rounded-lg object-cover min-[400px]:size-10 min-[400px]:rounded-xl lg:size-11">
      <span class="min-w-0">
        <span class="line-clamp-2 block text-[0.76rem] font-semibold leading-tight text-encre min-[400px]:text-[0.86rem] lg:text-[0.95rem]">${esc(p.nom)}</span>
        <span class="mt-0.5 block text-[0.66rem] leading-tight">${sousLigne}</span>
      </span>
    </span>
    ${cellules}
  </a>`;
}

/* ------------------------------------------------------------ fiche produit */

function tuileMarche(m) {
  // alt vide : le nom du marché est écrit juste à côté
  return `<img src="images/marches/${esc(m.id)}-vignette.webp" alt="" width="88" height="88" loading="lazy" decoding="async"
      class="size-11 shrink-0 rounded-xl bg-vert-100 object-cover">`;
}

function carteVerdict(ev) {
  const e = ev.ecartUtile;
  let icone, pastille, titre, note, positif = false;

  if (!e.evaluable) {
    icone = 'question'; pastille = 'bg-nav text-gris';
    titre = 'Pas assez de relevés récents';
    note = 'Moins de trois marchés ont un relevé de moins de 7 jours pour ce produit.';
  } else if (e.surPlace) {
    icone = 'maison'; pastille = 'bg-vert-500 text-encre'; positif = true;
    titre = 'C’est ici le moins cher';
    note = `Aucun autre marché relevé n’est moins cher que le ${esc(e.depuis.nom)}. Inutile de bouger.`;
  } else {
    const chiffres = e.depuis
      ? `Écart de ${fcfa(e.ecart)} depuis le ${e.depuis.nom} · aller-retour vers le ${e.marche.nom} : ${fcfa(e.seuil)}`
      : `Écart entre marchés de ${fcfa(e.ecart)} · aller-retour estimé à ${fcfa(e.seuil)}`;
    if (e.vaut) {
      icone = 'aller'; pastille = 'bg-vert-500 text-encre'; positif = true;
      titre = 'Ça vaut le déplacement';
      note = `${esc(chiffres)}.${e.depuis ? '' : ` Le moins cher est au ${esc(e.marche.nom)}.`}`;
    } else {
      icone = 'maison'; pastille = 'bg-nav text-encre';
      titre = 'Ça ne vaut pas le déplacement';
      note = `${esc(chiffres)}. Restez dans votre marché.`;
    }
  }

  const preciser = !departMarche() && e.evaluable
    ? `<a href="#/mon-marche" class="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-vert-700">${ic('position', 'size-4')} Choisir mon point de départ</a>`
    : '';
  const liens = `<div class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">${preciser}
      <a href="#/calcul" class="inline-flex items-center gap-1 text-[0.8rem] font-semibold text-gris hover:text-encre">${ic('question', 'size-4')} Comment c’est calculé</a>
    </div>`;
  return `<div class="carte flex gap-3.5 p-4 ${positif ? 'bg-vert-50 ring-vert-300' : ''}">
    <span class="grid size-11 shrink-0 place-items-center rounded-full ${pastille}">${ic(icone)}</span>
    <div class="min-w-0">
      <p class="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-gris-clair">${e.evaluable ? 'Verdict' : 'Écart non évaluable'}</p>
      <p class="mt-0.5 text-[1.05rem] font-semibold leading-snug">${titre}</p>
      <p class="mt-1 text-[0.8rem] leading-relaxed text-gris">${note}</p>
      ${liens}
    </div>
  </div>`;
}

function ligneMarche(l, moinsCher, depart) {
  let prix, meta;
  if (l.statut === 'pas_vu') {
    prix = `<span class="text-[0.8rem] font-medium text-gris-clair">pas vu ce jour</span>`;
    meta = 'Aucun étal ne vendait dans l’unité de référence';
  } else if (l.statut === 'instable') {
    prix = `<span class="whitespace-nowrap text-[0.95rem] font-semibold tabular-nums">${nombre(l.prix_min)} – ${nombre(l.prix_max)} F</span>`;
    meta = `${ic('alerte', 'size-3.5 text-ocre')} Prix instable dans ce marché · ${esc(l.libelle)} · hors comparaison`;
  } else {
    const style = moinsCher ? 'rounded-full bg-vert-500 px-2.5 py-1 font-bold'
      : l.etat === 'perime' ? 'font-semibold text-gris-clair line-through'
      : l.etat === 'orange' ? 'font-semibold text-ocre' : 'font-semibold';
    prix = `<span class="${style} whitespace-nowrap text-[1rem] tabular-nums">${esc(fcfa(l.prix))}</span>`;
    meta = [l.mot ? esc(auUnite(l.mot)) : '', esc(l.libelle)].filter(Boolean).join(' · ');
    if (l.etat === 'orange') meta += ` · <span class="pastille bg-ocre-pale py-0.5 text-ocre">à vérifier</span>`;
    if (l.etat === 'perime') meta += ' · exclu de la comparaison';
  }

  const estDepart = depart && depart.marche.id === l.marche.id;
  const lieu = estDepart ? 'votre marché'
    : depart ? distanceLisible(distanceKm(depart.marche.position, l.marche.position))
    : l.marche.arrondissement;

  return `<div class="flex items-center gap-3 py-3">
    ${tuileMarche(l.marche)}
    <div class="min-w-0 flex-1">
      <p class="text-[0.9rem] font-semibold leading-snug">${esc(l.marche.nom)}</p>
      <p class="mt-0.5 flex items-center gap-1 text-[0.72rem] text-gris-clair">${ic('position', 'size-3.5 text-vert-500')} ${esc(lieu)}</p>
      ${moinsCher ? '<p class="mt-0.5 text-[0.72rem] font-semibold text-vert-700">le moins cher relevé</p>' : ''}
      <p class="mt-0.5 flex flex-wrap items-center gap-x-1 text-[0.72rem] text-gris">${meta}</p>
    </div>
    <div class="shrink-0 text-right">${prix}</div>
  </div>`;
}

function ligneContribution(c, avecProduit = false) {
  const m = D.marches.find(x => x.id === c.marche);
  const p = D.produits.find(x => x.id === c.produit);
  const j = joursEcoules(c.date, MAINTENANT);
  const alerte = c.ecart_important ? ` · <span class="pastille bg-ocre-pale py-0.5 text-ocre">écart important, à vérifier</span>` : '';
  const visuel = avecProduit && p
    ? `<img src="images/produits/${p.id}-vignette.webp" alt="" loading="lazy" class="size-11 shrink-0 rounded-xl object-cover">`
    : (m ? tuileMarche(m) : '');
  return `<div class="flex items-center gap-3 py-3">
    ${visuel}
    <div class="min-w-0 flex-1">
      <p class="truncate text-[0.9rem] font-semibold">${esc(avecProduit && p ? p.nom : (m ? m.nom : c.marche))}</p>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-1 text-[0.72rem] text-gris-clair">${avecProduit && m ? esc(m.nom) + ' · ' : ''}${esc(libelleJours(j))}${alerte}</p>
    </div>
    <span class="shrink-0 whitespace-nowrap text-[0.95rem] font-semibold tabular-nums text-gris">${esc(fcfa(c.prix))}</span>
  </div>`;
}

/* US-08 — zone distincte, hors tri, hors badge, hors écart utile. */
function zoneContributions(p) {
  const liste = pourProduit(p.id);
  if (!liste.length) return '';
  return `<section>
    <h2 class="titre-section">Proposé par un utilisateur, non vérifié</h2>
    <p class="mb-3 mt-1 text-[0.74rem] leading-relaxed text-gris">Ces prix n’entrent ni dans le tri, ni dans le badge, ni dans le calcul du déplacement.
      <a href="#/calcul" class="font-semibold text-vert-700 hover:underline">Pourquoi « écart important » ?</a></p>
    <div class="carte divide-y divide-dashed divide-trait px-3">${liste.map(c => ligneContribution(c)).join('')}</div>
  </section>`;
}

/* US-07 — proposer un prix, sans compte, en moins de 30 secondes. */
function formulaire(p) {
  const options = D.marches.map(m => `<option value="${esc(m.id)}">${esc(m.nom)}</option>`).join('');
  return `<form id="form-prix" class="carte space-y-3.5 p-4" novalidate>
    <h2 class="titre-section flex items-center gap-2">${ic('plus', 'size-5 text-vert-600')} Proposer un prix vu au marché</h2>
    <div class="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
      <label class="block"><span class="mb-1.5 block text-[0.72rem] font-medium text-gris">Marché</span>
        <select id="f-marche" class="h-12 w-full rounded-full border border-trait bg-white px-4 text-[0.92rem] focus:border-vert-500 focus:outline-none">
          <option value="">Choisir…</option>${options}</select></label>
      <label class="block"><span class="mb-1.5 block text-[0.72rem] font-medium text-gris">Prix en F CFA</span>
        <input id="f-prix" type="text" inputmode="numeric" autocomplete="off" placeholder="ex. 2500"
               class="h-12 w-full rounded-full border border-trait bg-white px-4 text-[0.92rem] tabular-nums focus:border-vert-500 focus:outline-none"></label>
    </div>
    <button type="submit" class="h-12 w-full rounded-full bg-vert-500 text-[0.95rem] font-semibold text-encre transition active:scale-[0.98]">Enregistrer ce prix</button>
    <p class="text-[0.73rem] leading-relaxed text-gris">Pour ${esc(p.unite_reference)}. Conservé sur votre téléphone, rien n’est transmis.</p>
    <p id="msg-prix" class="rounded-2xl px-3.5 py-2.5 text-[0.8rem] font-semibold leading-relaxed" hidden></p>
  </form>`;
}

function rendreProduit(vue, p) {
  const ev = EVALS.get(p.id);
  const depart = departMarche();

  vue.innerHTML = `
  <div class="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8 lg:pt-4">
  <section class="relative h-72 overflow-hidden rounded-b-hero bg-foret text-white md:mt-4 md:h-96 md:rounded-hero lg:sticky lg:top-24 lg:col-span-5 lg:mt-0 lg:h-[min(640px,calc(100dvh-8rem))]">
    <img src="images/produits/${p.id}.webp" alt="${esc(p.nom)}" fetchpriority="high" decoding="async" class="absolute inset-0 size-full object-cover">
    <span class="absolute inset-0 bg-gradient-to-b from-foret/55 via-foret/15 to-foret/95"></span>
    <div class="relative flex h-full flex-col px-4 pb-5 ${HAUT} md:p-6 lg:p-8">
      <div class="flex items-center justify-between">
        <a href="#/" class="bouton-rond" aria-label="Retour à tous les prix">${ic('retour')}</a>
        <a href="#/carte/${encodeURIComponent(p.id)}" class="bouton-rond" aria-label="Voir ce produit sur la carte">${ic('carte')}</a>
      </div>
      <div class="mt-auto">
        <p class="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-white/75">${esc(p.unite_reference)}</p>
        <h1 class="mt-1 text-[1.9rem] font-semibold leading-tight tracking-tight lg:text-[2.4rem]">${esc(p.nom)}</h1>
        <p class="mt-2 flex flex-wrap items-center gap-2 text-[0.76rem] text-white/85">
          <span class="pastille bg-white/20 ring-1 ring-white/25 backdrop-blur">${p.segment === 'gros' ? 'Gros' : 'Détail'}</span>
          Prix annoncé, avant marchandage
        </p>
      </div>
    </div>
  </section>

  <div class="space-y-6 px-4 pt-5 md:px-0 lg:col-span-7 lg:pt-0">
    ${carteVerdict(ev)}
    <section>
      <div class="mb-3 flex items-end justify-between">
        <h2 class="titre-section">Prix par marché</h2>
        <span class="voir-tout">${depart ? 'depuis ' + esc(depart.marche.nom_court) : 'du moins cher au plus cher'}</span>
      </div>
      <div class="carte divide-y divide-trait px-3">${ev.lignes.map(l => ligneMarche(l, ev.badge === l.marche.id, depart)).join('')}</div>
      <p class="mt-3 px-1 text-[0.74rem] leading-relaxed text-gris">
        ${p.maniere_de_vendre === 'format_variable' ? 'Le prix relevé porte sur ce format. ' : ''}Aucun prix au kilo,
        aucune équivalence de poids : les prix ne sont comparés qu’à unité de référence identique.</p>
    </section>
    ${zoneContributions(p)}
    ${formulaire(p)}
  </div>
  </div>`;

  brancherFormulaire(p);
  if (etat.message) {
    afficherMessage(etat.message.type, etat.message.texte);
    etat.message = null;
  }
}

function afficherMessage(type, texte) {
  const el = $('#msg-prix');
  if (!el) return;
  el.classList.remove('bg-vert-100', 'text-vert-700', 'bg-ocre-pale', 'text-ocre');
  el.classList.add(...(type === 'ok' ? ['bg-vert-100', 'text-vert-700'] : ['bg-ocre-pale', 'text-ocre']));
  el.textContent = texte;
  el.hidden = false;
}

function brancherFormulaire(p) {
  const form = $('#form-prix');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const marche = $('#f-marche').value;
    const v = valider(marche, $('#f-prix').value);
    if (!v.ok) { afficherMessage('erreur', v.message); return; }   // rien n'est enregistré

    const ligne = EVALS.get(p.id).lignes.find(l => l.marche.id === marche);
    const reference = ligne && ligne.statut === 'releve' ? ligne.prix : null;
    const c = ajouter({ produit: p.id, marche, prix: v.prix, unite: p.unite_reference, date: iso(MAINTENANT), reference });
    if (!c) { afficherMessage('erreur', 'Impossible d’enregistrer sur cet appareil.'); return; }

    const nomMarche = D.marches.find(m => m.id === marche).nom;
    etat.message = {
      type: 'ok',
      texte: `Enregistré : ${fcfa(c.prix)} au ${nomMarche}, pour ${p.unite_reference}. ` +
             'Conservé sur votre téléphone, il n’est pas transmis.' +
             (c.ecart_important ? ' Écart important avec le dernier relevé, à vérifier.' : '')
    };
    const y = window.scrollY;
    rendreProduit($('#vue'), p);
    window.scrollTo(0, y);
    $('#msg-prix')?.scrollIntoView({ block: 'nearest' });
  });
}

/* --------------------------------------------------------------------- carte */

function cartesMarches(produit, depart) {
  const ev = EVALS.get(produit.id);
  const lignes = [...ev.lignes];
  if (depart) {
    lignes.sort((a, b) => distanceKm(depart.marche.position, a.marche.position) -
                          distanceKm(depart.marche.position, b.marche.position));
  }
  return lignes.map(l => {
    const m = l.marche;
    const moinsCher = ev.badge === m.id;
    const estDepart = depart?.marche.id === m.id;
    const prix = l.statut === 'pas_vu' ? 'pas vu ce jour'
      : l.statut === 'instable' ? `${nombre(l.prix_min)} – ${nombre(l.prix_max)} F` : fcfa(l.prix);
    const couleur = l.etat === 'orange' ? 'text-ocre' : l.etat === 'perime' ? 'text-gris-clair line-through' : 'text-encre';
    const lieu = estDepart ? 'votre marché'
      : depart ? distanceLisible(distanceKm(depart.marche.position, m.position)) : m.arrondissement;
    const trajet = depart && !estDepart ? `A/R ${fcfa(coutTrajet(depart.marche.id, m.id, D.meta))}` : '';
    return `<button type="button" data-marche="${esc(m.id)}" class="carte w-44 shrink-0 snap-start p-2.5 text-left transition last:snap-end active:scale-[0.98] lg:w-auto">
      <span class="relative flex aspect-[4/3] items-end overflow-hidden rounded-2xl bg-vert-100 p-2">
        <img src="images/marches/${esc(m.id)}.webp" alt="" loading="lazy" decoding="async" draggable="false" class="absolute inset-0 size-full object-cover">
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
  }).join('');
}

async function rendreCarte(vue, idProduit) {
  const depart = departMarche();
  let produit = D.produits.find(p => p.id === idProduit) || D.produits.find(vaut) || D.produits[0];

  vue.innerHTML = `
  <div class="relative lg:grid lg:grid-cols-12 lg:items-start lg:gap-6 lg:pt-4">
    <div class="lg:sticky lg:top-24 lg:col-span-8">
      <div id="carte" class="h-[62vh] min-h-96 w-full bg-[#E9ECEA] md:mt-4 md:overflow-hidden md:rounded-hero lg:mt-0 lg:h-[calc(100dvh-8rem)]"
           role="region" aria-label="Carte des quatre marchés"></div>
    </div>
    <aside class="lg:col-span-4">
      <div class="pointer-events-none absolute inset-x-0 top-0 z-[500] bg-gradient-to-b from-fond via-fond/85 to-transparent px-4 pb-10 ${HAUT} md:mt-4 md:px-5 md:pt-5 lg:pointer-events-auto lg:static lg:z-auto lg:mt-0 lg:bg-none lg:p-0">
        <div class="pointer-events-auto flex items-center gap-3">
          <a href="#/" class="bouton-rond" aria-label="Retour">${ic('retour')}</a>
          <h1 class="flex-1 text-center text-[1.1rem] font-semibold tracking-tight lg:text-left lg:text-[1.3rem]">Marchés près de vous</h1>
          <span class="size-11 shrink-0 lg:hidden"></span>
        </div>
        <div class="pointer-events-auto mt-3 flex items-center gap-2.5">
          <label class="relative flex-1">
            ${ic('recherche', 'pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-gris-clair')}
            <select id="carte-produit" class="champ-recherche appearance-none pr-10" aria-label="Produit affiché sur la carte">
              ${D.produits.map(p => `<option value="${esc(p.id)}"${p.id === produit.id ? ' selected' : ''}>${esc(p.nom)}</option>`).join('')}
            </select>
            ${ic('chevron-bas', 'pointer-events-none absolute right-4 top-1/2 z-10 size-4 -translate-y-1/2 text-gris')}
          </label>
          </div>
        <p id="carte-position-info" class="pointer-events-auto mt-2.5 flex items-center gap-2 rounded-2xl bg-white/95 px-3.5 py-2 text-[0.74rem] text-gris shadow-carte ring-1 ring-black/5" hidden></p>
      <p id="carte-msg" class="pointer-events-auto mt-2.5 rounded-2xl bg-ocre-pale px-3.5 py-2 text-[0.76rem] font-semibold text-ocre" hidden></p>
      </div>

      <section class="relative z-[600] -mt-7 rounded-t-hero bg-fond pt-5 md:mt-0 lg:z-auto lg:mt-6 lg:rounded-none lg:bg-transparent lg:pt-0">
        <div class="mb-3 flex items-center justify-between gap-3 px-4 md:px-0">
          <h2 id="carte-titre" class="titre-section shrink-0">${depart ? 'Marchés les plus proches' : 'Les quatre marchés'}</h2>
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

  const message = (texte, bouton = null) => {
    const m = $('#carte-msg');
    m.textContent = texte;
    if (bouton) {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'ml-1 underline', textContent: bouton.libelle });
      b.addEventListener('click', bouton.action);
      m.append(' ', b);
    }
    m.hidden = false;
  };
  const afficherCoordonnees = pos => {
    const el = $('#carte-position-info');
    el.innerHTML = `${ic('viseur', 'size-4 shrink-0 text-vert-600')}<span>Votre position : ` +
      `<b class="font-semibold tabular-nums text-encre">${coordonnees(pos)}</b> · à ± ${metres(pos.precision)}</span>`;
    el.hidden = false;
  };

  const majDefile = activerDefilement($('#carte-cartes'), 'marches');

  const rafraichir = () => {
    const ev = EVALS.get(produit.id);
    const d = departMarche();
    $('#carte-cartes').innerHTML = cartesMarches(produit, d);
    majDefile();
    $('#carte-titre').textContent = d ? 'Marchés les plus proches' : 'Les quatre marchés';
    $('#carte-produit-nom').textContent = produit.nom;
    moduleCarte?.epingles({ marches: D.marches, lignes: ev.lignes, badge: ev.badge, produit, format: fcfa });
  };

  $('#carte-produit').addEventListener('change', e => {
    produit = D.produits.find(p => p.id === e.target.value);
    history.replaceState(null, '', '#/carte/' + encodeURIComponent(produit.id));
    rafraichir();
  });
  $('#carte-cartes').addEventListener('click', e => {
    const b = e.target.closest('[data-marche]');
    if (b) moduleCarte?.centrer(D.marches.find(m => m.id === b.dataset.marche));
  });
  // « Vous êtes ici » : mesure précise, à la demande, dessinée sur la carte.
  const localiserIci = async () => {
    $('#carte-msg').hidden = true;
    moduleCarte?.enCours(true);
    try {
      const position = await obtenirPosition();
      positionSession = position;
      const proche = marcheLePlusProche(position, D.marches);
      moduleCarte?.positionUtilisateur(position, proche?.marche);
      afficherCoordonnees(position);
      if (!proche) throw new Error('loin');
      if (position.precision > PRECISION_SUFFISANTE) {
        message(`Position imprécise, à ± ${metres(position.precision)} : elle vient sans doute du réseau (Wi-Fi ou adresse IP), pas du GPS.`, {
          libelle: 'Comment l’améliorer ?',
          action: async () => { if (await ouvrirDialogue('appareil', position.precision)) localiserIci(); }
        });
      } else {
        definirMarcheDepart(proche.marche.id, 'position', proche.km);
        evaluerTout();
        rafraichir();
        majBarre();
      }
    } catch (err) {
      if (err.message !== 'gere') message((MESSAGES[err.message] || MESSAGES.echec).replace(' ci-dessous', ' dans « Point de départ »'));
    } finally {
      moduleCarte?.enCours(false);
    }
  };

  if (navigator.onLine === false) {
    message('Carte indisponible hors connexion. Les marchés restent listés ci-dessous.');
    return;
  }
  try {
    moduleCarte = await import('./carte.js');
    if (!document.getElementById('carte')) return;   // l'utilisateur est déjà parti
    const ev = EVALS.get(produit.id);
    await moduleCarte.afficher($('#carte'), { marches: D.marches, lignes: ev.lignes, badge: ev.badge, produit, format: fcfa, surPosition: localiserIci });
    if (positionSession) {
      moduleCarte.positionUtilisateur(positionSession, null, false);
      afficherCoordonnees(positionSession);
    }
  } catch (err) {
    console.warn('[zando] carte :', err.message);
    message('La carte n’a pas pu se charger. Les marchés restent listés ci-dessous.');
  }
}

/* ----------------------------------------------------------------- mes prix */

function rendreMesPrix(vue) {
  const liste = toutesLesContributions().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  vue.innerHTML = `
  <header class="bg-gradient-to-b from-vert-100 to-fond px-4 pb-5 ${HAUT} md:mx-auto md:mt-4 md:max-w-2xl md:rounded-hero md:px-6 md:pt-6">
    <div class="flex items-center gap-3">
      <a href="#/" class="bouton-rond" aria-label="Retour">${ic('retour')}</a>
      <h1 class="flex-1 text-center text-[1.1rem] font-semibold tracking-tight">Mes prix proposés</h1>
      <span class="size-11 shrink-0"></span>
    </div>
    <p class="mx-auto mt-4 max-w-[34ch] text-center text-[0.8rem] leading-relaxed text-gris">
      Proposés par vous, non vérifiés. Conservés sur ce téléphone et jamais transmis.</p>
  </header>
  <div class="px-4 md:mx-auto md:max-w-2xl md:px-0">
    ${liste.length
      ? `<div class="carte divide-y divide-trait px-3">${liste.map(c =>
          `<a href="#/produit/${encodeURIComponent(c.produit)}" class="block">${ligneContribution(c, true)}</a>`).join('')}</div>`
      : `<div class="carte p-6 text-center">
           <span class="mx-auto grid size-14 place-items-center rounded-full bg-vert-100 text-vert-700">${ic('liste', 'size-6')}</span>
           <p class="mt-4 text-[0.98rem] font-semibold">Aucun prix proposé pour l’instant</p>
           <p class="mt-1.5 text-[0.82rem] leading-relaxed text-gris">Ouvrez un produit et notez le prix que vous venez de voir au marché.</p>
           <a href="#/" class="mt-5 inline-flex h-12 items-center rounded-full bg-vert-500 px-6 text-[0.9rem] font-semibold text-encre">Voir les produits</a>
         </div>`}
  </div>`;
}

/* -------------------------------------------------------- comment on calcule */

/* R4, R5, R6, R7 et le protocole des 40 %, expliqués avec les chiffres du fichier en cours :
   quand le PM remplace les prix ou les trajets, les exemples suivent. */
function rendreCalcul(vue) {
  const seuil = D.meta.seuil_deplacement_fcfa;
  const course = Math.round(seuil / 2);
  const nomCourt = id => D.marches.find(m => m.id === id)?.nom_court ?? id;
  const trajets = Object.entries(D.meta.trajets || {}).sort((a, b) => a[1] - b[1]);

  let instable = null;
  for (const p of D.produits) for (const m of D.marches) {
    const r = p.releves[m.id];
    if (!instable && r?.statut === 'instable') instable = { p, m, min: r.prix_min, max: r.prix_max };
  }

  // un produit dont la réponse change selon le marché de départ
  const depuis = p => D.marches.map(m => ({ m, e: evaluerProduit(p, D.marches, MAINTENANT, D.meta, m.id).ecartUtile }));
  const exemple = D.produits.map(p => ({ p, v: depuis(p) }))
    .find(x => x.v.some(y => y.e.vaut) && x.v.some(y => y.e.evaluable && !y.e.vaut && !y.e.surPlace && !y.e.general));
  const sansVerdict = D.produits.filter(p => !EVALS.get(p.id)?.ecartUtile.evaluable).length;

  const refP = D.produits.find(p => p.id === 'kwanga') || D.produits[0];
  const refM = D.marches.find(m => refP.releves[m.id]?.statut === 'releve');
  const ref = refM ? refP.releves[refM.id].prix : null;

  const encadre = html => `<div class="rounded-2xl bg-fond p-3.5 text-[0.8rem] leading-relaxed text-encre">${html}</div>`;
  const etape = (n, titre, corps) => `<section class="carte p-4 lg:p-5">
    <div class="flex items-center gap-3">
      <span class="grid size-9 shrink-0 place-items-center rounded-full bg-vert-500 text-[0.9rem] font-bold text-encre">${n}</span>
      <h2 class="text-[1rem] font-semibold leading-snug tracking-tight">${titre}</h2>
    </div>
    <div class="mt-3.5 space-y-4 text-[0.84rem] leading-relaxed text-gris">${corps}</div>
  </section>`;
  const regle = (lettre, icone, titre, texte) => `<div class="flex gap-3">
    <span class="grid size-9 shrink-0 place-items-center rounded-full bg-vert-100 text-vert-700">${ic(icone, 'size-4')}</span>
    <div class="min-w-0 flex-1">
      <p class="font-semibold text-encre">${lettre}) ${titre}</p>
      <div class="mt-1 space-y-2.5">${texte}</div>
    </div>
  </div>`;

  let bloc40 = '';
  if (instable) {
    const ecart = instable.max - instable.min;
    const limite = Math.round(instable.min * 1.4);
    bloc40 = encadre(`<b class="font-semibold">Exemple : ${esc(instable.p.nom)} au ${esc(instable.m.nom)}.</b>
      Une vendeuse annonce ${fcfa(instable.min)}, une autre ${fcfa(instable.max)}. L’écart est de ${fcfa(ecart)},
      soit ${Math.round(ecart / instable.min * 100)}&nbsp;% du prix le plus bas. Au-delà de ${fcfa(limite)}
      (${fcfa(instable.min)}&nbsp;+&nbsp;40&nbsp;%), c’est trop : le marché est marqué « prix instable ».`);
  }

  let blocExemple = '';
  if (exemple) {
    const { p, v } = exemple;
    const ev = evaluerProduit(p, D.marches, MAINTENANT, D.meta, null);
    const g = ev.ecartUtile;
    const prix = D.marches.map(m => {
      const l = ev.lignes.find(x => x.marche.id === m.id);
      const bas = g.marche?.id === m.id;
      return `<li class="rounded-xl px-1 py-2 text-center ${bas ? 'bg-vert-500 text-encre' : 'bg-fond'}">
        <span class="block truncate text-[0.68rem] ${bas ? 'font-semibold' : 'text-gris'}">${esc(m.nom_court)}</span>
        <b class="block text-[0.8rem] font-semibold tabular-nums">${l?.statut === 'releve' ? esc(nombre(l.prix)) : '—'}</b>
      </li>`;
    }).join('');
    const ligne = (vaut, titre, detail) => `<li class="flex items-start gap-3 rounded-2xl p-3 ${vaut ? 'bg-vert-50' : 'bg-fond'}">
      <span class="grid size-8 shrink-0 place-items-center rounded-full text-encre ${vaut ? 'bg-vert-500' : 'bg-nav'}">${ic(vaut ? 'aller' : 'maison', 'size-4')}</span>
      <span class="min-w-0 text-[0.8rem] leading-snug"><b class="block font-semibold text-encre">${titre}</b><span class="text-gris">${detail}</span></span>
    </li>`;
    const departs = v.map(({ m, e }) => {
      if (!e.evaluable || e.general) return '';
      if (e.surPlace) return ligne(false, `Depuis ${esc(m.nom_court)} : restez-y`, 'C’est déjà le marché le moins cher.');
      const compare = e.ecart > e.seuil ? 'plus que' : e.ecart === e.seuil ? 'autant que' : 'moins que';
      return ligne(e.vaut, `Depuis ${esc(m.nom_court)} : ${e.vaut ? 'ça vaut le déplacement' : 'ça ne vaut pas le déplacement'}`,
        `${fcfa(e.ecart)} d’économie, ${compare} le taxi aller-retour vers ${esc(e.marche.nom_court)} (${fcfa(e.seuil)}).`);
    }).join('');
    const inconnu = g.evaluable
      ? ligne(g.vaut, `Sans point de départ : ${g.vaut ? 'ça vaut le déplacement' : 'ça ne vaut pas le déplacement'}`,
          `On prend l’écart entre le plus cher et le moins cher, ${fcfa(g.ecart)}, face au taxi général de ${fcfa(g.seuil)}.
           C’est moins juste : voilà pourquoi l’app demande d’où vous partez.`)
      : '';
    blocExemple = `<div class="space-y-2.5">
      <p class="font-semibold text-encre">Exemple : ${esc(p.nom)}, ${esc(p.unite_reference.toLowerCase())}</p>
      <ul class="grid grid-cols-4 gap-1.5">${prix}</ul>
      <ul class="space-y-2">${departs}${inconnu}</ul>
    </div>`;
  }

  vue.innerHTML = `
  <header class="bg-gradient-to-b from-vert-100 to-fond px-4 pb-2 ${HAUT} md:mx-auto md:mt-4 md:max-w-2xl md:rounded-hero md:px-6 md:pt-6">
    <div class="flex items-center gap-3">
      <a href="#/" class="bouton-rond" aria-label="Retour">${ic('retour')}</a>
      <h1 class="flex-1 text-center text-[1.1rem] font-semibold tracking-tight">Comment on calcule</h1>
      <span class="size-11 shrink-0"></span>
    </div>
  </header>
  <div class="space-y-4 px-4 pb-8 pt-4 md:mx-auto md:max-w-2xl md:px-0">
    <div>
      <p class="text-[1.5rem] font-semibold leading-tight tracking-tight">Est-ce que ça vaut le taxi ?</p>
      <p class="mt-2 text-[0.86rem] leading-relaxed text-gris">Zando Prix compare deux montants : ce que vous économisez en achetant
        dans un autre marché, et ce que coûte le taxi aller-retour pour y aller. Si l’économie est plus grande que le taxi,
        ça vaut le déplacement.</p>
    </div>

    <section class="carte p-4 lg:p-5">
      <p class="flex items-center gap-2 text-[1rem] font-semibold">${ic('aller', 'size-5 text-vert-600')} Le prix du taxi</p>
      <p class="mt-2 text-[0.84rem] leading-relaxed text-gris">Une course coûte ${fcfa(course)} au minimum : un aller-retour,
        <b class="font-semibold text-encre">au moins ${fcfa(seuil)}</b>. Plus le marché est loin, plus c’est cher.</p>
      <ul class="mt-2 divide-y divide-trait">${trajets.map(([cle, montant]) => {
        const [a, b] = cle.split('|');
        return `<li class="flex items-center justify-between gap-3 py-2.5 text-[0.84rem]">
          <span class="flex items-center gap-1.5">${esc(nomCourt(a))} <span class="text-gris-clair">–</span> ${esc(nomCourt(b))}</span><b class="font-semibold tabular-nums">${fcfa(montant)}</b></li>`;
      }).join('')}</ul>
      <p class="mt-2 text-[0.74rem] leading-relaxed text-gris-clair">Prix aller-retour. Sans point de départ connu, on compte
        ${fcfa(seuil)}. Montants provisoires, à confirmer sur le terrain.</p>
    </section>

    ${etape(1, 'Garder seulement les prix fiables', `
      ${regle('a', 'horloge', 'Relevé il y a moins de 7 jours',
        `<p>De 7 à 14 jours, le prix est affiché « à vérifier » ; au-delà de 14 jours, il est barré. Il reste visible, mais il
         ne sert pas au calcul : il a pu changer, et un taxi payé pour rien coûte au moins ${fcfa(seuil)}.</p>`)}
      ${regle('b', 'alerte', 'Pas un « prix instable »',
        `<p>Dans chaque marché, le binôme note le prix de 3 étals et retient celui du milieu. Si deux étals s’écartent de
         <b class="font-semibold text-encre">plus de 40&nbsp;%</b>, il en visite 2 de plus. Si l’écart persiste, le marché est marqué
         « prix instable » : on ne connaît pas « le » prix de ce marché. L’app affiche la fourchette, mais ne s’en sert pas
         pour comparer.</p>${bloc40}`)}
      ${regle('c', 'marche', 'Au moins 3 marchés sur 4',
        `<p>Avec moins de 3 prix fiables, le moins cher trouvé n’est peut-être pas le vrai moins cher : un marché sans prix
         fiable pourrait l’être encore plus. L’app n’affiche alors aucun verdict, seulement « Pas assez de relevés récents ».</p>
         ${sansVerdict ? `<p>Aujourd’hui : ${sansVerdict} produit${sansVerdict > 1 ? 's' : ''} sur ${D.produits.length} dans ce cas.</p>` : ''}`)}
    `)}

    ${etape(2, 'Trouver le marché le moins cher', `<p>Parmi les prix gardés, le plus bas porte la mention
      <span class="whitespace-nowrap rounded-full bg-vert-500 px-2 py-0.5 text-[0.76rem] font-bold text-encre">le moins cher relevé</span>.
      En cas d’égalité, aucun marché ne la reçoit.</p>`)}

    ${etape(3, 'Comparer l’économie au taxi', `
      ${encadre(`<b class="block font-semibold">Économie = prix dans votre marché − prix le moins cher</b>
        Ça vaut le déplacement si l’économie est <b class="font-semibold">plus grande</b> que le taxi aller-retour.
        À égalité, non : vous auriez traversé la ville pour rien.`)}
      ${blocExemple}
      ${departMarche() ? '' : `<a href="#/mon-marche" class="inline-flex items-center gap-1.5 font-semibold text-vert-700">${ic('position', 'size-4')} Choisir mon point de départ</a>`}
    `)}

    <section class="carte p-4 lg:p-5">
      <p class="flex items-center gap-2 text-[1rem] font-semibold">${ic('plus', 'size-5 text-vert-600')} Les prix proposés par les utilisateurs</p>
      <div class="mt-2 space-y-3 text-[0.84rem] leading-relaxed text-gris">
        <p>Ils restent sur le téléphone de leur auteur et ne comptent jamais dans le calcul.</p>
        <p>Si un prix proposé s’écarte de <b class="font-semibold text-encre">plus de 50&nbsp;%</b> du dernier relevé du même marché,
          il est marqué <span class="pastille bg-ocre-pale py-0.5 text-ocre">écart important, à vérifier</span>.
          C’est souvent un zéro de trop, un autre contenant ou un autre produit. Le prix est quand même enregistré.</p>
        ${ref ? encadre(`<b class="font-semibold">Exemple : ${esc(refP.nom)} relevé à ${fcfa(ref)} au ${esc(refM.nom)}.</b>
          Un prix proposé au-dessus de ${fcfa(Math.round(ref * 1.5))} ou en dessous de ${fcfa(Math.round(ref * 0.5))} est signalé.`) : ''}
      </div>
    </section>
  </div>`;
}

/* --------------------------------------------------------------- mon marché */

/* Le même produit, deux points de départ, deux réponses : l'exemple qui explique l'écran. */
function exempleDepart() {
  for (const p of D.produits) {
    let oui = null, non = null;
    for (const m of D.marches) {
      const e = evaluerProduit(p, D.marches, MAINTENANT, D.meta, m.id).ecartUtile;
      if (!e.evaluable || e.general || e.surPlace) continue;
      if (e.vaut && !oui) oui = e;
      if (!e.vaut && !non) non = e;
    }
    if (oui && non) return { p, oui, non };
  }
  return null;
}

function cadreExemple() {
  const ex = exempleDepart();
  if (!ex) return '';
  const ligne = (e, vaut) => `<li class="flex items-start gap-3 rounded-2xl p-3 ${vaut ? 'bg-vert-50' : 'bg-fond'}">
      <span class="grid size-8 shrink-0 place-items-center rounded-full ${vaut ? 'bg-vert-500 text-encre' : 'bg-nav text-encre'}">${ic(vaut ? 'aller' : 'maison', 'size-4')}</span>
      <span class="text-[0.8rem] leading-snug">
        <b class="block font-semibold">Depuis le ${esc(e.depuis.nom)} : ${vaut ? 'ça vaut le déplacement' : 'ça ne vaut pas le déplacement'}</b>
        <span class="text-gris">${esc(fcfa(e.ecart))} d’écart avec le ${esc(e.marche.nom)}, pour ${esc(fcfa(e.seuil))} d’aller-retour.</span>
      </span>
    </li>`;
  return `<div class="carte p-4">
    <p class="flex items-center gap-2 text-[0.84rem] font-semibold">${ic('question', 'size-4 text-vert-600')} Pourquoi c’est important</p>
    <p class="mt-1 text-[0.8rem] leading-relaxed text-gris">${esc(ex.p.nom)}, mêmes prix relevés — la réponse change selon d’où vous partez :</p>
    <ul class="mt-3 space-y-2">${ligne(ex.oui, true)}${ligne(ex.non, false)}</ul>
  </div>`;
}

function rendreMonMarche(vue) {
  const depart = departMarche();
  vue.innerHTML = `
  <header class="bg-gradient-to-b from-vert-100 to-fond px-4 pb-2 ${HAUT} md:mx-auto md:mt-4 md:max-w-2xl md:rounded-hero md:px-6 md:pt-6">
    <div class="flex items-center gap-3">
      <a href="#/" class="bouton-rond" aria-label="Retour">${ic('retour')}</a>
      <h1 class="flex-1 text-center text-[1.1rem] font-semibold tracking-tight">Point de départ</h1>
      <span class="size-11 shrink-0"></span>
    </div>
  </header>
  <div class="space-y-5 px-4 pt-4 md:mx-auto md:max-w-2xl md:px-0">
    <div>
      <p class="text-[1.5rem] font-semibold leading-tight tracking-tight">D’où partez-vous pour faire vos courses ?</p>
      <p class="mt-2 text-[0.86rem] leading-relaxed text-gris">Choisissez le marché le plus proche de chez vous, ou celui où
        vous allez d’habitude. Zando Prix s’en sert pour une seule chose : calculer si aller dans un autre marché vous fait
        vraiment économiser, une fois le taxi aller-retour payé. Le choix reste sur ce téléphone.</p>
    </div>
    ${cadreExemple()}
    <button id="ma-position" type="button"
            class="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-vert-500 text-[0.95rem] font-semibold text-encre transition active:scale-[0.98] disabled:bg-gris-clair">
      ${ic('viseur')} Trouver le marché le plus proche de moi</button>
    <p id="msg-position" class="rounded-2xl bg-ocre-pale px-3.5 py-2.5 text-[0.8rem] font-semibold leading-relaxed text-ocre" hidden></p>
    <div>
      <p class="mb-3 text-center text-[0.76rem] font-medium text-gris-clair">ou choisissez-le vous-même</p>
      <div class="carte divide-y divide-trait px-3">
        ${D.marches.map(m => {
          const choisi = depart?.marche.id === m.id;
          const repere = choisi && depart.source === 'position' && depart.km != null ? ' · repéré ' + distanceLisible(depart.km) : '';
          return `<button type="button" data-marche="${esc(m.id)}" class="flex w-full items-center gap-3 py-3 text-left">
            ${tuileMarche(m)}
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[0.92rem] font-semibold">${esc(m.nom)}</span>
              <span class="mt-0.5 flex items-center gap-1 text-[0.72rem] text-gris-clair">${ic('position', 'size-3.5 text-vert-500')} ${esc(m.arrondissement + repere)}</span>
            </span>
            ${choisi ? `<span class="pastille bg-vert-500 text-encre">${ic('coche', 'size-3.5')} Choisi</span>` : ic('chevron', 'size-5 text-gris-clair')}
          </button>`;
        }).join('')}
      </div>
    </div>
    ${depart ? `<button id="oublier" type="button" class="w-full py-3 text-[0.84rem] font-semibold text-gris underline">Effacer mon choix</button>` : ''}
  </div>`;

  const choisir = (id, source = 'choix', km = null) => {
    definirMarcheDepart(id, source, km);
    evaluerTout();
    location.hash = '#/';
  };

  vue.querySelectorAll('[data-marche]').forEach(b => b.addEventListener('click', () => choisir(b.dataset.marche)));
  $('#oublier')?.addEventListener('click', () => { definirMarcheDepart(null); evaluerTout(); rendreMonMarche(vue); });

  /* La position n'est jamais demandée au chargement : l'utilisateur la déclenche. */
  $('#ma-position').addEventListener('click', async e => {
    const bouton = e.currentTarget, initial = bouton.innerHTML, msg = $('#msg-position');
    msg.hidden = true;
    bouton.disabled = true;
    bouton.textContent = 'Recherche de votre position précise…';
    try {
      const position = await obtenirPosition();
      positionSession = position;
      const proche = marcheLePlusProche(position, D.marches);
      if (!proche) throw new Error('loin');
      if (position.precision > PRECISION_SUFFISANTE) {
        bouton.disabled = false;
        bouton.innerHTML = initial;
        msg.textContent = `Votre position (${coordonnees(position)}) n’est connue qu’à ± ${metres(position.precision)} : ` +
          `trop imprécis pour choisir à votre place. Le plus proche serait le ${proche.marche.nom} — confirmez-le dans la liste ci-dessous.`;
        const aide = Object.assign(document.createElement('button'), { type: 'button', className: 'ml-1 underline', textContent: 'Comment l’améliorer ?' });
        aide.addEventListener('click', async () => { if (await ouvrirDialogue('appareil', position.precision)) $('#ma-position')?.click(); });
        msg.append(' ', aide);
        msg.hidden = false;
        return;
      }
      choisir(proche.marche.id, 'position', proche.km);
    } catch (err) {
      bouton.disabled = false;
      bouton.innerHTML = initial;
      if (err.message === 'gere') return;
      msg.textContent = MESSAGES[err.message] || MESSAGES.echec;
      msg.hidden = false;
    }
  });

  // message laissé par la carte d'invitation de l'accueil
  if (etat.messageDepart) {
    const msg = $('#msg-position');
    msg.textContent = etat.messageDepart;
    msg.hidden = false;
    etat.messageDepart = null;
  }
}

demarrer();
