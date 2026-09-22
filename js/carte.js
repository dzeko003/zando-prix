'use strict';

/**
 * Carte des quatre marchés — Leaflet, chargé à la demande.
 *
 * Rien de ce module n'est téléchargé tant que l'utilisateur n'ouvre pas la carte :
 * la bibliothèque (≈ 45 Ko compressés) et les fonds de carte ne pèsent pas sur l'accueil.
 * La position de l'utilisateur est dessinée sur l'écran et gardée en mémoire le temps
 * de la session ; elle n'est ni enregistrée ni envoyée à Zando Prix.
 *
 * Fond : tuiles OpenStreetMap, sans clé, désaturées en CSS pour retrouver le gris
 * clair de la maquette. En production : fournisseur de tuiles avec clé — voir DEMANDES-AU-PM.md.
 */

import { esc, ic, metres } from './html.js';

let carte = null;
let calqueMarches = null;
let calqueUtilisateur = null;
let boutonPosition = null;
let bornesMarches = null;
let chargement = null;


// Sur mobile, le bandeau de recherche recouvre le haut de la carte : on cadre en dessous.
const marges = () => (matchMedia('(min-width: 64rem)').matches
  ? { paddingTopLeft: [32, 32], paddingBottomRight: [80, 32] }
  : { paddingTopLeft: [28, 150], paddingBottomRight: [70, 60] });

function charger(type, url) {
  return new Promise((ok, ko) => {
    const el = type === 'css'
      ? Object.assign(document.createElement('link'), { rel: 'stylesheet', href: url })
      : Object.assign(document.createElement('script'), { src: url, async: true });
    el.onload = ok;
    el.onerror = () => ko(new Error('chargement impossible : ' + url));
    document.head.append(el);
  });
}

export function chargerLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  chargement ??= Promise.all([
    charger('css', '/vendor/leaflet/leaflet.css'),
    charger('js', '/vendor/leaflet/leaflet.js')
  ]).then(() => window.L).catch(err => { chargement = null; throw err; });
  return chargement;
}

export async function afficher(conteneur, options) {
  const L = await chargerLeaflet();
  detruire();

  carte = L.map(conteneur, { zoomControl: false, scrollWheelZoom: true, zoomSnap: 0.5, minZoom: 11, maxZoom: 19 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(carte);
  calqueMarches = L.layerGroup().addTo(carte);
  ajouterControles(L, options.surPosition);

  epingles(options);

  bornesMarches = L.latLngBounds(options.marches.map(m => [m.position.lat, m.position.lon]));
  voirMarches(false);
}

/* Boutons de la carte, en bas à droite : ma position, zoomer, dézoomer, revoir les quatre marchés. */
function ajouterControles(L, surPosition) {
  const Controles = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const bloc = L.DomUtil.create('div', 'flex flex-col items-end gap-2');
      bloc.innerHTML = `
        <button type="button" data-action="position" title="Afficher ma position" aria-label="Afficher ma position"
                class="grid size-11 place-items-center rounded-full bg-vert-500 text-encre shadow-carte transition active:scale-95 disabled:opacity-60">${ic('viseur')}</button>
        <div class="flex flex-col overflow-hidden rounded-full bg-white shadow-carte ring-1 ring-black/5">
          <button type="button" data-action="plus" title="Zoomer" aria-label="Zoomer"
                  class="grid size-11 place-items-center text-encre hover:bg-vert-50">${ic('plus')}</button>
          <span class="mx-3 h-px bg-trait"></span>
          <button type="button" data-action="moins" title="Dézoomer" aria-label="Dézoomer"
                  class="grid size-11 place-items-center text-encre hover:bg-vert-50">${ic('moins')}</button>
        </div>
        <button type="button" data-action="marches" title="Voir les quatre marchés" aria-label="Voir les quatre marchés"
                class="grid size-11 place-items-center rounded-full bg-white text-encre shadow-carte ring-1 ring-black/5 transition active:scale-95">${ic('marche')}</button>`;
      L.DomEvent.disableClickPropagation(bloc);
      L.DomEvent.disableScrollPropagation(bloc);
      bloc.querySelector('[data-action=plus]').addEventListener('click', () => carte?.zoomIn());
      bloc.querySelector('[data-action=moins]').addEventListener('click', () => carte?.zoomOut());
      bloc.querySelector('[data-action=marches]').addEventListener('click', () => voirMarches());
      boutonPosition = bloc.querySelector('[data-action=position]');
      boutonPosition.addEventListener('click', () => surPosition?.());
      return bloc;
    }
  });
  new Controles().addTo(carte);
}

export function voirMarches(anime = true) {
  if (!carte || !bornesMarches) return;
  const options = { ...marges(), maxZoom: 15 };
  if (anime) carte.flyToBounds(bornesMarches, { ...options, duration: 0.6 });
  else carte.fitBounds(bornesMarches, options);
}

export function enCours(actif) {
  if (!boutonPosition) return;
  boutonPosition.disabled = actif;
  boutonPosition.classList.toggle('animate-pulse', actif);
  boutonPosition.setAttribute('aria-busy', String(actif));
}

