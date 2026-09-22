'use strict';

/**
 * Carrousels horizontaux (« Vaut le déplacement », cartes des marchés).
 * Au doigt, le défilement natif suffit ; ce module ajoute la souris :
 * molette, glisser, et deux flèches.
 */

import { ic } from './html.js';

/* Flèches : visibles seulement avec une souris, et masquées quand le carrousel devient une grille. */
export function fleches(nom) {
  return `<span class="hidden items-center gap-1.5 pointer-fine:flex lg:hidden!" data-fleches="${nom}">
    <button type="button" data-sens="-1" class="bouton-rond size-9 disabled:opacity-35" aria-label="Précédent">${ic('chevron', 'size-4 rotate-180')}</button>
    <button type="button" data-sens="1" class="bouton-rond size-9 disabled:opacity-35" aria-label="Suivant">${ic('chevron', 'size-4')}</button>
  </span>`;
}

/**
 * Branche molette, glisser et flèches `fleches(nom)` sur le carrousel `el`.
 * Renvoie la fonction qui remet l'état des flèches à jour, à rappeler si le contenu change.
 */
export function activerDefilement(el, nom) {
  if (!el) return () => {};
  const boutons = [...document.querySelectorAll(`[data-fleches="${nom}"] button`)];
  const deborde = () => el.scrollWidth > el.clientWidth + 1;
  const maj = () => {
    for (const b of boutons) {
      const sens = Number(b.dataset.sens);
      b.disabled = !deborde() || (sens < 0 ? el.scrollLeft <= 1 : el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    }
  };

  boutons.forEach(b => b.addEventListener('click', () => {
    const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: cible(el, Number(b.dataset.sens)), behavior: reduit ? 'auto' : 'smooth' });
    setTimeout(maj, 450);   // l'événement scroll n'est pas garanti : on remet les flèches à jour nous-mêmes
  }));

  // molette verticale → défilement horizontal ; en butée, la page reprend la main
  el.addEventListener('wheel', e => {
    if (!deborde() || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const avant = el.scrollLeft;
    el.scrollLeft += e.deltaY;
    if (el.scrollLeft !== avant) e.preventDefault();
  }, { passive: false });

  glisserALaSouris(el, deborde);

  el.addEventListener('scroll', maj, { passive: true });
  maj();
  return maj;
}

/**
 * Position visée par une flèche : toujours le début d'une carte, jamais une distance
 * arbitraire — sinon l'aimantation ramène le carrousel là d'où il part.
 * Positions bornées entre 0 et la butée.
 */
function cible(el, sens) {
  const max = el.scrollWidth - el.clientWidth;
  const debut = el.getBoundingClientRect().left + (parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0);
  const positions = [...el.children].map(c =>
    Math.min(max, Math.max(0, Math.round(c.getBoundingClientRect().left - debut + el.scrollLeft))));
  const ici = el.scrollLeft;

  if (sens > 0) {
    // première carte coupée par le bord droit
    const droite = el.getBoundingClientRect().right;
    const i = [...el.children].findIndex(c => c.getBoundingClientRect().right > droite + 1);
    const visee = i < 0 ? max : positions[i];
    return visee > ici + 1 ? visee : (positions.find(x => x > ici + 1) ?? max);
  }
  // recul d'environ une demi-largeur
  const but = Math.max(0, ici - el.clientWidth / 2);
  const aRebours = [...positions].reverse();
  const visee = aRebours.find(x => x <= but + 1) ?? 0;
  return visee < ici - 1 ? visee : (aRebours.find(x => x < ici - 1) ?? 0);
}

/* Glisser à la souris, sans déclencher le lien de la carte relâchée. */
function glisserALaSouris(el, deborde) {
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
}
