'use strict';

/**
 * Fiche produit (/produit/:id) : verdict, prix par marché, prix proposés
 * par l'utilisateur et formulaire pour en proposer un.
 */

import { fcfa } from '../regles.js';
import { distanceKm, distanceLisible } from '../geo.js';
import { valider, ajouter, pourProduit } from '../contributions.js';
import { donnees, MAINTENANT, evaluation, departMarche, marche } from '../etat.js';
import { $, esc, ic, nombre, iso, auUnite } from '../html.js';
import { HAUT, carteVerdict, lienCalcul, tuileMarche, ligneContribution } from '../composants.js';

/** `message` : confirmation ou erreur à afficher sous le formulaire, { type: 'ok' | 'erreur', texte }. */
export function rendreProduit(vue, p, message = null) {
  const ev = evaluation(p.id);
  const depart = departMarche();

  vue.innerHTML = `
  <div class="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8 lg:pt-4">
  <section class="relative h-72 overflow-hidden rounded-b-hero bg-foret text-white md:mt-4 md:h-96 md:rounded-hero lg:sticky lg:top-24 lg:col-span-5 lg:mt-0 lg:h-[min(640px,calc(100dvh-8rem))]">
    <img src="/images/produits/${p.id}.webp" alt="${esc(p.nom)}" fetchpriority="high" decoding="async" class="absolute inset-0 size-full object-cover">
    <span class="absolute inset-0 bg-gradient-to-b from-foret/55 via-foret/15 to-foret/95"></span>
    <div class="relative flex h-full flex-col px-4 pb-5 ${HAUT} md:p-6 lg:p-8">
      <div class="flex items-center justify-between">
        <a href="/" class="bouton-rond" aria-label="Retour à tous les prix">${ic('retour')}</a>
        <a href="/carte/${encodeURIComponent(p.id)}" class="bouton-rond" aria-label="Voir ce produit sur la carte">${ic('carte')}</a>
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
    ${verdictProduit(ev.ecartUtile, depart)}
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

  brancherFormulaire(vue, p);
  if (message) afficherMessage(message);
}

/* ------------------------------------------------------------------ verdict */

function verdictProduit(e, depart) {
  const preciser = !depart && e.evaluable
    ? `<a href="/mon-marche" class="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-vert-700">${ic('position', 'size-4')} Choisir mon point de départ</a>`
    : '';
  const liens = `<div class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">${preciser}
      ${lienCalcul}
    </div>`;
  return carteVerdict(contenuVerdict(e), liens);
}

/* R4 appliquée au produit : que dire à l'utilisateur ? */
function contenuVerdict(e) {
  if (!e.evaluable) {
    return {
      icone: 'question', pastille: 'bg-nav text-gris', chapeau: 'Écart non évaluable',
      titre: 'Pas assez de relevés récents',
      note: 'Moins de trois marchés ont un relevé de moins de 7 jours pour ce produit.'
    };
  }
  if (e.surPlace) {
    return {
      icone: 'maison', pastille: 'bg-vert-500 text-encre', chapeau: 'Verdict', positif: true,
      titre: 'C’est ici le moins cher',
      note: `Aucun autre marché relevé n’est moins cher que le ${esc(e.depuis.nom)}. Inutile de bouger.`
    };
  }
  if (e.vaut && !e.depuis) {
    // Sans point de départ, l'écart mesuré est celui du marché le plus cher : conclure
    // « ça vaut le déplacement » serait faux pour qui part déjà d'un marché bon marché.
    // On constate l'écart, on ne recommande rien.
    return {
      icone: 'etiquette', pastille: 'bg-ocre-pale text-ocre', chapeau: 'Écart constaté',
      titre: `${fcfa(e.ecart)} d’écart entre les marchés`,
      note: `Le moins cher est au ${esc(e.marche.nom)}. L’aller-retour coûte au moins ${fcfa(e.seuil)} : indiquez votre point de départ pour savoir si le déplacement vaut le coup.`
    };
  }
  const chiffres = e.depuis
    ? `Écart de ${fcfa(e.ecart)} depuis le ${e.depuis.nom} · aller-retour vers le ${e.marche.nom} : ${fcfa(e.seuil)}`
    : `Écart entre marchés de ${fcfa(e.ecart)} · aller-retour estimé à ${fcfa(e.seuil)}`;
  return e.vaut
    ? { icone: 'aller', pastille: 'bg-vert-500 text-encre', chapeau: 'Verdict', positif: true,
        titre: 'Ça vaut le déplacement', note: `${esc(chiffres)}.` }
    : { icone: 'maison', pastille: 'bg-nav text-encre', chapeau: 'Verdict',
        titre: 'Ça ne vaut pas le déplacement', note: `${esc(chiffres)}. Restez dans votre marché.` };
}

/* ---------------------------------------------------------- prix par marché */

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

/* --------------------------------------------------------- prix proposés */

/* US-08 — zone distincte, hors tri, hors badge, hors écart utile. */
function zoneContributions(p) {
  const liste = pourProduit(p.id);
  if (!liste.length) return '';
  return `<section>
    <h2 class="titre-section">Proposé par un utilisateur, non vérifié</h2>
    <p class="mb-3 mt-1 text-[0.74rem] leading-relaxed text-gris">Ces prix n’entrent ni dans le tri, ni dans le badge, ni dans le calcul du déplacement.
      <a href="/calcul" class="font-semibold text-vert-700 hover:underline">Pourquoi « écart important » ?</a></p>
    <div class="carte divide-y divide-dashed divide-trait px-3">${liste.map(c => ligneContribution(c)).join('')}</div>
  </section>`;
}

/* US-07 — proposer un prix, sans compte, en moins de 30 secondes. */
function formulaire(p) {
  const options = donnees.marches.map(m => `<option value="${esc(m.id)}">${esc(m.nom)}</option>`).join('');
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

function afficherMessage({ type, texte }) {
  const el = $('#msg-prix');
  if (!el) return;
  el.classList.remove('bg-vert-100', 'text-vert-700', 'bg-ocre-pale', 'text-ocre');
  el.classList.add(...(type === 'ok' ? ['bg-vert-100', 'text-vert-700'] : ['bg-ocre-pale', 'text-ocre']));
  el.textContent = texte;
  el.hidden = false;
}

function brancherFormulaire(vue, p) {
  $('#form-prix').addEventListener('submit', e => {
    e.preventDefault();
    const idMarche = $('#f-marche').value;
    const v = valider(idMarche, $('#f-prix').value);
    if (!v.ok) { afficherMessage({ type: 'erreur', texte: v.message }); return; }   // rien n'est enregistré

    // R7 : la contribution est comparée au dernier relevé du même marché
    const ligne = evaluation(p.id).lignes.find(l => l.marche.id === idMarche);
    const reference = ligne && ligne.statut === 'releve' ? ligne.prix : null;
    const c = ajouter({ produit: p.id, marche: idMarche, prix: v.prix, unite: p.unite_reference, date: iso(MAINTENANT), reference });
    if (!c) { afficherMessage({ type: 'erreur', texte: 'Impossible d’enregistrer sur cet appareil.' }); return; }

    const confirmation = {
      type: 'ok',
      texte: `Enregistré : ${fcfa(c.prix)} au ${marche(idMarche).nom}, pour ${p.unite_reference}. ` +
             'Conservé sur votre téléphone, il n’est pas transmis.' +
             (c.ecart_important ? ' Écart important avec le dernier relevé, à vérifier.' : '')
    };
    // on redessine pour montrer la contribution, sans perdre la position de lecture
    const y = window.scrollY;
    rendreProduit(vue, p, confirmation);
    window.scrollTo(0, y);
    $('#msg-prix')?.scrollIntoView({ block: 'nearest' });
  });
}
