'use strict';

/** Mes prix proposés (/mes-prix) : les contributions de l'utilisateur, les plus récentes d'abord. */

import { lire as lireContributions } from '../contributions.js';
import { ic } from '../html.js';
import { enTetePage, ligneContribution } from '../composants.js';

export function rendreMesPrix(vue) {
  const liste = lireContributions().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  vue.innerHTML = `
  ${enTetePage({
    titre: 'Mes prix proposés',
    sousTitre: `<p class="mx-auto mt-4 max-w-[34ch] text-center text-[0.8rem] leading-relaxed text-gris">
      Proposés par vous, non vérifiés. Conservés sur ce téléphone et jamais transmis.</p>`
  })}
  <div class="px-4 md:mx-auto md:max-w-2xl md:px-0">
    ${liste.length
      ? `<div class="carte divide-y divide-trait px-3">${liste.map(c =>
          `<a href="/produit/${encodeURIComponent(c.produit)}" class="block">${ligneContribution(c, true)}</a>`).join('')}</div>`
      : `<div class="carte p-6 text-center">
           <span class="mx-auto grid size-14 place-items-center rounded-full bg-vert-100 text-vert-700">${ic('liste', 'size-6')}</span>
           <p class="mt-4 text-[0.98rem] font-semibold">Aucun prix proposé pour l’instant</p>
           <p class="mt-1.5 text-[0.82rem] leading-relaxed text-gris">Ouvrez un produit et notez le prix que vous venez de voir au marché.</p>
           <a href="/" class="mt-5 inline-flex h-12 items-center rounded-full bg-vert-500 px-6 text-[0.9rem] font-semibold text-encre">Voir les produits</a>
         </div>`}
  </div>`;
}
