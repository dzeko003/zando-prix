'use strict';

/**
 * Position de l'appareil, côté interface : expliquer avant de demander,
 * aider quand c'est refusé ou imprécis, puis trouver le marché le plus proche.
 * La position n'est jamais demandée au chargement : c'est l'utilisateur qui la déclenche.
 */

import { localiser, marcheLePlusProche, MESSAGES, etatPermission, consignesActivation } from './geo.js';
import { donnees, changerDepart, laisserMessageDepart } from './etat.js';
import { naviguer, redessiner } from './navigation.js';
import { esc, ic, metres } from './html.js';

/** Au-delà de ± 500 m, on risque de se tromper de marché : on ne choisit pas à la place de l'utilisateur. */
export const PRECISION_SUFFISANTE = 500;

/* Dernière position obtenue : en mémoire le temps de la session, jamais enregistrée. */
let positionSession = null;
export const dernierePosition = () => positionSession;

/**
 * Localise l'appareil et cherche le marché le plus proche.
 * Renvoie { position, proche, precise } — `proche` est null si l'on est loin de tout marché.
 * Lève Error('gere') quand une fenêtre a déjà expliqué le problème, ou un code de MESSAGES.
 */
export async function localiserMarcheProche() {
  const position = await obtenirPosition();
  positionSession = position;
  const proche = marcheLePlusProche(position, donnees.marches);
  return { position, proche, precise: !!proche && position.precision <= PRECISION_SUFFISANTE };
}

/** Texte à afficher pour une erreur levée par `localiserMarcheProche`, ou null si déjà gérée. */
export const messageErreur = err => (err.message === 'gere' ? null : MESSAGES[err.message] || MESSAGES.echec);

/**
 * Bouton « Utiliser ma position » de l'accueil et du panier : si la position est fiable,
 * le marché le plus proche devient le point de départ ; sinon, l'écran « Point de départ »
 * s'ouvre avec une explication.
 */
export async function definirDepuisPosition(bouton) {
  bouton.disabled = true;
  try {
    const { position, proche, precise } = await localiserMarcheProche();
    if (precise) {
      changerDepart(proche.marche.id, 'position', proche.km);
      redessiner();
      return;
    }
    laisserMessageDepart(proche
      ? `Votre position n’est connue qu’à ± ${metres(position.precision)} : trop imprécis pour choisir à votre place. ` +
        `Le plus proche serait le ${proche.marche.nom} — confirmez-le ci-dessous.`
      : MESSAGES.loin);
    naviguer('/mon-marche');
  } catch (err) {
    bouton.disabled = false;
    const texte = messageErreur(err);
    if (texte) { laisserMessageDepart(texte); naviguer('/mon-marche'); }
  }
}

/** Bouton « Comment l’améliorer ? » à accrocher derrière un message de position imprécise. */
export function boutonAmeliorer(precision, reessayer) {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'ml-1 underline', textContent: 'Comment l’améliorer ?' });
  b.addEventListener('click', async () => { if (await ouvrirDialogue('appareil', precision)) reessayer(); });
  return b;
}

/**
 * Demander la position comme une application : on explique d'abord, puis le navigateur
 * affiche sa propre demande. En cas de refus ou d'appareil muet, la fenêtre montre quoi faire.
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

/* ------------------------------------------------------ fenêtre d'explication */

let dialogue = null;

/**
 * Fenêtre d'explication autour de la demande de position.
 *   demande  — avant la demande du navigateur : pourquoi, et quoi répondre
 *   bloquee  — refus enregistré : une page web ne peut pas redemander, on montre où réactiver
 *   appareil — autorisée, mais l'appareil ne donne pas de position fiable
 * Résout `true` si l'utilisateur veut continuer ou réessayer.
 */
export function ouvrirDialogue(mode, precision = null) {
  if (!dialogue) {
    dialogue = document.createElement('dialog');
    dialogue.className = 'm-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-hero bg-white p-0 text-encre ' +
      'shadow-nav backdrop:bg-foret/55 sm:m-auto sm:max-w-md sm:rounded-hero';
    document.body.append(dialogue);
  }
  const v = contenuDialogue(mode, precision);
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
      if (choix === 'secondaire' && mode !== 'demande') naviguer('/mon-marche');
      resoudre(choix === 'principal');
    }, { once: true });
    dialogue.returnValue = '';
    dialogue.showModal();
  });
}

function contenuDialogue(mode, precision) {
  const c = consignesActivation();
  const etapes = liste => `<ol class="mt-4 space-y-3">${liste.map((texte, i) => `<li class="flex gap-3 text-[0.85rem] leading-snug">
      <span class="grid size-6 shrink-0 place-items-center rounded-full bg-vert-100 text-[0.72rem] font-bold text-vert-700">${i + 1}</span>
      <span>${esc(texte)}</span></li>`).join('')}</ol>`;

  if (mode === 'demande') {
    return {
      icone: 'viseur', teinte: 'bg-vert-500 text-encre', titre: 'Autoriser votre position ?',
      corps: `<p class="mt-2 text-[0.88rem] leading-relaxed text-gris">Zando Prix s’en sert pour trouver le marché le plus proche de vous
          et vous situer sur la carte. Votre position reste sur votre téléphone : elle n’est ni enregistrée ni envoyée.</p>
        <p class="mt-4 flex items-start gap-2 rounded-2xl bg-vert-50 p-3 text-[0.82rem] leading-snug text-vert-700">
          ${ic('question', 'mt-0.5 size-4 shrink-0')} Votre navigateur va ensuite vous demander l’autorisation : choisissez « Autoriser ».</p>`,
      principal: 'Continuer', secondaire: 'Pas maintenant'
    };
  }
  if (mode === 'bloquee') {
    return {
      icone: 'alerte', teinte: 'bg-ocre-pale text-ocre', titre: 'La localisation est bloquée',
      corps: `<p class="mt-2 text-[0.88rem] leading-relaxed text-gris">Elle a été refusée pour Zando Prix, et un site ne peut pas
          la réactiver lui-même. Voici comment faire — ${esc(c.plateforme)} :</p>${etapes(c.site)}`,
      principal: 'J’ai autorisé, réessayer', secondaire: 'Choisir mon marché moi-même'
    };
  }
  return {   // appareil
    icone: 'viseur', teinte: 'bg-ocre-pale text-ocre',
    titre: precision ? `Position approximative, à ± ${metres(precision)}` : 'Position introuvable',
    corps: `<p class="mt-2 text-[0.88rem] leading-relaxed text-gris">${precision
        ? 'Votre appareil ne donne qu’une position estimée depuis le réseau, pas celle du GPS.'
        : 'L’autorisation est donnée, mais votre appareil ne fournit pas de position.'} Activez sa localisation :</p>${etapes(c.systeme)}`,
    principal: 'Réessayer', secondaire: 'Choisir mon marché moi-même'
  };
}
