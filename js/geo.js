'use strict';

/**
 * Détection du marché de départ à partir de la position de l'appareil.
 *
 * On ne demande jamais la position au chargement : l'utilisateur la déclenche.
 * Une boîte de dialogue de permission qui surgit sans raison se refuse, et
 * une permission refusée ne se redemande pas.
 */

const RAYON_TERRE_KM = 6371;
const DISTANCE_MAX_KM = 15;   // au-delà, on n'est plus dans Brazzaville

const radians = x => (x * Math.PI) / 180;

export function distanceKm(a, b) {
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Le marché le plus proche, ou null si l'utilisateur est loin des quatre. */
export function marcheLePlusProche(position, marches, distanceMax = DISTANCE_MAX_KM) {
  const candidats = marches
    .filter(m => m.position)
    .map(m => ({ marche: m, km: distanceKm(position, m.position) }))
    .sort((a, b) => a.km - b.km);
  if (!candidats.length || candidats[0].km > distanceMax) return null;
  return candidats[0];
}

/** Distance lisible : « à 400 m », « à 2,3 km ». */
export function distanceLisible(km) {
  if (km < 1) return `à ${Math.round(km * 1000 / 50) * 50} m`;
  return `à ${km.toFixed(1).replace('.', ',')} km`;
}

/**
 * Mesure précise : on écoute la position quelques secondes et on garde la meilleure.
 * Sur téléphone, la première réponse vient souvent du réseau, à plusieurs centaines de mètres ;
 * le GPS se cale ensuite. On s'arrête dès que la précision visée est atteinte, sinon au bout
 * du délai avec la meilleure mesure obtenue. Jamais de suivi continu.
 */
export function affiner(geo, { duree = 12000, cible = 25 } = {}) {
  return new Promise((resoudre, rejeter) => {
    let meilleure = null, derniereErreur = null, fini = false, suivi = null;
    const terminer = erreur => {
      if (fini) return;
      fini = true;
      clearTimeout(minuterie);
      if (suivi !== null) geo.clearWatch(suivi);
      if (erreur) return rejeter(erreur);
      if (meilleure) return resoudre(meilleure);
      rejeter(new Error(derniereErreur === 2 ? 'echec' : 'delai'));
    };
    const minuterie = setTimeout(() => terminer(), duree);
    suivi = geo.watchPosition(
      p => {
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy };
        if (!meilleure || pos.precision < meilleure.precision) meilleure = pos;
        if (pos.precision <= cible) terminer();
      },
      err => {
        derniereErreur = err.code;
        if (err.code === 1) terminer(new Error('refus'));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: duree }
    );
    if (fini && suivi !== null) geo.clearWatch(suivi);   // réponse immédiate : le suivi est déjà inutile
  });
}

/**
 * Renvoie { lat, lon, precision } ou rejette avec un motif exploitable :
 * refus · non-securise · indisponible · delai · echec.
 */
export function localiser({ delai = 10000, api, securise, precis = false } = {}) {
  const geo = api ?? (typeof navigator !== 'undefined' ? navigator.geolocation : null);
  const contexteSur = securise ?? (typeof window === 'undefined' ? true : window.isSecureContext !== false);
  return new Promise((resoudre, rejeter) => {
    if (!geo) return rejeter(new Error('indisponible'));
    if (!contexteSur) return rejeter(new Error('non-securise'));
    if (precis && typeof geo.watchPosition === 'function') {
      return affiner(geo, { duree: Math.max(delai, 12000) }).then(resoudre, rejeter);
    }
    geo.getCurrentPosition(
      p => resoudre({ lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy }),
      err => rejeter(new Error(
        err.code === 1 ? 'refus' : err.code === 3 ? 'delai' : 'echec')),
      // Précise quand l'utilisateur demande à se voir : une seule mesure, sans position en cache,
      // donc pas de suivi continu ni d'usure de batterie. Sinon, viser le quartier suffit.
      precis
        ? { enableHighAccuracy: true, timeout: Math.max(delai, 15000), maximumAge: 0 }
        : { enableHighAccuracy: false, timeout: delai, maximumAge: 5 * 60 * 1000 }
    );
  });
}

