'use strict';

/**
 * Comment on calcule (/calcul). R4, R5, R6, R7 et le protocole des 40 %, expliqués
 * avec les chiffres du fichier en cours : quand le PM remplace les prix ou les trajets,
 * les exemples suivent.
 */

import { evaluerProduit, fcfa } from '../regles.js';
import { donnees, MAINTENANT, evaluation, departMarche, marche } from '../etat.js';
import { esc, ic, nombre, pluriel } from '../html.js';
import { enTetePage } from '../composants.js';

export function rendreCalcul(vue) {
  const seuil = donnees.meta.seuil_deplacement_fcfa;
  const sansVerdict = donnees.produits.filter(p => !evaluation(p.id)?.ecartUtile.evaluable).length;

  vue.innerHTML = `
  ${enTetePage({ titre: 'Comment on calcule' })}
  <div class="space-y-4 px-4 pb-8 pt-4 md:mx-auto md:max-w-2xl md:px-0">
    <div>
      <p class="text-[1.5rem] font-semibold leading-tight tracking-tight">Est-ce que ça vaut le taxi ?</p>
      <p class="mt-2 text-[0.86rem] leading-relaxed text-gris">Zando Prix compare deux montants : ce que vous économisez en achetant
        dans un autre marché, et ce que coûte le taxi aller-retour pour y aller. Si l’économie est plus grande que le taxi,
        ça vaut le déplacement.</p>
    </div>

    ${blocTaxi(seuil)}

    ${etape(1, 'Garder seulement les prix fiables', `
      ${regle('a', 'horloge', 'Relevé il y a moins de 7 jours',
        `<p>De 7 à 14 jours, le prix est affiché « à vérifier » ; au-delà de 14 jours, il est barré. Il reste visible, mais il
         ne sert pas au calcul : il a pu changer, et un taxi payé pour rien coûte au moins ${fcfa(seuil)}.</p>`)}
      ${regle('b', 'alerte', 'Pas un « prix instable »',
        `<p>Dans chaque marché, le binôme note le prix de 3 étals et retient celui du milieu. Si deux étals s’écartent de
         <b class="font-semibold text-encre">plus de 40&nbsp;%</b>, il en visite 2 de plus. Si l’écart persiste, le marché est marqué
         « prix instable » : on ne connaît pas « le » prix de ce marché. L’app affiche la fourchette, mais ne s’en sert pas
         pour comparer.</p>${exempleInstable()}`)}
      ${regle('c', 'marche', 'Au moins 3 marchés sur 4',
        `<p>Avec moins de 3 prix fiables, le moins cher trouvé n’est peut-être pas le vrai moins cher : un marché sans prix
         fiable pourrait l’être encore plus. L’app n’affiche alors aucun verdict, seulement « Pas assez de relevés récents ».</p>
         ${sansVerdict ? `<p>Aujourd’hui : ${pluriel(sansVerdict, 'produit')} sur ${donnees.produits.length} dans ce cas.</p>` : ''}`)}
    `)}

    ${etape(2, 'Trouver le marché le moins cher', `<p>Parmi les prix gardés, le plus bas porte la mention
      <span class="whitespace-nowrap rounded-full bg-vert-500 px-2 py-0.5 text-[0.76rem] font-bold text-encre">le moins cher relevé</span>.
      En cas d’égalité, aucun marché ne la reçoit.</p>`)}

    ${etape(3, 'Comparer l’économie au taxi', `
      ${encadre(`<b class="block font-semibold">Économie = prix dans votre marché − prix le moins cher</b>
        Ça vaut le déplacement si l’économie est <b class="font-semibold">plus grande</b> que le taxi aller-retour.
        À égalité, non : vous auriez traversé la ville pour rien.`)}
      ${exempleDeparts()}
      ${departMarche() ? '' : `<a href="/mon-marche" class="inline-flex items-center gap-1.5 font-semibold text-vert-700">${ic('position', 'size-4')} Choisir mon point de départ</a>`}
    `)}

    ${blocContributions()}
  </div>`;
}

/* ---------------------------------------------------------------- gabarits */

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

/* Une ligne « depuis tel marché : ça vaut / ça ne vaut pas le déplacement ». */
const ligneVerdict = (vaut, titre, detail) => `<li class="flex items-start gap-3 rounded-2xl p-3 ${vaut ? 'bg-vert-50' : 'bg-fond'}">
      <span class="grid size-8 shrink-0 place-items-center rounded-full text-encre ${vaut ? 'bg-vert-500' : 'bg-nav'}">${ic(vaut ? 'aller' : 'maison', 'size-4')}</span>
      <span class="min-w-0 text-[0.8rem] leading-snug"><b class="block font-semibold text-encre">${titre}</b><span class="text-gris">${detail}</span></span>
    </li>`;

const verdictTexte = vaut => (vaut ? 'ça vaut le déplacement' : 'ça ne vaut pas le déplacement');

/* ------------------------------------------------------------------- blocs */

/* Prix du taxi : le seuil général et chaque trajet connu, du moins cher au plus cher. */
function blocTaxi(seuil) {
  const course = Math.round(seuil / 2);
  const nomCourt = id => marche(id)?.nom_court ?? id;
  const trajets = Object.entries(donnees.meta.trajets || {}).sort((a, b) => a[1] - b[1]);
  return `<section class="carte p-4 lg:p-5">
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
    </section>`;
}

