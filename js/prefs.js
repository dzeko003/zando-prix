'use strict';

/**
 * Préférences locales : le marché d'où part l'utilisateur, et comment il a été
 * déterminé — choisi à la main ou déduit de la position. Rien ne sort du téléphone.
 */

const CLE = 'zando.marche';

function memoire() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

let stockage = memoire();
try { if (typeof localStorage !== 'undefined' && localStorage) stockage = localStorage; } catch {}

export function utiliserStockage(s) { stockage = s; }

/** { id, source: 'choix' | 'position', km } ou null. */
export function departComplet() {
  let brut;
  try { brut = stockage.getItem(CLE); } catch { return null; }
  if (!brut) return null;
  try {
    const v = JSON.parse(brut);
    return v && v.id ? v : null;
  } catch {
    return { id: brut, source: 'choix', km: null };   // ancien format
  }
}

export function marcheDepart() {
  return departComplet()?.id ?? null;
}

export function definirMarcheDepart(id, source = 'choix', km = null) {
  try {
    if (!id) stockage.removeItem(CLE);
    else stockage.setItem(CLE, JSON.stringify({ id, source, km }));
    return true;
  } catch { return false; }
}

/* La carte d'invitation à autoriser la position : fermée une fois pour toutes si l'utilisateur le demande. */
const CLE_INVITATION = 'zando.invitation-position';

export function invitationFermee() {
  try { return stockage.getItem(CLE_INVITATION) === '1'; } catch { return false; }
}

export function fermerInvitation() {
  try { stockage.setItem(CLE_INVITATION, '1'); } catch { /* stockage indisponible : elle reviendra */ }
}