/** État de l'autorisation, lu sans déclencher la demande du navigateur : granted · prompt · denied · inconnu. */
export async function etatPermission(permissions = typeof navigator !== 'undefined' ? navigator.permissions : undefined) {
  try {
    if (!permissions || typeof permissions.query !== 'function') return 'inconnu';
    const statut = await permissions.query({ name: 'geolocation' });
    return ['granted', 'prompt', 'denied'].includes(statut?.state) ? statut.state : 'inconnu';
  } catch {
    return 'inconnu';
  }
}

/**
 * Où réactiver la localisation. Une page web ne peut ni redemander l'autorisation après un
 * refus, ni allumer le GPS : elle ne peut que montrer le chemin, qui dépend de l'appareil.
 */
export function consignesActivation(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  const firefox = /Firefox|FxiOS/i.test(ua);
  const reessayer = 'Revenez sur Zando Prix et touchez à nouveau « Ma position ».';
  const ordinateurSysteme = [
    'Windows : Paramètres → Confidentialité et sécurité → Localisation, activée.',
    'macOS : Réglages Système → Confidentialité et sécurité → Service de localisation, activé pour le navigateur.',
    'Sans GPS, un ordinateur ne donne qu’une position estimée : un téléphone est bien plus précis.'
  ];
  if (ios && !/CriOS|FxiOS|EdgiOS/i.test(ua)) {
    return {
      plateforme: 'iPhone · Safari',
      site: ['Touchez « aA » à gauche de l’adresse, puis « Réglages du site web ».', 'Dans « Localisation », choisissez « Autoriser ».', reessayer],
      systeme: ['Ouvrez Réglages → Confidentialité et sécurité → Service de localisation, et activez-le.',
                'Dans la même liste, ouvrez « Sites web Safari » : choisissez « Lorsque l’app est active » et activez « Position exacte ».']
    };
  }
  if (ios) {
    return {
      plateforme: 'iPhone · Chrome',
      site: ['Ouvrez Réglages → Chrome → Position.', 'Choisissez « Lorsque l’app est active » et activez « Position exacte ».', reessayer],
      systeme: ['Ouvrez Réglages → Confidentialité et sécurité → Service de localisation, et activez-le.']
    };
  }
  if (android) {
    return {
      plateforme: firefox ? 'Android · Firefox' : 'Android · Chrome',
      site: ['Touchez l’icône à gauche de l’adresse, en haut de l’écran.', 'Ouvrez « Autorisations », puis « Position », et choisissez « Autoriser ».', reessayer],
      systeme: ['Ouvrez les Paramètres du téléphone, puis « Localisation », et activez-la.',
                'Activez aussi « Précision de la localisation » si l’option existe.',
                'Dehors ou près d’une fenêtre, le GPS se cale plus vite.']
    };
  }
  if (firefox) {
    return {
      plateforme: 'Ordinateur · Firefox',
      site: ['Cliquez sur l’icône à gauche de l’adresse.', 'À côté de « Accéder à votre position », retirez le blocage.', 'Rechargez la page, puis cliquez à nouveau sur « Ma position ».'],
      systeme: ordinateurSysteme
    };
  }
  return {
    plateforme: 'Ordinateur · Chrome ou Edge',
    site: ['Cliquez sur l’icône à gauche de l’adresse.', 'Réglez « Position » sur « Autoriser ».', 'Rechargez la page, puis cliquez à nouveau sur « Ma position ».'],
    systeme: ordinateurSysteme
  };
}

export const MESSAGES = {
  refus:        'Position refusée. Choisissez votre marché ci-dessous.',
  'non-securise': 'La position n’est disponible qu’en connexion sécurisée. Choisissez votre marché ci-dessous.',
  indisponible: 'Cet appareil ne donne pas sa position. Choisissez votre marché ci-dessous.',
  delai:        'La position met trop de temps à venir. Choisissez votre marché ci-dessous.',
  echec:        'Position introuvable. Choisissez votre marché ci-dessous.',
  loin:         'Vous semblez loin des quatre marchés. Choisissez celui d’où vous partez.'
};
