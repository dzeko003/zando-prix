'use strict';

/**
 * Panier (/panier). On choisit les produits et les quantités sur le référentiel seul,
 * sans aucun prix ; les prix n'apparaissent qu'ensuite, en total par marché.
 */

import { fcfa } from '../regles.js';
import {
  lire as lirePanier, definir as definirPanier, quantite as quantitePanier,
  vider as viderPanier, compte as comptePanier, evaluerPanier
} from '../panier.js';
import { donnees, MAINTENANT, departMarche, produit } from '../etat.js';
import { $, esc, ic, pluriel } from '../html.js';
import { enTetePage, carteVerdict, lienCalcul, tuileMarche, vignetteProduit } from '../composants.js';
import { majPastillePanier } from '../navigation.js';
import { definirDepuisPosition } from '../position.js';

export function rendrePanier(vue) {
  const depart = departMarche();
  const plein = comptePanier().articles > 0;

  vue.innerHTML = `
  ${enTetePage({
    titre: 'Mon panier',
    action: `<button type="button" id="vider-panier" class="bouton-rond" aria-label="Vider le panier" ${plein ? '' : 'hidden'}>${ic('croix')}</button>
      <span class="size-11 shrink-0 ${plein ? 'hidden' : ''}"></span>`,
    sousTitre: '<p id="resume-panier" class="mx-auto mt-4 max-w-[36ch] text-center text-[0.8rem] leading-relaxed text-gris"></p>',
    classe: 'lg:max-w-5xl'
  })}
  <div class="flex flex-col gap-6 px-4 pb-4 md:mx-auto md:max-w-2xl md:px-0 lg:grid lg:max-w-5xl lg:grid-cols-12 lg:items-start lg:gap-8">
    <!-- Sur grand écran, le verdict tient la colonne de gauche et suit le défilement :
         il se met à jour sous les yeux pendant qu'on choisit. Sur téléphone, il reste
         après la liste — sinon il sortirait de l'écran au premier ajout. -->
    <div id="resultats-panier" class="order-2 space-y-6 lg:sticky lg:top-24 lg:order-1 lg:col-span-5"></div>
    <div class="order-1 space-y-6 lg:order-2 lg:col-span-7">
      ${blocDepart(depart)}
      ${choixProduits()}
    </div>
  </div>`;

  majResultats(depart);

  $('#vider-panier').addEventListener('click', () => { viderPanier(); rendrePanier(vue); });
  $('#position-panier')?.addEventListener('click', e => definirDepuisPosition(e.currentTarget));

  // boutons + et − de chaque produit
  $('#choix-produits').addEventListener('click', e => {
    const b = e.target.closest('[data-produit][data-pas]');
    if (!b) return;
    const id = b.dataset.produit;
    if (definirPanier(id, quantitePanier(id) + Number(b.dataset.pas)) === null) return;  // stockage bloqué
    $(`[data-ligne="${CSS.escape(id)}"] [data-controle]`, vue).innerHTML = controleQuantite(produit(id));
    majResultats(depart);
  });
}

/* Le panier a changé : on ne recalcule que le résumé, le verdict et les totaux. */
function majResultats(depart) {
  const { lignes, articles } = comptePanier();
  const r = evaluerPanier(lirePanier(), donnees.produits, donnees.marches, MAINTENANT, donnees.meta, depart ? depart.marche.id : null);
  $('#resultats-panier').innerHTML = `${verdictPanier(r, depart)}
    ${r.complets.length ? classement(r) : ''}
    ${r.articles.length && r.incomplets.length ? marchesEcartes(r) : ''}`;
  $('#resume-panier').textContent = articles
    ? `${pluriel(lignes, 'produit')} · ${pluriel(articles, 'article')} · prix annoncés avant marchandage`
    : 'Choisissez des produits et leurs quantités : Zando Prix dira dans quel marché le panier revient le moins cher.';
  const vider = $('#vider-panier');
  if (vider) vider.hidden = articles === 0;
  majPastillePanier();
}

/* ---------------------------------------------------------- point de départ */