/**
 * Une épingle par marché. Le moins cher relevé porte l'illustration du produit et un cercle
 * vert ; les autres, une étiquette de prix compacte. Des épingles toutes illustrées se
 * chevauchent : Poto-Poto et Moungali ne sont qu'à 1,3 km l'un de l'autre.
 */
export function epingles({ marches, lignes, badge, produit, format }) {
  const L = window.L;
  if (!carte || !L) return;
  calqueMarches.clearLayers();

  for (const m of marches) {
    const l = lignes.find(x => x.marche.id === m.id);
    const moinsCher = badge === m.id;
    const texte = esc(!l || l.statut === 'pas_vu' ? 'pas vu'
      : l.statut === 'instable' ? 'variable' : format(l.prix));

    // Vignette en arrière-plan plutôt qu'en <img> : leaflet.css force width:auto sur les images des marqueurs.
    const html = moinsCher
      ? `<div class="flex w-max -translate-x-1/2 -translate-y-full flex-col items-center">
          <div class="flex items-center gap-1.5 rounded-2xl bg-white p-0.5 pr-2 shadow-carte ring-2 ring-vert-500">
            <span class="block size-7 rounded-xl bg-cover bg-center" style="background-image:url('/images/produits/${esc(produit.id)}-vignette.webp')"></span>
            <span class="whitespace-nowrap text-[0.74rem] font-bold tabular-nums text-encre">${texte}</span>
          </div>
          <span class="-mt-1 grid size-5 place-items-center rounded-full bg-vert-500 shadow"><span class="size-2 rounded-full bg-white"></span></span>
        </div>`
      : `<div class="flex w-max -translate-x-1/2 -translate-y-full flex-col items-center">
          <span class="whitespace-nowrap rounded-full bg-white px-2 py-1 text-[0.7rem] font-bold tabular-nums text-encre shadow-carte ring-1 ring-black/5">${texte}</span>
          <span class="-mt-0.5 size-3 rounded-full bg-vert-500 shadow ring-2 ring-white"></span>
        </div>`;

    L.marker([m.position.lat, m.position.lon], {
      icon: L.divIcon({ className: 'epingle-marche', html, iconSize: [0, 0], iconAnchor: [0, 0] }),
      title: m.nom,
      riseOnHover: true,
      zIndexOffset: moinsCher ? 500 : 0
    })
      .bindPopup(`<b>${esc(m.nom)}</b><br>${esc(produit.nom)} : ${texte}` +
                 (moinsCher ? '<br><b>le moins cher relevé</b>' : ''), { offset: [0, moinsCher ? -48 : -34] })
      .addTo(calqueMarches);
  }
}

/**
 * « Vous êtes ici » : un point, le cercle de précision que donne l'appareil, et une bulle.
 * Avec `cadrer`, la carte montre la position et le marché le plus proche ensemble.
 */
export function positionUtilisateur({ lat, lon, precision }, marcheProche = null, cadrer = true) {
  const L = window.L;
  if (!carte || !L) return;
  calqueUtilisateur?.remove();

  const rayon = Math.max(precision || 0, 10);
  const cercle = L.circle([lat, lon], {
    radius: rayon, color: '#42D02D', weight: 1.5, opacity: 0.8,
    fillColor: '#42D02D', fillOpacity: 0.12, interactive: false
  });
  const point = L.marker([lat, lon], {
    icon: L.divIcon({
      className: 'epingle-marche', iconSize: [0, 0], iconAnchor: [0, 0],
      html: `<span class="relative block size-5 -translate-x-1/2 -translate-y-1/2">
          <span class="absolute inset-0 rounded-full bg-vert-500/50 motion-safe:animate-ping"></span>
          <span class="relative block size-5 rounded-full border-[3px] border-white bg-vert-500 shadow-carte"></span>
        </span>`
    }),
    zIndexOffset: 1000,
    keyboard: false,
    title: 'Vous êtes ici'
  });
  calqueUtilisateur = L.layerGroup([cercle, point]).addTo(carte);
  point.bindTooltip(precision ? `Vous êtes ici · à ± ${metres(precision)}` : 'Vous êtes ici', {
    permanent: true, direction: 'top', offset: [0, -14], className: 'bulle-position'
  }).openTooltip();

  if (!cadrer) return;
  const bornes = marcheProche
    ? L.latLngBounds([[lat, lon], [marcheProche.position.lat, marcheProche.position.lon]]).extend(cercle.getBounds())
    : cercle.getBounds();
  carte.flyToBounds(bornes, { ...marges(), maxZoom: 17, duration: 0.8 });
}

export function centrer(marche) {
  if (!carte || !marche?.position) return;
  carte.flyTo([marche.position.lat, marche.position.lon], 15, { duration: 0.6 });
}

export function detruire() {
  carte?.remove();
  carte = calqueMarches = calqueUtilisateur = boutonPosition = bornesMarches = null;
}
