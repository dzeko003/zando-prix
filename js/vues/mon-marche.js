'use strict';

/**
 * Point de départ (/mon-marche) : le marché d'où part l'utilisateur, choisi dans
 * la liste ou déduit de la position. Sans lui, aucune économie nette n'est calculable.
 */

import { evaluerProduit, fcfa } from '../regles.js';
import { distanceLisible } from '../geo.js';
import { donnees, MAINTENANT, departMarche, changerDepart, prendreMessageDepart } from '../etat.js';
import { naviguer, redessiner } from '../navigation.js';
import { $, esc, ic, metres, coordonnees } from '../html.js';
import { enTetePage, tuileMarche } from '../composants.js';
import { localiserMarcheProche, messageErreur, boutonAmeliorer } from '../position.js';

export function rendreMonMarche(vue) {
  const depart = departMarche();
  vue.innerHTML = `
  ${enTetePage({ titre: 'Point de départ' })}
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
        ${donnees.marches.map(m => choixMarche(m, depart)).join('')}
      </div>
    </div>
    ${depart ? `<button id="oublier" type="button" class="w-full py-3 text-[0.84rem] font-semibold text-gris underline">Effacer mon choix</button>` : ''}
  </div>`;

  const choisir = (id, source = 'choix', km = null) => {
    changerDepart(id, source, km);
    naviguer('/');
  };

  vue.querySelectorAll('[data-marche]').forEach(b => b.addEventListener('click', () => choisir(b.dataset.marche)));
  $('#oublier')?.addEventListener('click', () => { changerDepart(null); redessiner(); });
  $('#ma-position').addEventListener('click', e => chercherLePlusProche(e.currentTarget, choisir));

  // message laissé par un autre écran (invitation de l'accueil, panier)
  const laisse = prendreMessageDepart();
  if (laisse) afficherMessage(laisse);
}

function choixMarche(m, depart) {
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
}

function afficherMessage(texte, bouton = null) {
  const msg = $('#msg-position');
  msg.textContent = texte;
  if (bouton) msg.append(' ', bouton);
  msg.hidden = false;
}

/* Bouton « Trouver le marché le plus proche » : position fiable → choix direct ; sinon, on explique. */
async function chercherLePlusProche(bouton, choisir) {
  const initial = bouton.innerHTML;
  const retablir = () => { bouton.disabled = false; bouton.innerHTML = initial; };
  $('#msg-position').hidden = true;
  bouton.disabled = true;
  bouton.textContent = 'Recherche de votre position précise…';
  try {
    const { position, proche, precise } = await localiserMarcheProche();
    if (!proche) throw new Error('loin');
    if (precise) { choisir(proche.marche.id, 'position', proche.km); return; }
    retablir();
    afficherMessage(`Votre position (${coordonnees(position)}) n’est connue qu’à ± ${metres(position.precision)} : ` +
      `trop imprécis pour choisir à votre place. Le plus proche serait le ${proche.marche.nom} — confirmez-le dans la liste ci-dessous.`,
      boutonAmeliorer(position.precision, () => $('#ma-position')?.click()));
  } catch (err) {
    retablir();
    const texte = messageErreur(err);
    if (texte) afficherMessage(texte);
  }
}

/* ------------------------------------------------------------------ exemple */

/* Le même produit, deux points de départ, deux réponses : l'exemple qui explique l'écran. */
function exempleDepart() {
  for (const p of donnees.produits) {
    let oui = null, non = null;
    for (const m of donnees.marches) {
      const e = evaluerProduit(p, donnees.marches, MAINTENANT, donnees.meta, m.id).ecartUtile;
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