/* D'où l'utilisateur part : sans cette réponse, aucune économie nette n'est calculable. */
function blocDepart(depart) {
  if (depart) {
    return `<p class="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[0.8rem] text-gris">
      ${ic('position', 'size-4 text-vert-600')} Départ : <b class="font-semibold text-encre">${esc(depart.marche.nom)}</b>
      <a href="/mon-marche" class="font-semibold text-vert-700 hover:underline">changer</a></p>`;
  }
  return `<div class="carte flex flex-col gap-3.5 p-4 sm:flex-row sm:items-center">
    <span class="grid size-11 shrink-0 place-items-center rounded-full bg-vert-500 text-encre">${ic('viseur')}</span>
    <div class="min-w-0 flex-1">
      <p class="text-[0.95rem] font-semibold leading-snug">D’où partez-vous ?</p>
      <p class="mt-1 text-[0.79rem] leading-relaxed text-gris">Sans point de départ, l’application ne peut pas déduire le prix du taxi de l’économie.</p>
    </div>
    <div class="flex flex-wrap items-center gap-2 sm:shrink-0">
      <button type="button" id="position-panier" class="h-11 rounded-full bg-vert-500 px-4 text-[0.86rem] font-semibold text-encre disabled:opacity-60">Utiliser ma position</button>
      <a href="/mon-marche" class="inline-flex h-11 items-center rounded-full bg-nav px-4 text-[0.84rem] font-semibold">Choisir moi-même</a>
    </div>
  </div>`;
}

/* ------------------------------------------------------- choix des produits */

function choixProduits() {
  return `<section>
    <div class="mb-3 flex items-end justify-between">
      <h2 class="titre-section">Choisir mes produits</h2>
      <span class="voir-tout">quantité à l’unité de référence</span>
    </div>
    <div id="choix-produits" class="carte divide-y divide-trait px-3">
      ${donnees.produits.map(p => `<div class="flex items-center gap-2.5 py-2.5" data-ligne="${esc(p.id)}">
        ${vignetteProduit(p)}
        <div class="min-w-0 flex-1">
          <p class="truncate text-[0.88rem] font-semibold">${esc(p.nom)}</p>
          <p class="mt-0.5 truncate text-[0.71rem] text-gris">${esc(p.unite_reference)}</p>
        </div>
        <span data-controle>${controleQuantite(p)}</span>
      </div>`).join('')}
    </div>
    <p class="mt-3 px-1 text-[0.74rem] leading-relaxed text-gris">
      Les quantités portent sur l’unité de référence de chaque produit — 4 = quatre sacs de 25 kg.
      Aucun prix au kilo, aucune conversion.</p>
  </section>`;
}

/* « + » seul tant que le produit n'est pas dans le panier, puis « − quantité + ». */
function controleQuantite(p) {
  const q = quantitePanier(p.id);
  if (!q) {
    return `<button type="button" data-produit="${esc(p.id)}" data-pas="1" aria-label="Ajouter ${esc(p.nom)} au panier"
      class="grid size-11 shrink-0 place-items-center rounded-full bg-nav text-encre transition active:scale-95">${ic('plus')}</button>`;
  }
  return `<div class="flex shrink-0 items-center gap-1 rounded-full bg-nav p-1">
      <button type="button" data-produit="${esc(p.id)}" data-pas="-1" aria-label="Retirer une unité de ${esc(p.nom)}"
              class="grid size-9 place-items-center rounded-full bg-white text-encre transition active:scale-95">${ic('moins', 'size-4')}</button>
      <span class="min-w-7 text-center text-[0.9rem] font-semibold tabular-nums">${q}</span>
      <button type="button" data-produit="${esc(p.id)}" data-pas="1" aria-label="Ajouter une unité de ${esc(p.nom)}"
              class="grid size-9 place-items-center rounded-full bg-white text-encre transition active:scale-95">${ic('plus', 'size-4')}</button>
    </div>`;
}

/* ---------------------------------------------------------------- résultats */

/*
 * Le verdict du panier reprend R4 : un déplacement n'est recommandé que si l'économie
 * dépasse le prix de l'aller-retour. Sans point de départ, on constate sans recommander.
 * Une entrée par type de verdict renvoyé par evaluerPanier.
 */