/* Le protocole des 40 %, illustré par le premier prix instable du fichier. */
function exempleInstable() {
  let instable = null;
  for (const p of donnees.produits) for (const m of donnees.marches) {
    const r = p.releves[m.id];
    if (!instable && r?.statut === 'instable') instable = { p, m, min: r.prix_min, max: r.prix_max };
  }
  if (!instable) return '';
  const ecart = instable.max - instable.min;
  const limite = Math.round(instable.min * 1.4);
  return encadre(`<b class="font-semibold">Exemple : ${esc(instable.p.nom)} au ${esc(instable.m.nom)}.</b>
      Une vendeuse annonce ${fcfa(instable.min)}, une autre ${fcfa(instable.max)}. L’écart est de ${fcfa(ecart)},
      soit ${Math.round(ecart / instable.min * 100)}&nbsp;% du prix le plus bas. Au-delà de ${fcfa(limite)}
      (${fcfa(instable.min)}&nbsp;+&nbsp;40&nbsp;%), c’est trop : le marché est marqué « prix instable ».`);
}

/* Un produit dont la réponse change selon le marché de départ : prix, puis verdict depuis chaque marché. */
function exempleDeparts() {
  const depuisChaque = p => donnees.marches.map(m => ({ m, e: evaluerProduit(p, donnees.marches, MAINTENANT, donnees.meta, m.id).ecartUtile }));
  const exemple = donnees.produits.map(p => ({ p, v: depuisChaque(p) }))
    .find(x => x.v.some(y => y.e.vaut) && x.v.some(y => y.e.evaluable && !y.e.vaut && !y.e.surPlace && !y.e.general));
  if (!exemple) return '';

  const { p, v } = exemple;
  const ev = evaluerProduit(p, donnees.marches, MAINTENANT, donnees.meta, null);
  const g = ev.ecartUtile;
  const prix = donnees.marches.map(m => {
    const l = ev.lignes.find(x => x.marche.id === m.id);
    const bas = g.marche?.id === m.id;
    return `<li class="rounded-xl px-1 py-2 text-center ${bas ? 'bg-vert-500 text-encre' : 'bg-fond'}">
        <span class="block truncate text-[0.68rem] ${bas ? 'font-semibold' : 'text-gris'}">${esc(m.nom_court)}</span>
        <b class="block text-[0.8rem] font-semibold tabular-nums">${l?.statut === 'releve' ? esc(nombre(l.prix)) : '—'}</b>
      </li>`;
  }).join('');
  const departs = v.map(({ m, e }) => {
    if (!e.evaluable || e.general) return '';
    if (e.surPlace) return ligneVerdict(false, `Depuis ${esc(m.nom_court)} : restez-y`, 'C’est déjà le marché le moins cher.');
    const compare = e.ecart > e.seuil ? 'plus que' : e.ecart === e.seuil ? 'autant que' : 'moins que';
    return ligneVerdict(e.vaut, `Depuis ${esc(m.nom_court)} : ${verdictTexte(e.vaut)}`,
      `${fcfa(e.ecart)} d’économie, ${compare} le taxi aller-retour vers ${esc(e.marche.nom_court)} (${fcfa(e.seuil)}).`);
  }).join('');
  const inconnu = g.evaluable
    ? ligneVerdict(g.vaut, `Sans point de départ : ${verdictTexte(g.vaut)}`,
        `On prend l’écart entre le plus cher et le moins cher, ${fcfa(g.ecart)}, face au taxi général de ${fcfa(g.seuil)}.
           C’est moins juste : voilà pourquoi l’app demande d’où vous partez.`)
    : '';
  return `<div class="space-y-2.5">
      <p class="font-semibold text-encre">Exemple : ${esc(p.nom)}, ${esc(p.unite_reference.toLowerCase())}</p>
      <ul class="grid grid-cols-4 gap-1.5">${prix}</ul>
      <ul class="space-y-2">${departs}${inconnu}</ul>
    </div>`;
}

/* R7, illustrée par un relevé réel (le kwanga s'il est relevé quelque part). */
function blocContributions() {
  const refP = donnees.produits.find(p => p.id === 'kwanga') || donnees.produits[0];
  const refM = donnees.marches.find(m => refP.releves[m.id]?.statut === 'releve');
  const ref = refM ? refP.releves[refM.id].prix : null;
  return `<section class="carte p-4 lg:p-5">
      <p class="flex items-center gap-2 text-[1rem] font-semibold">${ic('plus', 'size-5 text-vert-600')} Les prix proposés par les utilisateurs</p>
      <div class="mt-2 space-y-3 text-[0.84rem] leading-relaxed text-gris">
        <p>Ils restent sur le téléphone de leur auteur et ne comptent jamais dans le calcul.</p>
        <p>Si un prix proposé s’écarte de <b class="font-semibold text-encre">plus de 50&nbsp;%</b> du dernier relevé du même marché,
          il est marqué <span class="pastille bg-ocre-pale py-0.5 text-ocre">écart important, à vérifier</span>.
          C’est souvent un zéro de trop, un autre contenant ou un autre produit. Le prix est quand même enregistré.</p>
        ${ref ? encadre(`<b class="font-semibold">Exemple : ${esc(refP.nom)} relevé à ${fcfa(ref)} au ${esc(refM.nom)}.</b>
          Un prix proposé au-dessus de ${fcfa(Math.round(ref * 1.5))} ou en dessous de ${fcfa(Math.round(ref * 0.5))} est signalé.`) : ''}
      </div>
    </section>`;
}