const ALERTE = { icone: 'alerte', pastille: 'bg-ocre-pale text-ocre' };
const VERDICTS = {
  'vide': () => ({
    icone: 'panier', pastille: 'bg-nav text-gris', chapeau: 'Panier vide',
    titre: 'Choisissez vos produits ci-dessus',
    note: 'Dès le premier produit, Zando Prix compare le total sur les quatre marchés et dit lequel vaut le déplacement.'
  }),
  'aucun-complet': () => ({
    ...ALERTE, chapeau: 'Comparaison impossible',
    titre: 'Aucun marché ne fournit tout le panier',
    note: 'Dans chaque marché, au moins un produit du panier n’a pas de prix utilisable. Retirez-le pour pouvoir comparer.'
  }),
  'depart-incomplet': (v, depart) => ({
    ...ALERTE, chapeau: 'Comparaison impossible depuis votre marché',
    titre: `Le panier entier n’est pas relevé au ${esc(depart.marche.nom)}`,
    note: `Impossible de dire ce que vous économiseriez en bougeant. Le total le plus bas est de ${fcfa(v.meilleur.total)} au ${esc(v.meilleur.marche.nom)}.`
  }),
  'classement': v => ({
    icone: 'etiquette', pastille: 'bg-ocre-pale text-ocre', chapeau: 'Total le plus bas',
    titre: `${fcfa(v.meilleur.total)} au ${esc(v.meilleur.marche.nom)}`,
    note: 'Indiquez votre point de départ : le prix de l’aller-retour se déduit de l’économie, et le verdict change selon le marché d’où vous partez.'
  }),
  'sur-place': v => ({
    icone: 'maison', pastille: 'bg-vert-500 text-encre', chapeau: 'Verdict', positif: true,
    titre: 'C’est ici le moins cher',
    note: `Le panier coûte ${fcfa(v.meilleur.total)} au ${esc(v.meilleur.marche.nom)} : aucun autre marché ne fait mieux sur ce panier.`
  }),
  'vaut': v => ({
    icone: 'aller', pastille: 'bg-vert-500 text-encre', chapeau: 'Verdict', positif: true,
    titre: `Allez au ${esc(v.meilleur.marche.nom)}`,
    note: `${fcfa(v.mien.total)} au ${esc(v.mien.marche.nom)} contre ${fcfa(v.meilleur.total)} là-bas : ${fcfa(v.ecart)} d’écart, moins ${fcfa(v.trajet)} d’aller-retour. Vous gagnez ${fcfa(v.net)}.`
  }),
  'ne-vaut-pas': v => ({
    icone: 'maison', pastille: 'bg-nav text-encre', chapeau: 'Verdict',
    titre: `Restez au ${esc(v.mien.marche.nom)}`,
    note: `Le panier est moins cher de ${fcfa(v.ecart)} au ${esc(v.meilleur.marche.nom)}, mais l’aller-retour coûte ${fcfa(v.trajet)} : le déplacement ${v.net === 0 ? 'ne vous rapporterait rien' : `vous coûterait ${fcfa(-v.net)}`}.`
  })
};

function verdictPanier(r, depart) {
  const contenu = VERDICTS[r.verdict.type](r.verdict, depart);
  const pied = `${r.aVerifier ? `<p class="mt-1.5 text-[0.76rem] font-medium leading-relaxed text-ocre">Certains prix de ce panier ont plus de 7 jours : à vérifier sur place.</p>` : ''}
      <p class="mt-2.5">${lienCalcul}</p>`;
  return carteVerdict(contenu, pied);
}

function classement(r) {
  const meilleur = r.complets[0];
  return `<section>
    <div class="mb-3 flex items-end justify-between">
      <h2 class="titre-section">Le panier marché par marché</h2>
      <span class="voir-tout">${pluriel(r.complets.length, 'marché')} sur ${donnees.marches.length}</span>
    </div>
    <div class="carte divide-y divide-trait px-3">
      ${r.complets.map((c, i) => `<div class="flex items-center gap-3 py-3">
        ${tuileMarche(c.marche)}
        <div class="min-w-0 flex-1">
          <p class="truncate text-[0.9rem] font-semibold">${esc(c.marche.nom)}</p>
          <p class="mt-0.5 truncate text-[0.72rem] text-gris">${i === 0
            ? 'le panier le moins cher'
            : `+ ${fcfa(c.total - meilleur.total)} par rapport au ${esc(meilleur.marche.nom_court || meilleur.marche.nom)}`}${
            c.aVerifier ? ` · ${c.aVerifier} prix à vérifier` : ''}</p>
        </div>
        <span class="shrink-0 whitespace-nowrap text-[0.92rem] font-semibold tabular-nums ${i === 0 ? 'rounded-full bg-vert-500 px-2.5 py-1 text-encre' : ''}">${fcfa(c.total)}</span>
      </div>`).join('')}
    </div>
    <p class="mt-3 px-1 text-[0.74rem] leading-relaxed text-gris">
      Totaux des prix annoncés, avant marchandage, relevés sur place.</p>
  </section>`;
}

function marchesEcartes(r) {
  return `<section>
    <h2 class="titre-section mb-3">Marchés écartés</h2>
    <div class="carte divide-y divide-trait px-3">
      ${r.incomplets.map(i => `<div class="py-3">
        <p class="text-[0.88rem] font-semibold">${esc(i.marche.nom)}</p>
        <p class="mt-0.5 text-[0.74rem] leading-relaxed text-gris">${i.manquants.map(m => `${esc(m.produit.nom)} — ${esc(m.raison)}`).join(' · ')}</p>
      </div>`).join('')}
    </div>
    <p class="mt-3 px-1 text-[0.74rem] leading-relaxed text-gris">
      Un marché qui ne peut pas fournir tout le panier n’est pas classé : son total serait celui d’un panier plus petit.</p>
  </section>`;
}
