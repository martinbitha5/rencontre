// Backoffice Zola
//
// Règle d'architecture : cette page ne fait AUCUNE écriture directe sur les
// données sensibles. Tout passe par des RPC `admin_*` côté Postgres qui
// vérifient le rôle de l'appelant et écrivent une ligne dans le journal
// d'audit. La clé utilisée ici est la clé publique : sans un compte présent
// dans `admin_users`, aucune de ces fonctions ne répond.

import { createClient } from '@supabase/supabase-js';
import { drawEventPoster, drawQrOnly, posterFileName } from './event-poster.js';

const SUPABASE_URL = 'https://sbsxgwdpdjxsrxcccwno.supabase.co';
const supabase = createClient(SUPABASE_URL, 'sb_publishable_m7L5upRFZXPIaBltmLIkAQ_P77Ij01u');

// Aperçu local : `npm run dev` puis /admin?apercu. Données fictives pour
// travailler la mise en page sans se connecter. import.meta.env.DEV vaut
// false dans la version construite : ce bloc et le fichier de données
// n'existent pas sur le site en ligne.
let previewData = null;
if (import.meta.env.DEV && new URLSearchParams(location.search).has('apercu')) {
  previewData = (await import('./admin-preview.js')).default;
}
const PREVIEW = previewData !== null;

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'svg') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined || kid === false || kid === '') continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

const REASONS = {
  faux_profil: 'Faux profil',
  harcelement: 'Harcèlement',
  contenu_inapproprie: 'Contenu inapproprié',
  arnaque: 'Arnaque',
  mineur: 'Mineur suspecté',
  autre: 'Autre',
};

const STATUSES = {
  pending: ['En attente', 'orange'],
  in_review: ['En cours', 'blue'],
  actioned: ['Traité', 'green'],
  reviewed: ['Traité', 'green'],
  dismissed: ['Sans suite', 'grey'],
};

const SEVERITIES = {
  critical: ['Critique', 'red'],
  high: ['Élevée', 'orange'],
  normal: ['Normale', 'grey'],
};

const RESOLUTIONS = {
  aucune_action: 'Aucune action nécessaire',
  avertissement: 'Avertissement envoyé',
  contenu_supprime: 'Contenu supprimé',
  compte_suspendu: 'Compte suspendu',
  compte_banni: 'Compte banni',
  signale_autorites: 'Signalé aux autorités',
};

const AUDIT_LABELS = {
  report_in_review: 'Signalement pris en charge',
  report_actioned: 'Signalement traité',
  report_dismissed: 'Signalement classé sans suite',
  report_pending: 'Signalement remis en attente',
  csae_escalated: 'Signalement transmis aux autorités',
  user_banned: 'Compte banni',
  user_suspended: 'Compte suspendu',
  user_unbanned: 'Bannissement levé',
  shadowban_on: 'Compte masqué',
  shadowban_off: 'Compte de nouveau visible',
  user_warned: 'Avertissement',
  user_verified: 'Compte certifié',
  user_unverified: 'Certification retirée',
  user_deleted: 'Compte supprimé',
  note_added: 'Note interne',
  photo_deleted: 'Photo supprimée',
  photo_flagged: 'Photo signalée',
  photo_approved: 'Photo validée',
  conversation_read: 'Conversation consultée',
  verification_approved: 'Vérification validée',
  verification_rejected: 'Vérification refusée',
  coins_adjusted: 'Solde ajusté',
  incognito_granted: 'Incognito offert',
  incognito_revoked: 'Incognito retiré',
  event_created: 'Soirée créée',
  event_deleted: 'Soirée supprimée',
  event_closed: 'Soirée : accès fermé',
  event_reopened: 'Soirée : accès rouvert',
  event_price_changed: 'Soirée : prix modifié',
  event_ends_changed: 'Soirée : fin modifiée',
  inbound_mail_securite: 'Courrier : message reçu sur securite@',
  admin_added: 'Administrateur ajouté',
  admin_removed: 'Administrateur retiré',
  admin_role_changed: 'Rôle modifié',
  admin_enabled: 'Administrateur réactivé',
  admin_disabled: 'Administrateur désactivé',
  waitlist_removed: "Adresse retirée de la liste d'attente",
};

const ERRORS = {
  not_admin: "Ce compte n'a pas les droits d'administration.",
  not_authenticated: 'Session expirée, reconnectez-vous.',
  forbidden_owner_only: 'Action réservée au propriétaire du compte.',
  forbidden_admin_only: 'Action réservée aux administrateurs.',
  reason_required: 'Le motif est obligatoire.',
  body_required: 'Le texte est obligatoire.',
  amount_required: 'Indiquez un montant différent de zéro.',
  amount_too_large: 'Montant trop élevé.',
  invalid_duration: 'Durée invalide.',
  user_not_found: 'Compte introuvable.',
  report_not_found: 'Signalement introuvable.',
  photo_not_found: 'Photo introuvable.',
  request_not_found: 'Demande introuvable.',
  already_reviewed: 'Cette demande a déjà été traitée.',
  match_not_found: 'Conversation introuvable.',
  cannot_sanction_admin: "Impossible de sanctionner un membre de l'équipe.",
  cannot_delete_admin: "Impossible de supprimer un membre de l'équipe.",
  cannot_demote_self: 'Vous ne pouvez pas changer votre propre rôle.',
  cannot_disable_self: 'Vous ne pouvez pas désactiver votre propre accès.',
  cannot_remove_self: 'Vous ne pouvez pas vous retirer vous-même.',
  last_owner: 'Il doit rester au moins un propriétaire actif.',
  account_not_found: "Aucun compte Zola avec cette adresse. La personne doit d'abord créer un compte.",
  invalid_role: 'Rôle inconnu.',
  invalid_status: 'Statut inconnu.',
  waitlist_not_found: 'Cette adresse a déjà été retirée.',
};

function errText(error) {
  const raw = String(error?.message || error || '');
  for (const key of Object.keys(ERRORS)) if (raw.includes(key)) return ERRORS[key];
  return 'Action impossible. Réessayez ou prévenez le responsable technique.';
}

async function rpc(fn, args) {
  if (PREVIEW) {
    const fixture = previewData[fn];
    if (fixture === undefined) throw new Error(`Aperçu : pas de données fictives pour ${fn}`);
    return typeof fixture === 'function' ? fixture(args) : structuredClone(fixture);
  }
  const { data, error } = await supabase.rpc(fn, args || {});
  if (error) throw error;
  return data;
}

function photoUrl(path, bucket) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket || 'photos'}/${path}`;
}

// --- Couvertures de blog -----------------------------------------------------
// Les images partaient telles qu'elles sortaient du téléphone : la première
// couverture publiée pesait 2,2 Mo pour être affichée sur 900 px de large, et
// le blog mettait une vingtaine de secondes à la charger. On réduit et on
// réencode dans le navigateur avant l'envoi. Les transformations d'image de
// Supabase feraient ce travail côté serveur, mais elles sont réservées aux
// offres payantes (le projet répond FeatureNotEnabled).
const COVER_MAX_WIDTH = 1600;     // large de reste pour les grands écrans
const COVER_QUALITY = 0.82;       // au-delà, le poids grimpe sans gain visible
const COVER_CACHE_SECONDS = '31536000'; // un an : le nom du fichier est horodaté,
                                        // son contenu ne change jamais

function poids(octets) {
  return octets >= 1048576
    ? (octets / 1048576).toFixed(1).replace('.', ',') + ' Mo'
    : Math.round(octets / 1024) + ' Ko';
}

// Renvoie toujours quelque chose d'envoyable : si le navigateur ne sait pas
// décoder ou réencoder le fichier, on repart sur l'original. Mieux vaut une
// image lourde qu'un article sans couverture.
async function prepareCover(file) {
  const brut = { blob: file, type: file.type, ext: file.name.split('.').pop()?.toLowerCase() || 'jpg', note: '' };
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, COVER_MAX_WIDTH / bitmap.width);
    const width = Math.round(bitmap.width * ratio);
    const height = Math.round(bitmap.height * ratio);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    // WebP d'abord, JPEG si le navigateur ne le produit pas. toBlob rend null
    // quand le type demandé n'est pas géré.
    let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', COVER_QUALITY));
    let type = 'image/webp';
    let ext = 'webp';
    if (!blob) {
      blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', COVER_QUALITY));
      type = 'image/jpeg';
      ext = 'jpg';
    }
    if (!blob || blob.size >= file.size) return brut;

    return { blob, type, ext, note: ` Image réduite de ${poids(file.size)} à ${poids(blob.size)}.` };
  } catch {
    return brut;
  }
}

const dtf = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const dtfFull = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const fmtDate = (v) => (v ? dtf.format(new Date(v)) : '—');
const fmtFull = (v) => (v ? dtfFull.format(new Date(v)) : '—');
const nf = new Intl.NumberFormat('fr-FR');
const num = (v) => nf.format(v ?? 0);

function ago(v) {
  if (!v) return '—';
  const s = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 2592000) return `il y a ${Math.floor(s / 86400)} j`;
  return fmtDate(v);
}

function pill(label, tone) {
  return h('span', { class: `pill ${tone || 'grey'}`, text: label });
}

// --- Vignettes nettes ---------------------------------------------------------
// Les photos de profil sont stockées en grand (1 600 px, JPEG 85 %) et ne sont
// JAMAIS modifiées ici. Le problème était l'affichage : pour montrer une photo
// de 1 200 px dans un rond de 36 px, Chrome la décode « en raccourci » au
// huitième de sa taille, et ce raccourci rend certains JPEG (marqueurs de
// redémarrage, profil couleur) en mosaïque pastel. Constaté le 24/11/2026 sur
// l'avatar d'un compte dont le fichier stocké est parfaitement sain.
// L'offre Supabase actuelle ne fournit pas de vignettes redimensionnées
// (render/image : FeatureNotEnabled). On décode donc la photo en entier dans
// le navigateur, puis on la réduit en haute qualité sur un canevas, recadrée
// comme le ferait object-fit: cover. En cas d'échec, l'image d'origine.
const thumbCache = new Map();
const thumbQueue = [];
let thumbActive = 0;

function runThumbQueue() {
  while (thumbActive < 4 && thumbQueue.length) {
    const job = thumbQueue.shift();
    thumbActive += 1;
    job().finally(() => { thumbActive -= 1; runThumbQueue(); });
  }
}

function makeThumb(url, w, hgt) {
  const dpr = Math.min(3, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
  const W = Math.round(w * dpr);
  const H = Math.round(hgt * dpr);
  const key = `${url}|${W}x${H}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const p = new Promise((resolve, reject) => {
    thumbQueue.push(async () => {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`http ${res.status}`);
        // Décodage complet : pas de raccourci au huitième.
        const bmp = await createImageBitmap(await res.blob());
        const scale = Math.max(W / bmp.width, H / bmp.height);
        const sw = W / scale;
        const sh = H / scale;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, W, H);
        if (bmp.close) bmp.close();
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (e) {
        reject(e);
      }
    });
    runThumbQueue();
  });
  thumbCache.set(key, p);
  p.catch(() => thumbCache.delete(key));
  return p;
}

// Une <img> qui reçoit sa vignette nette dès qu'elle est prête.
function sharpImg(url, w, hgt, attrs = {}) {
  const img = h('img', { alt: '', decoding: 'async', ...attrs });
  if (!url) return img;
  makeThumb(url, w, hgt)
    .then((src) => { img.src = src; })
    .catch(() => { img.src = url; });
  return img;
}

function avatar(path, big) {
  const url = photoUrl(path);
  const cls = `avatar${big ? ' lg' : ''}`;
  if (!url) return h('div', { class: cls });
  const size = big ? 62 : 36;
  return sharpImg(url, size, size, { class: cls });
}

function toast(message, isError) {
  const t = h('div', { class: `toast${isError ? ' err' : ''}`, text: message });
  document.body.append(t);
  setTimeout(() => t.remove(), 3600);
}

function empty(text) {
  return h('div', { class: 'empty', text });
}

// Une rangée de boutons sous un intitulé : les actions se lisent par famille
// au lieu de former un tas. Un groupe sans bouton (droits insuffisants)
// disparaît entièrement.
function actionGroup(label, ...buttons) {
  const btns = buttons.filter(Boolean);
  if (!btns.length) return null;
  return h('div', { class: 'action-group' },
    h('div', { class: 'group-label', text: label }),
    h('div', { class: 'btn-row' }, ...btns));
}

// Modale de confirmation. `fields` permet d'exiger un motif : aucune sanction
// ne part sans justification écrite, c'est ce qui rend le journal exploitable.
function ask({ title, text, confirmLabel, danger, fields }) {
  return new Promise((resolve) => {
    const inputs = {};
    const body = (fields || []).map((f) => {
      let input;
      if (f.type === 'select') {
        input = h('select', {}, ...f.options.map((o) => h('option', { value: o.value }, o.label)));
      } else if (f.type === 'textarea') {
        input = h('textarea', { placeholder: f.placeholder || '' });
      } else {
        input = h('input', { type: f.type || 'text', placeholder: f.placeholder || '' });
      }
      if (f.value !== undefined) input.value = f.value;
      inputs[f.name] = input;
      return h('div', { style: { marginBottom: '12px' } },
        h('label', { class: 'field', text: f.label }), input);
    });

    const err = h('p', { class: 'msg-line err hidden' });
    const close = (value) => { wrap.remove(); resolve(value); };

    const wrap = h('div', { class: 'modal-wrap' },
      h('div', { class: 'modal' },
        h('h3', { text: title }),
        text ? h('p', { text }) : null,
        ...body,
        err,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn ghost', onclick: () => close(null) }, 'Annuler'),
          h('button', {
            class: danger ? 'btn danger' : 'btn',
            onclick: () => {
              const out = {};
              for (const f of fields || []) {
                const v = inputs[f.name].value.trim();
                if (f.required && !v) {
                  err.textContent = `${f.label} : ce champ est obligatoire.`;
                  err.classList.remove('hidden');
                  return;
                }
                out[f.name] = v;
              }
              close(out);
            },
          }, confirmLabel || 'Confirmer'))));

    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(null); });
    document.body.append(wrap);
    const first = Object.values(inputs)[0];
    if (first) first.focus();
  });
}

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

const state = {
  me: null,
  page: 'dashboard',
  dashboard: null,
  reportFilter: { status: 'open', severity: null, reason: null, search: '' },
  userFilter: { filter: 'all', search: '' },
  photoFilter: null,
  verifFilter: 'pending',
  currentPost: null,
  currentEvent: null,
};

const isOwner = () => state.me?.role === 'owner';
const isAdminPlus = () => state.me?.role === 'owner' || state.me?.role === 'admin';

// ---------------------------------------------------------------------------
// Tiroir latéral
// ---------------------------------------------------------------------------

let drawerEl = null;

function closeDrawer() {
  if (drawerEl) { drawerEl.remove(); drawerEl = null; }
}

function openDrawer(headNodes, bodyNodes) {
  closeDrawer();
  const body = h('div', { class: 'drawer-body' }, ...bodyNodes);
  drawerEl = h('div', { class: 'overlay' },
    h('div', { class: 'drawer' },
      h('div', { class: 'drawer-head' },
        ...headNodes,
        h('button', { class: 'close', onclick: closeDrawer, title: 'Fermer' }, '×')),
      body));
  drawerEl.addEventListener('click', (e) => { if (e.target === drawerEl) closeDrawer(); });
  document.body.append(drawerEl);
}

// ---------------------------------------------------------------------------
// Actions de modération (partagées entre le tiroir profil et les signalements)
// ---------------------------------------------------------------------------

async function actWarn(userId, reportId, after) {
  const v = await ask({
    title: 'Avertir ce compte',
    text: "L'avertissement est enregistré au dossier et compte dans l'historique de la personne.",
    confirmLabel: 'Enregistrer',
    fields: [{ name: 'reason', label: 'Motif', type: 'textarea', required: true, placeholder: 'Ce qui est reproché, en une phrase.' }],
  });
  if (!v) return;
  try {
    const r = await rpc('admin_warn_user', { p_user_id: userId, p_reason: v.reason, p_report_id: reportId || null });
    toast(`Avertissement enregistré (${r.warnings_count} au total).`);
    if (after) after();
  } catch (e) { toast(errText(e), true); }
}

async function actShadowban(userId, on, after) {
  const v = await ask({
    title: on ? 'Masquer ce compte' : 'Ne plus masquer ce compte',
    text: on
      ? "Le compte continue de fonctionner normalement pour son propriétaire, mais il n'apparaît plus dans Rencontres, ni dans J'aime, ni dans les soirées. Utile quand un doute existe sans preuve suffisante pour bannir."
      : 'Le compte réapparaîtra dans la découverte.',
    confirmLabel: on ? 'Masquer' : 'Retirer',
    fields: [{ name: 'reason', label: 'Motif', type: 'text', required: on }],
  });
  if (!v) return;
  try {
    await rpc('admin_set_shadowban', { p_user_id: userId, p_on: on, p_reason: v.reason || null });
    toast(on ? 'Compte masqué : les autres ne le voient plus.' : 'Le compte est de nouveau visible.');
    if (after) after();
  } catch (e) { toast(errText(e), true); }
}

async function actBan(userId, reportId, after) {
  const v = await ask({
    title: 'Suspendre ou bannir',
    text: "La personne ne peut plus se connecter ni écrire, ses conversations sont coupées et son profil disparaît de l'application.",
    confirmLabel: 'Appliquer',
    danger: true,
    fields: [
      {
        name: 'days', label: 'Durée', type: 'select', options: [
          { value: '7', label: 'Suspension de 7 jours' },
          { value: '30', label: 'Suspension de 30 jours' },
          { value: '', label: 'Bannissement définitif' },
        ],
      },
      { name: 'reason', label: 'Motif', type: 'textarea', required: true, placeholder: 'Ce qui justifie la sanction.' },
    ],
  });
  if (!v) return;
  try {
    const r = await rpc('admin_ban_user', {
      p_user_id: userId,
      p_reason: v.reason,
      p_days: v.days ? Number(v.days) : null,
      p_report_id: reportId || null,
    });
    toast(r.banned_until ? `Compte suspendu jusqu'au ${fmtDate(r.banned_until)}.` : 'Compte banni définitivement.');
    if (after) after();
  } catch (e) { toast(errText(e), true); }
}

async function actUnban(userId, after) {
  const v = await ask({
    title: 'Lever la sanction',
    text: 'Le compte redevient utilisable immédiatement.',
    confirmLabel: 'Lever',
    fields: [{ name: 'reason', label: 'Motif de la levée', type: 'text' }],
  });
  if (!v) return;
  try {
    await rpc('admin_unban_user', { p_user_id: userId, p_reason: v.reason || null });
    toast('Sanction levée.');
    if (after) after();
  } catch (e) { toast(errText(e), true); }
}

async function actNote(userId, after) {
  const v = await ask({
    title: 'Note interne',
    text: "Visible uniquement par l'équipe. Jamais montrée à l'utilisateur.",
    confirmLabel: 'Enregistrer',
    fields: [{ name: 'body', label: 'Note', type: 'textarea', required: true }],
  });
  if (!v) return;
  try {
    await rpc('admin_add_note', { p_user_id: userId, p_body: v.body });
    toast('Note enregistrée.');
    if (after) after();
  } catch (e) { toast(errText(e), true); }
}

async function actCoins(userId, after) {
  const v = await ask({
    title: 'Ajuster le solde de pièces',
    text: "Utilisez un montant négatif pour retirer des pièces. Le mouvement apparaît dans l'historique et dans les transactions du compte.",
    confirmLabel: 'Appliquer',
    fields: [
      { name: 'amount', label: 'Montant (pièces)', type: 'number', required: true, placeholder: '100 ou -100' },
      { name: 'reason', label: 'Motif', type: 'text', required: true, placeholder: 'Geste commercial, correction dincident...' },
    ],
  });
  if (!v) return;
  try {
    const r = await rpc('admin_adjust_coins', { p_user_id: userId, p_amount: Number(v.amount), p_reason: v.reason });
    toast(`Nouveau solde : ${num(r.balance)} pièces.`);
    if (after) after();
  } catch (e) { toast(errText(e), true); }
}

// Offrir l'abonnement Incognito. Pensé pour l'équipe : un modérateur qui
// parcourt l'application en restant invisible ne devient pas lui-même une
// cible. Marche aussi comme geste commercial sur n'importe quel compte.
async function actGrantIncognito(userId, after) {
  const v = await ask({
    title: "Offrir l'abonnement Incognito",
    text: "Le profil n'apparaît plus chez les autres dans Rencontres, sans rien payer. Le mode est activé tout de suite ; la personne peut le couper depuis l'application quand elle veut. Un abonnement déjà en cours est prolongé.",
    confirmLabel: 'Offrir',
    fields: [
      {
        name: 'months', label: 'Durée offerte', type: 'select', value: '12', options: [
          { value: '1', label: '1 mois' },
          { value: '3', label: '3 mois' },
          { value: '6', label: '6 mois' },
          { value: '12', label: '12 mois' },
        ],
      },
      { name: 'reason', label: 'Motif', type: 'text', required: true, placeholder: "Membre de l'équipe de modération" },
    ],
  });
  if (!v) return;
  try {
    const r = await rpc('admin_grant_incognito', {
      p_user_id: userId, p_months: Number(v.months), p_reason: v.reason, p_activate: true,
    });
    toast(`Incognito offert jusqu'au ${fmtDate(r.incognito_until)}.`);
    if (after) after();
  } catch (e) { toast(errText(e), true); }
}

async function actRevokeIncognito(userId, after) {
  const v = await ask({
    title: "Retirer l'abonnement Incognito",
    text: 'Le profil réapparaît chez les autres dans Rencontres.',
    confirmLabel: 'Retirer',
    danger: true,
    fields: [{ name: 'reason', label: 'Motif', type: 'text' }],
  });
  if (!v) return;
  try {
    await rpc('admin_revoke_incognito', { p_user_id: userId, p_reason: v.reason || null });
    toast('Abonnement Incognito retiré.');
    if (after) after();
  } catch (e) { toast(errText(e), true); }
}

// Un abonnement dont l'échéance est passée ne compte plus.
const incognitoActive = (until) => !!until && new Date(until) > new Date();

async function actDeleteUser(userId, after) {
  const v = await ask({
    title: 'Supprimer définitivement le compte',
    text: "Suppression totale et irréversible : profil, photos, messages, matchs. À réserver aux cas où le compte n'a pas à exister (mineur avéré, doublon frauduleux). Pour tout le reste, préférez le bannissement, qui conserve les preuves.",
    confirmLabel: 'Supprimer définitivement',
    danger: true,
    fields: [{ name: 'reason', label: 'Motif', type: 'textarea', required: true }],
  });
  if (!v) return;
  try {
    await rpc('admin_delete_user', { p_user_id: userId, p_reason: v.reason });
    toast('Compte supprimé.');
    closeDrawer();
    if (after) after();
  } catch (e) { toast(errText(e), true); }
}

async function actDeletePhoto(photoId, after) {
  const v = await ask({
    title: 'Supprimer cette photo',
    text: "La photo disparaît du profil et du stockage. La personne reçoit une notification qui l'invite à en ajouter une autre. Le motif reste interne, elle ne le voit pas. L'action est tracée.",
    confirmLabel: 'Supprimer',
    danger: true,
    fields: [{ name: 'reason', label: 'Motif', type: 'text', required: true }],
  });
  if (!v) return;
  try {
    const r = await rpc('admin_delete_photo', { p_photo_id: photoId, p_reason: v.reason });
    if (r.storage_path) await supabase.storage.from('photos').remove([r.storage_path]);
    toast('Photo supprimée.');
    if (after) after();
  } catch (e) { toast(errText(e), true); }
}

// ---------------------------------------------------------------------------
// Tiroir : fiche complète d'un compte
// ---------------------------------------------------------------------------

async function openUser(userId, fromReportId) {
  let d;
  try {
    d = await rpc('admin_user_detail', { p_user_id: userId });
  } catch (e) { toast(errText(e), true); return; }

  const p = d.profile;
  const reload = () => openUser(userId, fromReportId);

  const status = [];
  if (p.is_banned) {
    status.push(pill(p.banned_until ? `Suspendu jusqu'au ${fmtDate(p.banned_until)}` : 'Banni', 'red'));
  }
  if (p.shadowbanned) status.push(pill('Masqué', 'orange'));
  if (p.warnings_count > 0) status.push(pill(`${p.warnings_count} avertissement(s)`, 'orange'));
  if (p.is_verified) status.push(pill('Certifié', 'green'));
  if (incognitoActive(p.incognito_until)) status.push(pill('Incognito actif', 'lime'));
  if (p.is_premium) status.push(pill('Premium', 'lime'));
  if (!p.is_onboarded) status.push(pill('Profil incomplet', 'grey'));
  if (!status.length) status.push(pill('Compte en règle', 'green'));

  const head = [
    avatar(d.photos[0]?.path, true),
    h('div', {},
      h('div', { style: { fontWeight: '700', fontSize: '1.02rem' } },
        p.display_name || 'Sans nom', p.age ? `, ${p.age} ans` : ''),
      h('div', { class: 'hint' }, [p.city, p.commune].filter(Boolean).join(' · ') || 'Ville non renseignée'),
      h('div', { style: { marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' } }, ...status)),
  ];

  // Actions
  const actions = h('div', { class: 'card' },
    h('h2', { text: 'Actions' }),
    h('p', { class: 'hint' }, "Chaque action demande un motif et est gardée dans l'historique."),
    actionGroup('Sanctionner',
      h('button', { class: 'btn ghost sm', onclick: () => actWarn(userId, fromReportId, reload) }, 'Avertir'),
      p.shadowbanned
        ? h('button', { class: 'btn ghost sm', onclick: () => actShadowban(userId, false, reload) }, 'Ne plus masquer')
        : h('button', { class: 'btn ghost sm', onclick: () => actShadowban(userId, true, reload) }, 'Masquer le compte'),
      p.is_banned
        ? h('button', { class: 'btn sm', onclick: () => actUnban(userId, reload) }, 'Lever la sanction')
        : h('button', { class: 'btn danger sm', onclick: () => actBan(userId, fromReportId, reload) }, 'Suspendre ou bannir')),
    actionGroup('Gérer le compte',
      h('button', {
        class: 'btn ghost sm',
        onclick: async () => {
          try {
            await rpc('admin_set_verified', { p_user_id: userId, p_on: !p.is_verified });
            toast(p.is_verified ? 'Certification retirée.' : 'Compte certifié.');
            reload();
          } catch (e) { toast(errText(e), true); }
        },
      }, p.is_verified ? 'Retirer la certification' : 'Certifier'),
      h('button', { class: 'btn ghost sm', onclick: () => actNote(userId, reload) }, 'Ajouter une note')),
    isAdminPlus() ? actionGroup('Avantages',
      h('button', { class: 'btn ghost sm', onclick: () => actCoins(userId, reload) }, 'Ajuster les pièces'),
      incognitoActive(p.incognito_until)
        ? h('button', { class: 'btn ghost sm', onclick: () => actRevokeIncognito(userId, reload) }, "Retirer l'incognito")
        : h('button', { class: 'btn ghost sm', onclick: () => actGrantIncognito(userId, reload) }, "Offrir l'incognito")) : null,
    isAdminPlus() ? actionGroup('Irréversible',
      h('button', { class: 'btn danger sm', onclick: () => actDeleteUser(userId, () => go(state.page)) }, 'Supprimer le compte')) : null,
    p.is_banned && p.ban_reason
      ? h('div', { class: 'callout red', style: { marginTop: '14px' } },
          h('b', {}, 'Motif de la sanction : '), p.ban_reason)
      : null);

  // Identité
  const identity = h('div', { class: 'card' },
    h('h2', { text: 'Identité et compte' }),
    h('dl', { class: 'kv', style: { marginTop: '10px' } },
      h('dt', {}, 'Adresse e-mail'), h('dd', { text: p.email || '—' }),
      // Identifiant public (migration 043) : le numéro qu'on communique et
      // qu'on recherche. L'UUID reste en dessous, en clé technique : il sert
      // encore à retrouver le compte dans la console Supabase, jamais à
      // identifier quelqu'un auprès des utilisateurs.
      h('dt', {}, 'Numéro du compte'),
      h('dd', {}, h('b', { style: { letterSpacing: '.06em' }, text: p.public_id || '—' })),
      h('dt', {}, 'Clé technique'),
      h('dd', { style: { fontSize: '.7rem', color: 'var(--faint)' }, text: p.user_id }),
      h('dt', {}, 'Inscription'), h('dd', { text: fmtFull(p.created_at) }),
      h('dt', {}, 'Dernière connexion'), h('dd', { text: fmtFull(p.last_sign_in_at) }),
      h('dt', {}, 'Dernière activité'), h('dd', { text: ago(p.last_active_at) }),
      h('dt', {}, 'E-mail confirmé'), h('dd', { text: p.email_confirmed_at ? 'Oui' : 'Non' }),
      h('dt', {}, 'Date de naissance'), h('dd', { text: p.birth_date ? `${fmtDate(p.birth_date)} (${p.age} ans)` : '—' }),
      h('dt', {}, 'Genre'), h('dd', { text: `${p.gender || '—'} · cherche ${p.looking_for || '—'}` }),
      h('dt', {}, 'Intention'), h('dd', { text: p.relationship_goal || '—' }),
      h('dt', {}, 'Profession'), h('dd', { text: p.job_title || '—' }),
      h('dt', {}, 'Mode incognito'), h('dd', { text: p.incognito ? 'Activé' : 'Non' }),
      h('dt', {}, 'Abonnement incognito'),
      h('dd', {
        text: incognitoActive(p.incognito_until)
          ? `Actif jusqu'au ${fmtDate(p.incognito_until)}`
          : p.incognito_until
            ? `Expiré le ${fmtDate(p.incognito_until)}`
            : 'Aucun',
      })),
    p.bio ? h('p', { class: 'hint', style: { marginTop: '12px' } }, h('b', {}, 'Bio : '), p.bio) : null);

  // Photos
  const photos = h('div', { class: 'card' },
    h('h2', { text: `Photos (${d.photos.length})` }),
    d.photos.length
      ? h('div', { class: 'photo-strip', style: { marginTop: '12px' } },
          ...d.photos.map((ph) => h('div', { class: 'photo-thumb' },
            sharpImg(photoUrl(ph.path), 88, 110),
            h('button', { onclick: () => actDeletePhoto(ph.id, reload) }, 'Supprimer'))))
      : h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Aucune photo.'));

  // Chiffres
  const s = d.stats;
  const stats = h('div', { class: 'card' },
    h('h2', { text: "Activité" }),
    h('dl', { class: 'kv', style: { marginTop: '10px' } },
      h('dt', {}, 'Likes envoyés'), h('dd', { text: num(s.likes_sent) }),
      h('dt', {}, 'Likes reçus'), h('dd', { text: num(s.likes_received) }),
      h('dt', {}, 'Matchs actifs'), h('dd', { text: num(s.matches) }),
      h('dt', {}, 'Messages envoyés'), h('dd', { text: num(s.messages_sent) }),
      h('dt', {}, 'Signalements reçus'), h('dd', { text: num(s.reports_against) }),
      h('dt', {}, 'Signalements déposés'), h('dd', { text: num(s.reports_filed) }),
      h('dt', {}, 'Bloqué par'), h('dd', { text: `${num(s.blocked_by_count)} personne(s)` }),
      h('dt', {}, 'Soirées'), h('dd', { text: num(s.events) }),
      h('dt', {}, 'Solde'), h('dd', { text: `${num(d.wallet.balance)} pièces` }),
      h('dt', {}, 'Dépensé au total'), h('dd', { text: `${num(d.wallet.spent_total)} pièces` })));

  // Historique
  const history = h('div', { class: 'card' },
    h('h2', { text: 'Historique de modération' }),
    d.sanctions.length
      ? h('ul', { class: 'timeline', style: { marginTop: '8px' } },
          ...d.sanctions.map((x) => h('li', {},
            h('div', {}, pill({
              warning: 'Avertissement', shadowban: 'Masquage',
              suspension: 'Suspension', ban: 'Bannissement',
            }[x.kind] || x.kind, x.kind === 'warning' ? 'orange' : 'red'),
              ' ', x.lifted_at ? pill('Levée', 'grey') : null),
            h('div', { text: x.reason }),
            h('div', { class: 'when' }, `${fmtFull(x.created_at)} · ${x.by || 'système'}`,
              x.expires_at ? ` · jusqu'au ${fmtDate(x.expires_at)}` : ''))))
      : h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Aucune sanction à ce jour.'));

  // Notes
  const notes = h('div', { class: 'card' },
    h('h2', { text: 'Notes internes' }),
    d.notes.length
      ? h('ul', { class: 'timeline', style: { marginTop: '8px' } },
          ...d.notes.map((n) => h('li', {},
            h('div', { text: n.body }),
            h('div', { class: 'when' }, `${fmtFull(n.created_at)} · ${n.author || 'inconnu'}`))))
      : h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Aucune note.'));

  // Signalements reçus
  const reports = h('div', { class: 'card' },
    h('h2', { text: `Signalements reçus (${d.reports.length})` }),
    d.reports.length
      ? h('ul', { class: 'timeline', style: { marginTop: '8px' } },
          ...d.reports.map((r) => h('li', {},
            h('div', {}, pill(REASONS[r.reason] || r.reason, SEVERITIES[r.severity]?.[1]),
              ' ', pill(STATUSES[r.status]?.[0] || r.status, STATUSES[r.status]?.[1])),
            r.details ? h('div', { text: r.details }) : null,
            h('div', { class: 'when' }, `${fmtFull(r.created_at)} · par ${r.reporter || 'compte supprimé'}`,
              r.resolution ? ` · ${RESOLUTIONS[r.resolution]}` : ''),
            r.match_id
              ? h('button', { class: 'btn ghost sm', style: { marginTop: '6px' }, onclick: () => openConversation(r.match_id) }, 'Lire la conversation')
              : null)))
      : h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Aucun signalement.'));

  // Conversations
  const convs = h('div', { class: 'card' },
    h('h2', { text: `Conversations (${d.conversations.length})` }),
    h('p', { class: 'hint' }, "Chaque ouverture d'une conversation est enregistrée avec votre nom. N'ouvrez une conversation que pour traiter un signalement."),
    d.conversations.length
      ? h('div', { class: 'table-wrap', style: { marginTop: '10px' } },
          h('table', {},
            h('tbody', {}, ...d.conversations.slice(0, 25).map((c) => h('tr', { class: 'clickable', onclick: () => openConversation(c.match_id) },
              h('td', { 'data-l': 'Avec', text: c.other_name || 'Compte supprimé' }),
              h('td', { 'data-l': 'Messages', text: `${c.messages} message(s)` }),
              h('td', { 'data-l': 'Type' }, pill(c.status === 'pending' ? 'Invitation' : 'Match', c.status === 'pending' ? 'grey' : 'green')),
              h('td', { 'data-l': 'Ouverte', class: 'hint', text: fmtDate(c.created_at) }))))))
      : h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Aucune conversation.'));

  openDrawer(head, [actions, identity, photos, stats, reports, history, notes, convs]);
}

// ---------------------------------------------------------------------------
// Tiroir : conversation
// ---------------------------------------------------------------------------

async function openConversation(matchId) {
  let c;
  try {
    c = await rpc('admin_get_conversation', { p_match_id: matchId, p_limit: 300 });
  } catch (e) { toast(errText(e), true); return; }

  const a = c.participants.a;
  const b = c.participants.b;

  const head = [
    h('div', {},
      h('div', { style: { fontWeight: '700' } }, `${a.display_name || 'Inconnu'} et ${b.display_name || 'Inconnu'}`),
      h('div', { class: 'hint' }, `${c.messages.length} message(s) · ouverte le ${fmtDate(c.match.created_at)}`)),
  ];

  const bubbles = c.messages.map((m) => {
    const mine = m.sender_id === a.user_id;
    const who = mine ? a : b;
    let content;
    if (m.kind === 'image' || m.kind === 'video') {
      content = h('a', { href: photoUrl(m.media_path, 'chat-media'), target: '_blank', rel: 'noopener' },
        m.kind === 'image' ? 'Photo envoyée (ouvrir)' : 'Vidéo envoyée (ouvrir)');
    } else if (m.kind === 'audio') {
      content = h('a', { href: photoUrl(m.media_path, 'voice'), target: '_blank', rel: 'noopener' }, 'Note vocale (écouter)');
    } else {
      content = h('div', { text: m.content });
    }
    return h('div', { class: `msg ${mine ? 'a' : 'b'}` },
      h('div', { class: 'who', text: who.display_name || 'Inconnu' }),
      content,
      h('div', { class: 'when', text: fmtFull(m.created_at) }));
  });

  openDrawer(head, [
    h('div', { class: 'card' },
      h('div', { class: 'btn-row', style: { marginBottom: '12px' } },
        h('button', { class: 'btn ghost sm', onclick: () => openUser(a.user_id) }, `Fiche de ${a.display_name || 'A'}`),
        h('button', { class: 'btn ghost sm', onclick: () => openUser(b.user_id) }, `Fiche de ${b.display_name || 'B'}`)),
      c.messages.length
        ? h('div', { class: 'msg-list' }, ...bubbles)
        : h('p', { class: 'hint' }, 'Aucun message dans cette conversation.')),
  ]);
}

// ---------------------------------------------------------------------------
// Tiroir : signalement
// ---------------------------------------------------------------------------

async function openReport(r) {
  const target = r.reported;
  const reload = async () => { closeDrawer(); await go(state.page); };

  const setStatus = async (status, resolution, notes) => {
    try {
      await rpc('admin_set_report_status', {
        p_id: r.id, p_status: status, p_resolution: resolution || null, p_notes: notes || null,
      });
      toast('Signalement mis à jour.');
      reload();
    } catch (e) { toast(errText(e), true); }
  };

  const head = [
    avatar(target.photo, true),
    h('div', {},
      h('div', { style: { fontWeight: '700', fontSize: '1.02rem' } }, REASONS[r.reason] || r.reason),
      h('div', { class: 'hint' }, `Signalé le ${fmtFull(r.created_at)}`),
      h('div', { style: { marginTop: '6px', display: 'flex', gap: '6px' } },
        pill(SEVERITIES[r.severity]?.[0] || r.severity, SEVERITIES[r.severity]?.[1]),
        pill(STATUSES[r.status]?.[0] || r.status, STATUSES[r.status]?.[1]))),
  ];

  const body = [];

  if (r.reason === 'mineur') {
    body.push(h('div', { class: 'callout red' },
      h('b', {}, 'Protection des mineurs. '),
      "Traitez ce signalement en priorité absolue, dans l'heure. Si le doute est sérieux : suspendez immédiatement le compte, conservez les preuves (ne supprimez rien avant), puis transmettez aux autorités et notez la référence ci-dessous."));
  }

  body.push(h('div', { class: 'card' },
    h('h2', { text: 'Le signalement' }),
    h('dl', { class: 'kv', style: { marginTop: '10px' } },
      h('dt', {}, 'Motif'), h('dd', { text: REASONS[r.reason] || r.reason }),
      h('dt', {}, 'Déclarant'), h('dd', { text: r.reporter?.display_name || 'Compte supprimé' }),
      h('dt', {}, 'Compte visé'), h('dd', { text: `${target.display_name || 'Sans nom'}${target.age ? `, ${target.age} ans` : ''}` }),
      h('dt', {}, 'Antécédents'), h('dd', { text: `${target.reports_count} signalement(s) au total` }),
      r.resolution ? h('dt', {}, 'Décision') : null,
      r.resolution ? h('dd', { text: RESOLUTIONS[r.resolution] || r.resolution }) : null),
    r.details
      ? h('div', { class: 'callout', style: { marginTop: '12px' } }, h('b', {}, 'Description : '), r.details)
      : h('p', { class: 'hint', style: { marginTop: '10px' } }, 'Aucune description fournie.'),
    actionGroup('Consulter',
      h('button', { class: 'btn ghost sm', onclick: () => openUser(target.user_id, r.id) }, 'Ouvrir la fiche complète'),
      r.match_id ? h('button', { class: 'btn ghost sm', onclick: () => openConversation(r.match_id) }, 'Lire la conversation') : null)));

  body.push(h('div', { class: 'card' },
    h('h2', { text: 'Décider' }),
    h('p', { class: 'hint' }, 'Une sanction clôt automatiquement les signalements ouverts contre ce compte.'),
    actionGroup('Le dossier',
      r.status === 'pending'
        ? h('button', { class: 'btn sm', onclick: () => setStatus('in_review') }, 'Prendre en charge')
        : null,
      h('button', {
        class: 'btn ghost sm',
        onclick: async () => {
          const v = await ask({
            title: 'Classer sans suite',
            text: 'À utiliser quand le signalement ne révèle aucune infraction.',
            confirmLabel: 'Classer',
            fields: [{ name: 'notes', label: 'Note interne', type: 'text' }],
          });
          if (v) setStatus('dismissed', 'aucune_action', v.notes);
        },
      }, 'Classer sans suite'),
      h('button', {
        class: 'btn ghost sm',
        onclick: async () => {
          const v = await ask({
            title: 'Marquer comme traité',
            confirmLabel: 'Enregistrer',
            fields: [
              {
                name: 'resolution', label: 'Décision prise', type: 'select', options: Object.entries(RESOLUTIONS)
                  .filter(([k]) => k !== 'signale_autorites')
                  .map(([value, label]) => ({ value, label })),
              },
              { name: 'notes', label: 'Note interne', type: 'text' },
            ],
          });
          if (v) setStatus('actioned', v.resolution, v.notes);
        },
      }, 'Marquer traité')),
    actionGroup('Sanctionner le compte visé',
      h('button', { class: 'btn ghost sm', onclick: () => actWarn(target.user_id, r.id, reload) }, 'Avertir'),
      h('button', {
        class: 'btn ghost sm',
        onclick: () => actShadowban(target.user_id, !target.shadowbanned, reload),
      }, target.shadowbanned ? 'Ne plus masquer' : 'Masquer le compte'),
      target.is_banned
        ? h('button', { class: 'btn sm', onclick: () => actUnban(target.user_id, reload) }, 'Lever la sanction')
        : h('button', { class: 'btn danger sm', onclick: () => actBan(target.user_id, r.id, reload) }, 'Suspendre ou bannir'))));

  if (r.reason === 'mineur') {
    body.push(h('div', { class: 'card' },
      h('h2', { text: 'Transmission aux autorités' }),
      h('p', { class: 'hint' },
        "À faire dès qu'il existe un soupçon sérieux d'exploitation ou d'abus sexuel d'enfant. Notez la référence du dépôt (NCMEC, police, procureur) : elle prouve que Zola a rempli son obligation."),
      r.csae_escalated_at
        ? h('div', { class: 'callout', style: { marginTop: '12px' } },
            h('b', {}, 'Déjà transmis '), `le ${fmtFull(r.csae_escalated_at)}.`)
        : h('div', { class: 'btn-row', style: { marginTop: '12px' } },
            h('button', {
              class: 'btn danger sm',
              onclick: async () => {
                const v = await ask({
                  title: 'Transmettre aux autorités',
                  text: 'Confirme que le signalement a été déposé auprès des autorités compétentes.',
                  confirmLabel: 'Confirmer la transmission',
                  danger: true,
                  fields: [{ name: 'ref', label: 'Référence du dépôt', type: 'text', required: true, placeholder: 'Ex. NCMEC-2026-000123' }],
                });
                if (!v) return;
                try {
                  await rpc('admin_escalate_csae', { p_id: r.id, p_ref: v.ref });
                  toast('Transmission enregistrée.');
                  reload();
                } catch (e) { toast(errText(e), true); }
              },
            }, 'Enregistrer la transmission'))));
  }

  openDrawer(head, body);
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function statCard(label, value, sub, tone) {
  return h('div', { class: `stat${tone ? ` ${tone}` : ''}` },
    h('div', { class: 'label', text: label }),
    h('div', { class: 'value', text: value }),
    sub ? h('div', { class: 'sub', text: sub }) : null);
}

function barChart(series, key, label) {
  const max = Math.max(1, ...series.map((d) => d[key]));
  return h('div', { class: 'card' },
    h('h2', { text: label }),
    h('p', { class: 'hint' }, '14 derniers jours'),
    h('div', { class: 'bars' }, ...series.map((d) => h('div', {
      class: 'b',
      title: `${d.day} : ${d[key]}`,
      style: { height: `${Math.round((d[key] / max) * 100)}%` },
    }, d[key] ? h('span', { text: String(d[key]) }) : null))),
    h('div', { class: 'bars-x' }, ...series.map((d, i) => h('div', {
      text: i % 3 === 0 ? d.day.slice(8) + '/' + d.day.slice(5, 7) : '',
    }))));
}

function sectionHead(title, sub) {
  return h('div', { class: 'section-head' },
    h('h2', { text: title }),
    sub ? h('p', { class: 'hint', text: sub }) : null);
}

// Une file de travail : son nombre, ce qu'il veut dire, et un clic pour
// l'ouvrir. Une file vide passe au vert et ne réclame plus d'attention.
function queueTile({ label, value, sub, page, tone }) {
  const n = Number(value) || 0;
  return h('button', {
    type: 'button',
    class: `queue${n ? ` ${tone || 'blue'}` : ' done'}`,
    onclick: () => go(page),
  },
    h('span', { class: 'q-label', text: label }),
    h('span', { class: 'q-value', text: num(n) }),
    h('span', { class: 'q-sub', text: n ? sub : 'Rien en attente' }));
}

async function pageDashboard(root) {
  const [d, verif, mail, wait] = await Promise.all([
    rpc('admin_dashboard'),
    rpc('admin_list_verifications', { p_status: 'pending', p_limit: 1, p_offset: 0 }).catch(() => null),
    rpc('admin_inbound_mail_counts').catch(() => null),
    rpc('admin_list_waitlist', { p_limit: 1, p_offset: 0 }).catch(() => null),
  ]);
  state.dashboard = d;
  paintCounts(d);
  paintVerifCount();
  paintMailCount();

  const open = d.reports.pending + d.reports.in_review;
  const waiting = d.safety.csae_open + open + (verif?.pending || 0) + d.safety.photos_flagged + (mail?.new || 0);

  root.append(
    sectionHead('À traiter', waiting
      ? 'Les files de travail, de la plus urgente à la moins urgente. Un clic ouvre la file.'
      : 'Toutes les files sont vides. Rien ne vous attend.'),
    h('div', { class: 'queues' },
      queueTile({ label: 'Sécurité des enfants', value: d.safety.csae_open, sub: "Mineur suspecté, à traiter dans l'heure", page: 'safety', tone: 'red' }),
      queueTile({
        label: 'Signalements', value: open, page: 'reports', tone: 'orange',
        sub: d.reports.oldest_pending_hours ? `Le plus ancien attend depuis ${d.reports.oldest_pending_hours} h` : 'En attente de décision',
      }),
      queueTile({ label: 'Vérifications', value: verif?.pending, sub: 'Selfies à comparer aux photos', page: 'verifications', tone: 'blue' }),
      queueTile({ label: 'Photos', value: d.safety.photos_flagged, sub: 'Signalées par des membres', page: 'photos', tone: 'orange' }),
      queueTile({
        label: 'Courrier', value: mail?.new, page: 'mail', tone: mail?.securite_new ? 'red' : 'blue',
        sub: mail?.securite_new ? `Dont ${mail.securite_new} sur securite@` : 'Messages non traités',
      })),

    sectionHead('Communauté'),
    h('div', { class: 'grid k4' },
      statCard('Comptes', num(d.users.total), `${num(d.users.onboarded)} profils complets`),
      statCard('Actifs sur 24 h', num(d.users.active_24h), `${num(d.users.new_24h)} inscription(s) aujourd'hui`),
      statCard("Liste d'attente", wait ? num(wait.total) : '…', wait ? `${num(wait.week)} cette semaine` : 'Indisponible'),
      statCard('Soirées ouvertes', num(d.activity.events_active), 'En ce moment')),
    h('div', { class: 'grid k2', style: { marginTop: '14px' } },
      barChart(d.series, 'signups', 'Inscriptions'),
      barChart(d.series, 'reports', 'Signalements')),

    sectionHead('Activité et modération'),
    h('div', { class: 'grid k2' },
      h('div', { class: 'card' },
        h('h2', { text: 'Dernières 24 heures' }),
        h('dl', { class: 'kv stats', style: { marginTop: '10px' } },
          h('dt', {}, 'Swipes'), h('dd', { text: num(d.activity.swipes_24h) }),
          h('dt', {}, 'Matchs'), h('dd', { text: num(d.activity.matches_24h) }),
          h('dt', {}, 'Messages'), h('dd', { text: num(d.activity.messages_24h) }),
          h('dt', {}, 'Photos en ligne'), h('dd', { text: num(d.activity.photos_total) }))),
      h('div', { class: 'card' },
        h('h2', { text: 'Sanctions' }),
        h('dl', { class: 'kv stats', style: { marginTop: '10px' } },
          h('dt', {}, 'Bannissements sur 7 jours'), h('dd', { text: num(d.safety.bans_7d) }),
          h('dt', {}, 'Avertissements sur 7 jours'), h('dd', { text: num(d.safety.warnings_7d) }),
          h('dt', {}, 'Blocages entre membres, 7 jours'), h('dd', { text: num(d.safety.blocks_7d) }),
          h('dt', {}, 'Comptes bannis'), h('dd', { text: num(d.users.banned) }),
          h('dt', {}, 'Comptes masqués'), h('dd', { text: num(d.users.shadowbanned) })))));
}

function reportRow(r) {
  return h('tr', { class: 'clickable', onclick: () => openReport(r) },
    h('td', { 'data-l': 'Gravité' }, pill(SEVERITIES[r.severity]?.[0] || r.severity, SEVERITIES[r.severity]?.[1])),
    h('td', { 'data-l': 'Motif', text: REASONS[r.reason] || r.reason }),
    h('td', { 'data-l': 'Visé' }, h('div', { class: 'who-cell' }, avatar(r.reported.photo),
      h('div', {},
        h('div', { class: 'nm', text: r.reported.display_name || 'Sans nom' }),
        h('div', { class: 'meta' },
          [r.reported.age ? `${r.reported.age} ans` : null, r.reported.city].filter(Boolean).join(' · '),
          r.reported.reports_count > 1 ? ` · ${r.reported.reports_count} signalements` : '')))),
    h('td', { 'data-l': 'Compte' },
      r.reported.is_banned ? pill('Banni', 'red') : null,
      r.reported.shadowbanned ? pill('Masqué', 'orange') : null,
      !r.reported.is_banned && !r.reported.shadowbanned ? h('span', { class: 'hint' }, 'Actif') : null),
    h('td', { 'data-l': 'Déclarant', class: 'hint', text: r.reporter?.display_name || 'Compte supprimé' }),
    h('td', { 'data-l': 'Reçu', class: 'hint', text: ago(r.created_at) }),
    h('td', { 'data-l': 'Statut' }, pill(STATUSES[r.status]?.[0] || r.status, STATUSES[r.status]?.[1])));
}

function reportTable(items) {
  if (!items.length) return empty('Aucun signalement dans cette file.');
  return h('div', { class: 'table-wrap' },
    h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Gravité'), h('th', {}, 'Motif'), h('th', {}, 'Compte visé'),
        h('th', {}, 'État du compte'), h('th', {}, 'Déclarant'), h('th', {}, 'Reçu'), h('th', {}, 'Statut'))),
      h('tbody', {}, ...items.map(reportRow))));
}

async function pageReports(root) {
  const f = state.reportFilter;

  const chips = [
    ['open', 'Ouverts'],
    ['pending', 'En attente'],
    ['in_review', 'En cours'],
    ['closed', 'Clos'],
    [null, 'Tous'],
  ].map(([value, label]) => h('button', {
    class: `chip${f.status === value ? ' on' : ''}`,
    onclick: () => { f.status = value; go('reports'); },
  }, label));

  const reasonSelect = h('select', {
    style: { maxWidth: '220px' },
    onchange: (e) => { f.reason = e.target.value || null; go('reports'); },
  },
    h('option', { value: '' }, 'Tous les motifs'),
    ...Object.entries(REASONS).map(([v, l]) => h('option', { value: v, selected: f.reason === v }, l)));

  const data = await rpc('admin_list_reports', {
    p_status: f.status, p_severity: f.severity, p_reason: f.reason,
    p_search: f.search || null, p_limit: 100, p_offset: 0,
  });

  root.append(
    h('p', { class: 'page-intro' },
      "Tous les signalements déposés depuis l'application. Les cas « mineur suspecté » remontent automatiquement en tête et sont aussi listés dans Sécurité des enfants."),
    h('div', { class: 'chips' }, ...chips),
    h('div', { class: 'form-row' },
      h('div', { style: { flex: '0 0 auto' } }, reasonSelect),
      h('div', { class: 'hint', style: { flex: '1', textAlign: 'right' } }, `${data.total} résultat(s)`)),
    h('div', { class: 'card' }, reportTable(data.items)));
}

async function pageSafety(root) {
  const data = await rpc('admin_list_reports', {
    p_status: null, p_severity: null, p_reason: 'mineur',
    p_search: null, p_limit: 200, p_offset: 0,
  });
  const open = data.items.filter((r) => r.status === 'pending' || r.status === 'in_review');
  const done = data.items.filter((r) => r.status !== 'pending' && r.status !== 'in_review');

  root.append(
    h('p', { class: 'page-intro' },
      "Zola est interdit aux moins de 18 ans. Cette file regroupe tout ce qui touche à la présence d'un mineur ou à l'exploitation d'un enfant. C'est la seule file avec un délai imposé : une heure."),
    h('div', { class: 'callout red', style: { marginBottom: '16px' } },
      h('b', {}, 'Procédure. '),
      "1. Suspendre le compte visé dès qu'il y a doute sérieux, sans attendre la preuve. ",
      "2. Ne supprimer ni photos ni messages : ce sont les preuves. ",
      "3. Transmettre aux autorités et enregistrer la référence du dépôt. ",
      "4. Une fois la transmission faite, supprimer le compte. ",
      h('a', { href: 'securite-enfants.html', target: '_blank', rel: 'noopener' }, 'Politique publique de Zola')),
    h('div', { class: 'grid k4', style: { marginBottom: '16px' } },
      statCard('En attente de traitement', num(open.length), 'Délai cible : 1 heure', open.length ? 'alert' : 'good'),
      statCard('Transmis aux autorités', num(data.items.filter((r) => r.csae_escalated_at).length)),
      statCard('Total historique', num(data.total)),
      statCard('Référent sécurité enfants', 'Martin Bitha', 'securite@zola-rdc.com')),
    h('div', { class: 'card' },
      h('h2', { text: 'À traiter' }),
      h('p', { class: 'hint' }, 'Priorité absolue sur toute autre tâche de modération.'),
      h('div', { style: { marginTop: '12px' } }, reportTable(open))),
    h('div', { class: 'card' },
      h('h2', { text: 'Dossiers clos' }),
      h('div', { style: { marginTop: '12px' } }, done.length ? reportTable(done) : empty('Aucun dossier clos.'))));
}

async function pageUsers(root) {
  const f = state.userFilter;

  const chips = [
    ['all', 'Tous'],
    ['reported', 'Signalés'],
    ['banned', 'Bannis'],
    ['shadowbanned', 'Masqués'],
    ['warned', 'Avertis'],
    ['new', 'Nouveaux (7 j)'],
    ['premium', 'Premium'],
    ['incomplete', 'Profil incomplet'],
  ].map(([value, label]) => h('button', {
    class: `chip${f.filter === value ? ' on' : ''}`,
    onclick: () => { f.filter = value; go('users'); },
  }, label));

  const data = await rpc('admin_list_users', {
    p_search: f.search || null, p_filter: f.filter, p_limit: 100, p_offset: 0,
  });

  const rows = data.items.map((u) => h('tr', { class: 'clickable', onclick: () => openUser(u.user_id) },
    h('td', { 'data-l': 'Compte' }, h('div', { class: 'who-cell' }, avatar(u.photo),
      h('div', {},
        h('div', { class: 'nm', text: u.display_name || 'Sans nom' }),
        h('div', { class: 'meta', text: [u.public_id, u.age ? `${u.age} ans` : null, u.gender, u.city].filter(Boolean).join(' · ') || 'Profil incomplet' })))),
    h('td', { 'data-l': 'État' },
      u.is_banned ? pill('Banni', 'red') : null,
      u.shadowbanned ? pill('Masqué', 'orange') : null,
      u.warnings_count ? pill(`${u.warnings_count} avert.`, 'orange') : null,
      u.is_verified ? pill('Certifié', 'green') : null,
      !u.is_banned && !u.shadowbanned && !u.warnings_count && !u.is_verified
        ? h('span', { class: 'hint' }, 'En règle') : null),
    h('td', { 'data-l': 'Signalé' }, u.open_reports ? pill(`${u.open_reports} ouvert(s)`, 'red') : h('span', { class: 'hint' }, '—')),
    h('td', { 'data-l': 'Vu', class: 'hint', text: ago(u.last_active_at) }),
    h('td', { 'data-l': 'Inscrit', class: 'hint', text: fmtDate(u.created_at) })));

  root.append(
    h('p', { class: 'page-intro' },
      "Recherchez un compte, ouvrez sa fiche, agissez. La fiche réunit l'identité, les photos, l'activité, les signalements reçus et tout l'historique de modération."),
    h('div', { class: 'chips' }, ...chips),
    h('div', { class: 'form-row' },
      h('div', { class: 'hint', style: { flex: '1', textAlign: 'right' } },
        f.search ? `${data.total} compte(s) pour « ${f.search} »` : `${data.total} compte(s)`)),
    h('div', { class: 'card' },
      data.items.length
        ? h('div', { class: 'table-wrap' }, h('table', {},
            h('thead', {}, h('tr', {},
              h('th', {}, 'Compte'), h('th', {}, 'État'), h('th', {}, 'Signalements'),
              h('th', {}, 'Vu'), h('th', {}, 'Inscrit'))),
            h('tbody', {}, ...rows)))
        : empty('Aucun compte ne correspond.')));
}

// Doit rester aligné sur draw_gesture() (migration 031). Un code inconnu
// s'affiche tel quel plutôt que de disparaître : le modérateur doit toujours
// savoir quel geste il était censé voir.
const GESTURES = {
  main_ouverte: 'Main ouverte à côté du visage',
  pouce_leve: 'Pouce levé près de la joue',
  signe_v: 'Deux doigts levés, le signe V',
  main_joue: 'Main posée sur la joue',
  main_sur_tete: 'Main posée sur le haut de la tête',
  trois_doigts: 'Trois doigts levés',
  index_leve: 'Index levé vers le plafond',
  paume_face: 'Paume tournée vers la caméra',
};

// Le selfie vit dans un bucket privé : il faut une URL signée, valable le temps
// de l'examen. Elle n'est générée que pour un compte administrateur (policy
// storage), jamais partagée.
// Une seule requête pour toute la page. Un selfie déjà supprimé ne renvoie pas
// d'URL : la carte affiche alors « Selfie supprimé ».
async function selfieUrls(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return new Map();
  if (PREVIEW) return new Map(list.filter((p) => p.startsWith('http')).map((p) => [p, p]));
  const { data } = await supabase.storage.from('verifications').createSignedUrls(list, 600);
  return new Map((data || []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]));
}

// Comparaison plein écran : le selfie à gauche, les photos du profil à droite,
// en grand et à la même hauteur. Un clic sur une image la grossit à l'endroit
// visé, pour comparer un détail (grain de beauté, oreilles, ligne des cheveux).
function zoomStage(img) {
  const stage = h('div', { class: 'cmp-stage' }, img);
  const aim = (e) => {
    const r = stage.getBoundingClientRect();
    img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  };
  stage.addEventListener('click', (e) => { aim(e); stage.classList.toggle('zoomed'); });
  stage.addEventListener('mousemove', (e) => { if (stage.classList.contains('zoomed')) aim(e); });
  stage.reset = () => stage.classList.remove('zoomed');
  return stage;
}

// Image 3D du geste (Fluent Emoji, voir public/img/gestures/CREDITS.txt) :
// la même que celle que la personne a vue dans l'app avant son selfie.
const GESTURE_FILES = {
  main_ouverte: 'main_ouverte', pouce_leve: 'pouce_leve', signe_v: 'signe_v',
  main_joue: 'main_joue', main_sur_tete: 'paume_face', trois_doigts: 'trois_doigts',
  index_leve: 'index_leve', paume_face: 'paume_face',
};
function gestureImg(code, size) {
  const file = GESTURE_FILES[code];
  if (!file) return null;
  return h('img', {
    src: `/img/gestures/${file}.png`, alt: '', width: size, height: size,
    style: { width: `${size}px`, height: `${size}px`, objectFit: 'contain', flexShrink: '0' },
  });
}

function openCompare({ selfie, photos, name, gesture, gestureCode, pending, onDecide }) {
  let idx = 0;
  const selfieStage = selfie
    ? zoomStage(h('img', { src: selfie, alt: 'Selfie envoyé' }))
    : h('div', { class: 'cmp-stage cmp-empty' }, 'Selfie supprimé après examen');

  const photo = h('img', { alt: 'Photo du profil' });
  const photoStage = photos.length ? zoomStage(photo) : h('div', { class: 'cmp-stage cmp-empty' }, 'Aucune photo de profil.');
  const counter = h('span', { class: 'cmp-count' });
  const thumbs = photos.map((url, i) => h('button', { class: 'cmp-thumb', title: `Photo ${i + 1}`, onclick: () => show(i) },
    sharpImg(url, 56, 70)));

  function show(i) {
    if (!photos.length) return;
    idx = (i + photos.length) % photos.length;
    photo.src = photos[idx];
    photoStage.reset();
    counter.textContent = `${idx + 1} / ${photos.length}`;
    thumbs.forEach((t, j) => t.classList.toggle('on', j === idx));
  }

  const onKey = (e) => {
    if (document.querySelector('.modal-wrap')) return; // une confirmation est ouverte
    if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
    else if (e.key === 'ArrowRight') show(idx + 1);
    else if (e.key === 'ArrowLeft') show(idx - 1);
  };
  const prevOverflow = document.body.style.overflow;
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    document.body.style.overflow = prevOverflow;
    wrap.remove();
  };

  const decide = async (approve) => { if (await onDecide(approve)) close(); };
  const many = photos.length > 1;

  const wrap = h('div', { class: 'cmp-wrap', role: 'dialog', 'aria-label': `Comparer ${name}` },
    h('div', { class: 'cmp-top' },
      h('div', { class: 'cmp-title' },
        h('b', { text: name }),
        h('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          gestureImg(gestureCode, 34),
          h('span', {}, h('span', { class: 'cmp-muted' }, 'Geste demandé '), gesture))),
      h('button', { class: 'cmp-close', title: 'Fermer (Échap)', onclick: close }, '×')),
    h('div', { class: 'cmp-panes' },
      h('section', { class: 'cmp-pane' },
        h('div', { class: 'cmp-label' }, 'Selfie envoyé'),
        selfieStage),
      h('section', { class: 'cmp-pane' },
        h('div', { class: 'cmp-label' }, 'Photos du profil ', counter),
        h('div', { class: 'cmp-photo' },
          photoStage,
          many ? h('button', { class: 'cmp-nav prev', title: 'Photo précédente', onclick: () => show(idx - 1) }, '‹') : null,
          many ? h('button', { class: 'cmp-nav next', title: 'Photo suivante', onclick: () => show(idx + 1) }, '›') : null),
        many ? h('div', { class: 'cmp-thumbs' }, ...thumbs) : null)),
    h('div', { class: 'cmp-bottom' },
      h('span', { class: 'cmp-muted' }, 'Cliquez sur une image pour zoomer. Flèches pour changer de photo.'),
      pending
        ? h('div', { class: 'btn-row' },
            h('button', { class: 'btn danger', onclick: () => decide(false) }, 'Refuser'),
            h('button', { class: 'btn', onclick: () => decide(true) }, 'Valider'))
        : null));

  document.addEventListener('keydown', onKey, true);
  document.body.style.overflow = 'hidden';
  document.body.append(wrap);
  show(0);
}

async function pageVerifications(root) {
  const status = state.verifFilter || 'pending';
  const data = await rpc('admin_list_verifications', { p_status: status, p_limit: 60, p_offset: 0 });
  const urls = await selfieUrls(data.items.map((v) => v.selfie_path));

  const chips = [
    ['pending', 'À traiter'],
    ['approved', 'Validées'],
    ['rejected', 'Refusées'],
    ['', 'Toutes'],
  ].map(([value, label]) => h('button', {
    class: `chip${status === value ? ' on' : ''}`,
    onclick: () => { state.verifFilter = value; go('verifications'); },
  }, label));

  const cards = await Promise.all(data.items.map(async (v) => {
    const u = v.user;
    const url = urls.get(v.selfie_path) || null;
    const photos = u.photos.map((p) => photoUrl(p)).filter(Boolean);
    const gesture = GESTURES[v.gesture] || v.gesture;

    const decide = async (approve) => {
      const v2 = await ask({
        title: approve ? 'Valider la vérification' : 'Refuser la vérification',
        text: approve
          ? `Le badge « vérifié » sera posé sur le profil de ${u.display_name || 'ce compte'}. Le selfie est supprimé dans la foulée.`
          : "La personne verra le motif et pourra recommencer. Restez factuel : c'est un texte qu'elle lit.",
        confirmLabel: approve ? 'Valider' : 'Refuser',
        danger: !approve,
        fields: approve ? [] : [{
          name: 'reason', label: 'Motif', type: 'text', required: true,
          placeholder: 'Visage peu visible, geste non reproduit, photo floue...',
        }],
      });
      if (!v2) return false;
      try {
        await rpc('admin_review_verification', { p_id: v.id, p_approve: approve, p_reason: v2.reason || null });
        // Le selfie part maintenant : la décision est prise, la donnée
        // biométrique n'a plus de raison d'exister. La RPC ne renvoie pas le
        // chemin et sa suppression SQL dans storage.objects est refusée par
        // Supabase : c'est donc ici, avec le chemin déjà connu, qu'on l'efface.
        if (v.selfie_path) {
          const { error } = await supabase.storage.from('verifications').remove([v.selfie_path]);
          if (error) toast("Décision enregistrée, mais le selfie n'a pas pu être supprimé.", true);
        }
        toast(approve ? 'Profil vérifié.' : 'Demande refusée.');
        go('verifications');
        return true;
      } catch (e) { toast(errText(e), true); return false; }
    };

    const compare = () => openCompare({
      selfie: url, photos, gesture, gestureCode: v.gesture,
      name: `${u.display_name || 'Sans nom'}${u.age ? `, ${u.age} ans` : ''}`,
      pending: v.status === 'pending',
      onDecide: decide,
    });

    return h('div', { class: 'card' },
      h('div', { style: { display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' } },
        h('div', {},
          h('div', { class: 'hint', style: { marginBottom: '4px', fontWeight: '700' } }, 'Selfie envoyé'),
          url
            ? h('img', {
                src: url, alt: 'Selfie envoyé', title: 'Voir en plein écran', onclick: compare,
                style: { width: '170px', height: '215px', objectFit: 'cover', borderRadius: '12px', background: '#f7e4ee', cursor: 'zoom-in' },
              })
            : h('div', {
                class: 'hint',
                style: {
                  width: '170px', height: '215px', borderRadius: '12px', background: '#faf1f6',
                  display: 'grid', placeItems: 'center', textAlign: 'center', padding: '10px',
                },
              }, 'Selfie supprimé après examen')),
        h('div', { style: { flex: '1 1 260px', minWidth: 0 } },
          h('div', { class: 'hint', style: { marginBottom: '4px', fontWeight: '700' } }, 'Photos du profil'),
          h('div', { class: 'photo-strip' },
            ...(photos.length
              ? photos.slice(0, 4).map((p) => sharpImg(p, 104, 132, {
                  title: 'Voir en plein écran', onclick: compare,
                  style: { width: '104px', height: '132px', objectFit: 'cover', borderRadius: '10px', background: '#f7e4ee', cursor: 'zoom-in' },
                }))
              : [h('span', { class: 'hint' }, 'Aucune photo de profil.')])))),

      h('div', { style: { marginTop: '14px' } },
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          h('b', { text: `${u.display_name || 'Sans nom'}${u.age ? `, ${u.age} ans` : ''}` }),
          u.city ? h('span', { class: 'hint', text: u.city }) : null,
          u.is_verified ? pill('Déjà vérifié', 'green') : null,
          u.is_banned ? pill('Banni', 'red') : null,
          v.status === 'approved' ? pill('Validée', 'green') : null,
          v.status === 'rejected' ? pill('Refusée', 'grey') : null),
        h('div', { class: 'hint', style: { marginTop: '2px' } },
          `Demande reçue ${ago(v.created_at)}`,
          v.reviewed_at ? ` · traitée ${ago(v.reviewed_at)}` : ''),
        h('div', { class: 'callout', style: { marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' } },
          gestureImg(v.gesture, 44),
          h('span', {}, h('b', {}, 'Geste demandé : '), gesture)),
        v.reject_reason
          ? h('div', { class: 'hint', style: { marginTop: '8px' } }, `Motif du refus : ${v.reject_reason}`)
          : null,
        h('div', { class: 'btn-row', style: { marginTop: '12px' } },
          h('button', { class: 'btn ghost sm', onclick: compare }, 'Comparer en plein écran'),
          h('button', { class: 'btn ghost sm', onclick: () => openUser(u.user_id) }, 'Fiche du compte'),
          v.status === 'pending' ? h('button', { class: 'btn sm', onclick: () => decide(true) }, 'Valider') : null,
          v.status === 'pending' ? h('button', { class: 'btn danger sm', onclick: () => decide(false) }, 'Refuser') : null)));
  }));

  root.append(
    h('p', { class: 'page-intro' },
      "La personne prend un selfie en reproduisant un geste tiré au sort par l'application. Comparez-le aux photos du profil : c'est le même visage, et le geste est bien celui demandé ? Alors validez. Le selfie est supprimé dès la décision, on ne conserve pas de données biométriques."),
    h('div', { class: 'chips' }, ...chips),
    h('p', { class: 'hint', style: { marginBottom: '12px' } },
      `${data.total} demande(s) · ${data.pending} en attente`),
    cards.length ? h('div', { class: 'grid' }, ...cards) : h('div', { class: 'card' }, empty('Aucune demande dans cette file.')));
}

async function pagePhotos(root) {
  const data = await rpc('admin_list_photos', { p_status: state.photoFilter, p_limit: 120, p_offset: 0 });

  const chips = [
    [null, 'Toutes'],
    ['flagged', 'Signalées'],
    ['approved', 'Validées'],
  ].map(([value, label]) => h('button', {
    class: `chip${state.photoFilter === value ? ' on' : ''}`,
    onclick: () => { state.photoFilter = value; go('photos'); },
  }, label));

  const cards = data.items.map((p) => h('div', { class: 'card', style: { padding: '10px' } },
    sharpImg(photoUrl(p.path), 280, 190, {
      style: { width: '100%', height: '190px', objectFit: 'cover', borderRadius: '10px', background: '#f7e4ee' },
    }),
    h('div', { style: { marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
      h('b', { style: { fontSize: '.85rem' }, text: p.display_name || 'Sans nom' }),
      p.age ? h('span', { class: 'hint', text: `${p.age} ans` }) : null,
      p.is_banned ? pill('Banni', 'red') : null,
      p.status === 'flagged' ? pill('Signalée', 'orange') : null,
      p.open_reports ? pill(`${p.open_reports} signalement(s)`, 'red') : null),
    h('div', { class: 'hint', style: { marginTop: '2px' }, text: `Ajoutée ${ago(p.created_at)}` }),
    h('div', { class: 'btn-row', style: { marginTop: '10px' } },
      h('button', { class: 'btn ghost sm', onclick: () => openUser(p.user_id) }, 'Fiche'),
      h('button', {
        class: 'btn ghost sm',
        onclick: async () => {
          try {
            await rpc('admin_flag_photo', { p_photo_id: p.id, p_status: p.status === 'flagged' ? 'approved' : 'flagged' });
            toast(p.status === 'flagged' ? 'Photo validée.' : 'Photo signalée.');
            go('photos');
          } catch (e) { toast(errText(e), true); }
        },
      }, p.status === 'flagged' ? 'Valider' : 'Signaler'),
      h('button', { class: 'btn danger sm', onclick: () => actDeletePhoto(p.id, () => go('photos')) }, 'Supprimer'))));

  root.append(
    h('p', { class: 'page-intro' },
      "Les photos les plus récentes en premier. Marquez « signalée » ce qui demande un deuxième avis, supprimez ce qui viole les règles. La suppression retire aussi le fichier du stockage."),
    h('div', { class: 'chips' }, ...chips),
    h('p', { class: 'hint', style: { marginBottom: '12px' } }, `${data.total} photo(s)`),
    data.items.length
      ? h('div', { class: 'grid k4' }, ...cards)
      : h('div', { class: 'card' }, empty('Aucune photo.')));
}

async function pageConversation(root) {
  const input = h('input', { type: 'text', placeholder: 'Numéro de la conversation' });

  const recent = await rpc('admin_list_reports', {
    p_status: null, p_severity: null, p_reason: null, p_search: null, p_limit: 60, p_offset: 0,
  });
  const withConv = recent.items.filter((r) => r.match_id);

  root.append(
    h('p', { class: 'page-intro' },
      "Les conversations sont privées. On ne les ouvre que pour traiter un signalement, et chaque ouverture est enregistrée avec le nom de celui qui l'a faite."),
    h('div', { class: 'card' },
      h('h2', { text: 'Ouvrir une conversation' }),
      h('p', { class: 'hint' }, "Plus simple : depuis la fiche d'un compte ou depuis un signalement, cliquez sur « Lire la conversation », sans rien copier."),
      h('div', { class: 'form-row', style: { marginTop: '12px', marginBottom: '0' } },
        h('div', {}, input),
        h('div', { style: { flex: '0 0 auto' } },
          h('button', {
            class: 'btn', onclick: () => {
              const v = input.value.trim();
              if (v) openConversation(v);
            },
          }, 'Ouvrir')))),
    h('div', { class: 'card' },
      h('h2', { text: 'Signalements avec conversation jointe' }),
      h('p', { class: 'hint' }, "Quand la personne signale depuis un chat, l'application joint la conversation au dossier."),
      withConv.length
        ? h('div', { class: 'table-wrap', style: { marginTop: '12px' } }, h('table', {},
            h('tbody', {}, ...withConv.map((r) => h('tr', { class: 'clickable', onclick: () => openConversation(r.match_id) },
              h('td', {}, pill(REASONS[r.reason] || r.reason, SEVERITIES[r.severity]?.[1])),
              h('td', { text: r.reported.display_name || 'Sans nom' }),
              h('td', { class: 'hint', text: `signalé par ${r.reporter?.display_name || 'compte supprimé'}` }),
              h('td', { class: 'hint', text: ago(r.created_at) }))))))
        : empty('Aucun signalement avec conversation jointe.')));
}

async function pageEconomy(root) {
  const d = await rpc('admin_economy', { p_limit: 60, p_offset: 0, p_kind: null });

  const KINDS = {
    welcome: 'Bonus de bienvenue', recharge: 'Recharge', like_back: 'Like retour',
    dm: 'Message direct', event: 'Entrée soirée', admin: 'Ajustement admin', filter: 'Filtre payant',
    reward: 'Récompense', expire: 'Pièces expirées',
  };

  const CONFIG_LABELS = {
    like_back_cost: 'Liker en retour depuis Activité',
    dm_cost: 'Message direct après le quota gratuit',
    free_dm_quota: 'Messages directs offerts (au total)',
    welcome_coins: 'Bonus de bienvenue à l’inscription',
    incognito_cost: 'Mode incognito',
    filter_online_cost: 'Filtre « profils en ligne »',
    filter_goals_cost: 'Filtre « intentions »',
    filter_dm_cost: 'Filtre « messages directs »',
    pack_prestige_days: 'Validité des pièces du pack Prestige',
    reward_verify_account: 'Prime — compte vérifié',
    reward_share_app: "Prime — partage de l'application",
    reward_referral: 'Prime — filleul vérifié',
  };

  // Toutes les clés sont en pièces, sauf celles-ci.
  const CONFIG_UNITS = { free_dm_quota: 'messages', pack_prestige_days: 'jours' };

  root.append(
    h('p', { class: 'page-intro' },
      "Les pièces sont la monnaie de l'application. Les prix ci-dessous s'appliquent automatiquement dans l'application."),
    h('div', { class: 'grid k4' },
      statCard('En circulation', num(d.totals.circulating), `${num(d.totals.wallets)} portefeuille(s)`),
      statCard('Dépensées (30 j)', num(d.totals.spent_30d)),
      statCard('Créditées (30 j)', num(d.totals.granted_30d)),
      statCard('Prix du like retour', num(d.config.like_back_cost || 0), 'pièces')),
    h('div', { class: 'grid k2', style: { marginTop: '16px' } },
      h('div', { class: 'card' },
        h('h2', { text: 'Répartition sur 30 jours' }),
        d.by_kind.length
          ? h('div', { class: 'table-wrap', style: { marginTop: '10px' } }, h('table', {},
              h('thead', {}, h('tr', {}, h('th', {}, 'Type'), h('th', {}, 'Opérations'), h('th', {}, 'Volume'))),
              h('tbody', {}, ...d.by_kind.map((k) => h('tr', {},
                h('td', { 'data-l': 'Type', text: KINDS[k.kind] || k.kind }),
                h('td', { 'data-l': 'Opérations', text: num(k.count) }),
                h('td', { 'data-l': 'Volume', text: num(k.volume) }))))))
          : empty('Aucune opération récente.')),
      h('div', { class: 'card' },
        h('h2', { text: 'Plus gros dépensiers (30 j)' }),
        d.top_spenders.length
          ? h('div', { class: 'table-wrap', style: { marginTop: '10px' } }, h('table', {},
              h('tbody', {}, ...d.top_spenders.map((s) => h('tr', { class: 'clickable', onclick: () => openUser(s.user_id) },
                h('td', { text: s.display_name || 'Sans nom' }),
                h('td', { text: `${num(s.spent)} pièces` }))))))
          : empty('Aucune dépense.'))),
    h('div', { class: 'card' },
      h('h2', { text: 'Tarifs en vigueur' }),
      h('p', { class: 'hint' }, "Ces tarifs ne se changent pas depuis cette page : demandez au responsable technique, pour éviter toute erreur de prix."),
      h('div', { class: 'table-wrap', style: { marginTop: '10px' } }, h('table', {},
        h('tbody', {}, ...Object.entries(d.config).map(([k, v]) => h('tr', {},
          h('td', {}, h('b', { text: CONFIG_LABELS[k] || k })),
          h('td', { text: `${num(v)} ${CONFIG_UNITS[k] || 'pièces'}` }))))))),
    h('div', { class: 'card' },
      h('h2', { text: 'Dernières transactions' }),
      d.items.length
        ? h('div', { class: 'table-wrap', style: { marginTop: '10px' } }, h('table', {},
            h('thead', {}, h('tr', {},
              h('th', {}, 'Quand'), h('th', {}, 'Compte'), h('th', {}, 'Type'),
              h('th', {}, 'Montant'), h('th', {}, 'Solde'))),
            h('tbody', {}, ...d.items.map((t) => h('tr', { class: 'clickable', onclick: () => openUser(t.user_id) },
              h('td', { 'data-l': 'Quand', class: 'hint', text: fmtFull(t.created_at) }),
              h('td', { 'data-l': 'Compte', text: t.display_name || 'Sans nom' }),
              h('td', { 'data-l': 'Type', text: KINDS[t.kind] || t.kind }),
              h('td', { 'data-l': 'Montant', style: { color: t.amount < 0 ? '#dc2626' : '#16a34a', fontWeight: '600' }, text: `${t.amount > 0 ? '+' : ''}${num(t.amount)}` }),
              h('td', { 'data-l': 'Solde', class: 'hint', text: num(t.balance) }))))))
        : empty('Aucune transaction.')));
}

async function pageAudit(root) {
  const data = await rpc('admin_list_audit', { p_limit: 200, p_offset: 0, p_action: null });

  root.append(
    h('p', { class: 'page-intro' },
      "Tout ce que l'équipe a fait, avec la date, le motif et le nom de la personne, y compris la simple lecture d'une conversation. Cet historique ne peut être ni modifié ni effacé."),
    h('div', { class: 'card' },
      data.items.length
        ? h('div', { class: 'table-wrap' }, h('table', {},
            h('thead', {}, h('tr', {},
              h('th', {}, 'Quand'), h('th', {}, 'Action'), h('th', {}, 'Cible'),
              h('th', {}, 'Motif'), h('th', {}, 'Par'))),
            h('tbody', {}, ...data.items.map((a) => h('tr', {
              class: a.target_user_id ? 'clickable' : '',
              onclick: () => a.target_user_id && openUser(a.target_user_id),
            },
              h('td', { 'data-l': 'Quand', class: 'hint', text: fmtFull(a.created_at) }),
              h('td', { 'data-l': 'Action' }, pill(AUDIT_LABELS[a.action] || a.action,
                a.action.includes('ban') || a.action.includes('deleted') ? 'red'
                  : a.action.includes('csae') ? 'red'
                  : a.action.includes('warn') ? 'orange' : 'grey')),
              h('td', { 'data-l': 'Cible', text: a.target_name || a.metadata?.name || (a.target_id ? a.target_id.slice(0, 8) : '—') }),
              h('td', { 'data-l': 'Motif', class: 'hint', text: a.reason || '—' }),
              h('td', { 'data-l': 'Par', class: 'hint', text: a.actor }))))))
        : empty('Aucune action enregistrée pour le moment.')));
}

async function pageTeam(root) {
  const admins = await rpc('admin_list_admins');

  const ROLES = { owner: 'Propriétaire', admin: 'Administrateur', moderator: 'Modérateur' };

  const rows = admins.map((a) => h('tr', {},
    h('td', { 'data-l': 'Membre' },
      h('div', { class: 'nm', text: a.full_name || a.email }),
      h('div', { class: 'meta hint', text: a.full_name ? a.email : '' })),
    h('td', { 'data-l': 'Rôle' }, pill(ROLES[a.role] || a.role, a.role === 'owner' ? 'lime' : 'grey')),
    h('td', { 'data-l': 'Accès' }, a.is_active ? pill('Actif', 'green') : pill('Désactivé', 'grey')),
    h('td', { 'data-l': 'Incognito' },
      incognitoActive(a.incognito_until)
        ? h('div', {},
            pill(a.incognito_on ? 'Actif' : 'Offert, éteint', 'lime'),
            h('div', { class: 'hint', text: `jusqu'au ${fmtDate(a.incognito_until)}` }))
        : isAdminPlus()
          ? h('button', {
              class: 'btn ghost sm',
              onclick: () => actGrantIncognito(a.user_id, () => go('team')),
            }, 'Offrir')
          : h('span', { class: 'hint' }, 'Aucun')),
    h('td', { 'data-l': 'Activité', class: 'hint', text: `${a.actions_30d} action(s) sur 30 j` }),
    h('td', { 'data-l': 'Connexion', class: 'hint', text: a.last_sign_in_at ? ago(a.last_sign_in_at) : 'jamais' }),
    h('td', {}, isOwner() && a.user_id !== state.me.user_id
      ? h('div', { class: 'btn-row' },
          h('button', {
            class: 'btn ghost sm',
            onclick: async () => {
              const v = await ask({
                title: 'Changer le rôle',
                text: `Modérateur : signalements, sanctions, photos. Administrateur : en plus, l'économie et la suppression de comptes. Propriétaire : en plus, la gestion de l'équipe.`,
                confirmLabel: 'Enregistrer',
                fields: [{
                  name: 'role', label: 'Rôle', type: 'select',
                  options: Object.entries(ROLES).map(([value, label]) => ({ value, label })), value: a.role,
                }],
              });
              if (!v) return;
              try { await rpc('admin_set_admin_role', { p_user_id: a.user_id, p_role: v.role }); toast('Rôle modifié.'); go('team'); }
              catch (e) { toast(errText(e), true); }
            },
          }, 'Rôle'),
          h('button', {
            class: 'btn ghost sm',
            onclick: async () => {
              try {
                await rpc('admin_set_admin_active', { p_user_id: a.user_id, p_active: !a.is_active });
                toast(a.is_active ? 'Accès désactivé.' : 'Accès réactivé.');
                go('team');
              } catch (e) { toast(errText(e), true); }
            },
          }, a.is_active ? 'Désactiver' : 'Réactiver'),
          h('button', {
            class: 'btn danger sm',
            onclick: async () => {
              const v = await ask({
                title: "Retirer de l'équipe",
                text: "Le compte utilisateur reste, seul son accès à cet espace d'administration est retiré.",
                confirmLabel: 'Retirer', danger: true,
              });
              if (!v) return;
              try { await rpc('admin_remove_admin', { p_user_id: a.user_id }); toast('Retiré.'); go('team'); }
              catch (e) { toast(errText(e), true); }
            },
          }, 'Retirer'))
      : h('span', { class: 'hint' }, a.user_id === state.me.user_id ? 'Vous' : '—'))));

  root.append(
    h('p', { class: 'page-intro' },
      "Trois rôles. Modérateur : signalements, sanctions, photos, conversations. Administrateur : en plus, l'économie et la suppression définitive de comptes. Propriétaire : en plus, la gestion de l'équipe."),
    h('div', { class: 'callout', style: { marginBottom: '16px' } },
      h('b', {}, "Incognito offert. "),
      "Un modérateur qui utilise l'application avec son vrai compte finit par être reconnu, puis pris à partie. Offrez-lui l'abonnement Incognito : son profil n'apparaît plus chez les autres, et lui continue de tout voir."),
    isOwner()
      ? h('div', { class: 'card' },
          h('h2', { text: 'Ajouter un membre' }),
          h('p', { class: 'hint' }, "La personne doit déjà avoir un compte Zola créé avec cette adresse e-mail."),
          h('div', { class: 'form-row', style: { marginTop: '12px', marginBottom: '0' } },
            h('div', {}, h('label', { class: 'field' }, 'Adresse e-mail'), h('input', { type: 'email', id: 'new-admin-email' })),
            h('div', { style: { maxWidth: '190px' } }, h('label', { class: 'field' }, 'Rôle'),
              h('select', { id: 'new-admin-role' },
                h('option', { value: 'moderator' }, 'Modérateur'),
                h('option', { value: 'admin' }, 'Administrateur'),
                h('option', { value: 'owner' }, 'Propriétaire'))),
            h('div', { style: { maxWidth: '200px' } }, h('label', { class: 'field' }, 'Nom (optionnel)'),
              h('input', { type: 'text', id: 'new-admin-name' })),
            h('div', { style: { flex: '0 0 auto' } }, h('button', {
              class: 'btn',
              onclick: async () => {
                const email = $('new-admin-email').value.trim();
                if (!email) { toast('Indiquez une adresse e-mail.', true); return; }
                try {
                  await rpc('admin_add_admin', {
                    p_email: email,
                    p_role: $('new-admin-role').value,
                    p_full_name: $('new-admin-name').value.trim() || null,
                  });
                  toast('Membre ajouté.');
                  go('team');
                } catch (e) { toast(errText(e), true); }
              },
            }, 'Ajouter'))))
      : null,
    h('div', { class: 'card' },
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'Membre'), h('th', {}, 'Rôle'), h('th', {}, 'Accès'), h('th', {}, 'Incognito'),
          h('th', {}, 'Activité'), h('th', {}, 'Dernière connexion'), h('th', {}, ''))),
        h('tbody', {}, ...rows)))));
}

// ---------------------------------------------------------------------------
// Soirées
// ---------------------------------------------------------------------------

// L'accès est ouvert si la soirée est active ET que la fin n'est pas passée.
// Ce sont exactement les deux conditions vérifiées par scan_event().
const accessOpen = (ev) => ev.is_active && (!ev.ends_at || new Date(ev.ends_at) > new Date());

// Plafond par transaction de l'accepteur (Interswitch, via MultiPay). Au-delà,
// le portail ne rend pas la page de paiement : il répond responseCode Z1 et
// affiche « Incorrect Transaction », un message qui accuse les coordonnées
// bancaires alors que le refus porte sur le montant. Sans cet avertissement,
// le prix impayable ne se découvre qu'à l'entrée, par le client.
//
// Mesuré le 2026-07-31 sur le marchand SANDBOX MX228251 en rejouant l'appel
// POST /collections/w/pay : 490 000 CDF passe, 500 000 non, bascule vers
// 496 000. À RECONFIRMER auprès de MultiPay le jour où les identifiants
// marchand LIVE sont posés : le plafond d'un vrai marchand n'est pas celui
// d'un marchand de démonstration.
const MAX_ENTRY_CDF = 490000;

// Avertit et laisse trancher plutôt que de bloquer : le plafond ci-dessus est
// une mesure, pas une règle du produit, et il changera en LIVE.
function priceAccepted(cdf) {
  if (cdf <= MAX_ENTRY_CDF) return true;
  return confirm(
    `${num(cdf)} CDF dépasse le plafond connu du service de paiement (${num(MAX_ENTRY_CDF)} CDF par transaction).\n\n` +
    "Au-delà, le paiement échoue et le client voit « Incorrect Transaction » à l'entrée, sans pouvoir payer.\n\n" +
    'Enregistrer ce prix quand même ?',
  );
}

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function pageEvents(root) {
  const { data: events, error } = PREVIEW
    ? { data: structuredClone(previewData.events), error: null }
    : await supabase
      .from('events')
      .select('id, name, price_cdf, qr_token, is_active, ends_at, created_at')
      .order('created_at', { ascending: false });

  if (error) { root.append(h('div', { class: 'card' }, empty('Erreur de chargement des soirées.'))); return; }

  const counts = {};
  const { data: attendees } = PREVIEW ? { data: [] } : await supabase.from('event_attendees').select('event_id');
  for (const a of attendees ?? []) counts[a.event_id] = (counts[a.event_id] ?? 0) + 1;

  const name = h('input', { type: 'text', maxlength: '80', placeholder: 'Soirée Zola au Fleuve Congo' });
  const price = h('input', { type: 'number', min: '0', step: '100', placeholder: '10000' });
  const ends = h('input', { type: 'datetime-local' });

  const create = async () => {
    if (!name.value.trim()) { toast('Le nom est obligatoire.', true); return; }
    const p = parseInt(price.value, 10);
    if (!Number.isFinite(p) || p < 0) { toast('Indiquez un prix en CDF (0 = entrée libre).', true); return; }
    if (!priceAccepted(p)) return;
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error: err } = await supabase.from('events').insert({
      name: name.value.trim(), price_cdf: p,
      ends_at: ends.value ? new Date(ends.value).toISOString() : null,
      created_by: session?.user?.id ?? null,
    }).select('*').single();
    if (err) { toast('Création impossible.', true); return; }
    toast('Soirée créée.');
    openEventDetail(data, 0);
  };

  const rows = (events || []).map((ev) => {
    const open = accessOpen(ev);
    return h('tr', { class: 'clickable', onclick: () => openEventDetail(ev, counts[ev.id] ?? 0) },
      h('td', { 'data-l': 'Soirée' }, h('b', { text: ev.name })),
      h('td', { 'data-l': 'Entrée', text: ev.price_cdf > 0 ? `${num(ev.price_cdf)} CDF` : 'Entrée libre' }),
      h('td', { 'data-l': 'Présents', text: `${counts[ev.id] ?? 0} participant(s)` }),
      h('td', { 'data-l': 'Fin', class: 'hint', text: ev.ends_at ? `fin ${fmtFull(ev.ends_at)}` : 'sans date de fin' }),
      h('td', { 'data-l': 'Accès' }, pill(open ? 'Accès ouvert' : 'Accès fermé', open ? 'green' : 'grey')));
  });

  root.append(
    h('p', { class: 'page-intro' },
      "Une soirée, un code QR. Il faut un compte Zola pour scanner : c'est le passe. Le scan ouvre le portail de paiement au prix fixé ici, réglable par carte ou Mobile Money ; l'entrée se paie une seule fois, puis on sort et on revient librement. Sur place, l'onglet Rencontres ne montre que les personnes présentes ; ce qu'on y recale s'efface à la fin de la soirée, les matchs restent."),
    h('div', { class: 'card' },
      h('h2', { text: 'Créer une soirée' }),
      h('div', { class: 'form-row', style: { marginTop: '12px', marginBottom: '0' } },
        h('div', {}, h('label', { class: 'field' }, 'Nom'), name),
        h('div', { style: { maxWidth: '180px' } }, h('label', { class: 'field' }, `Prix d'entrée (CDF, max ${num(MAX_ENTRY_CDF)})`), price),
        h('div', { style: { maxWidth: '230px' } }, h('label', { class: 'field' }, 'Fin (optionnel)'), ends),
        h('div', { style: { flex: '0 0 auto' } }, h('button', { class: 'btn', onclick: create }, 'Créer')))),
    h('div', { class: 'card' },
      rows.length
        ? h('div', { class: 'table-wrap' }, h('table', {},
            h('thead', {}, h('tr', {},
              h('th', {}, 'Soirée'), h('th', {}, 'Entrée'), h('th', {}, 'Présents'),
              h('th', {}, 'Fin'), h('th', {}, 'Accès'))),
            h('tbody', {}, ...rows)))
        : empty('Aucune soirée pour le moment.')));
}

async function openEventDetail(ev, count) {
  state.currentEvent = ev;

  // Affiche de la soirée : nom de l'endroit, info d'entrée, code QR en bas.
  // Les deux textes se modifient ici sans toucher à la soirée elle-même.
  const defaultInfo = () => {
    const e = state.currentEvent;
    const entry = e.price_cdf > 0 ? `Entrée ${num(e.price_cdf)} CDF` : 'Entrée libre';
    return e.ends_at ? `${entry} · Jusqu'au ${fmtFull(e.ends_at)}` : entry;
  };
  const poster = h('canvas', { class: 'poster-preview', 'aria-label': "Aperçu de l'affiche" });
  const posterTitle = h('input', { type: 'text', maxlength: '60', value: ev.name });
  const posterInfo = h('input', { type: 'text', maxlength: '80', value: defaultInfo() });
  let posterTimer = 0;
  const paintPoster = () => drawEventPoster(poster, {
    title: posterTitle.value.trim() || ev.name,
    info: posterInfo.value.trim(),
    token: ev.qr_token,
  });
  for (const input of [posterTitle, posterInfo]) {
    input.addEventListener('input', () => {
      clearTimeout(posterTimer);
      posterTimer = setTimeout(paintPoster, 200);
    });
  }
  await paintPoster();

  const saveCanvas = (canvas, filename) => canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
  const downloadPoster = async () => {
    await paintPoster();
    saveCanvas(poster, `affiche-${posterFileName(posterTitle.value || ev.name)}.png`);
  };
  const downloadQr = async () => {
    const qr = document.createElement('canvas');
    await drawQrOnly(qr, ev.qr_token);
    saveCanvas(qr, `qr-${posterFileName(ev.name)}.png`);
  };
  // Impression : l'affiche seule, pleine page A5 (ou A4, elle garde ses
  // proportions).
  const printPoster = async () => {
    await paintPoster();
    const win = window.open('', '_blank');
    if (!win) { toast("Autorisez l'ouverture d'une fenêtre pour imprimer.", true); return; }
    win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Affiche ${posterTitle.value.replace(/</g, '')}</title>
<style>@page{size:A5;margin:0}html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center;background:#fff}
img{max-width:100%;max-height:100vh}</style></head><body><img src="${poster.toDataURL('image/png')}" alt=""></body></html>`);
    win.document.close();
    const img = win.document.querySelector('img');
    const go = () => { win.focus(); win.print(); };
    if (img.complete) go(); else img.addEventListener('load', go);
  };

  const endsInput = h('input', { type: 'datetime-local', value: toLocalInput(ev.ends_at) });
  const priceInput = h('input', { type: 'number', min: '0', step: '100', value: String(ev.price_cdf ?? 0) });
  const priceLine = h('p', { class: 'hint', style: { margin: '0' } });
  const stateLine = h('p', { style: { fontWeight: '700', margin: '0 0 4px' } });
  const accessBtn = h('button', { class: 'btn danger sm' });

  // Bilan de la soirée : ce qu'on montre à un partenaire. Entrées, likes et
  // matchs nés sur place, recettes. Les recalages ne sont comptés que tant
  // que la soirée est ouverte : ils s'effacent avec elle (migration 056).
  const statsBox = h('div', { class: 'grid k2', style: { marginTop: '12px', gap: '10px' } });
  const attendeesBox = h('div', { style: { marginTop: '12px' } });
  const paintStats = async () => {
    let s;
    try { s = await rpc('admin_event_stats', { p_event: state.currentEvent.id }); }
    catch { statsBox.replaceChildren(empty('Bilan indisponible.')); return; }
    statsBox.replaceChildren(
      statCard('Entrées', num(s.entries), `${num(s.verified)} profil(s) vérifié(s)`),
      statCard('Matchs sur place', num(s.matches), `${num(s.likes)} like(s) échangé(s)`),
      statCard('Encaissé', `${num(s.revenue_cdf)} CDF`, 'Entrées réglées en ligne'),
      statCard('Recalages en cours', s.open ? num(s.passes_live) : '—',
        s.open ? 'Effacés à la fin de la soirée' : 'Soirée terminée : historique effacé'));
    const rows = (s.attendees || []).map((a) => h('tr', { class: 'clickable', onclick: () => openUser(a.user_id) },
      h('td', { 'data-l': 'Participant' }, h('div', { class: 'who-cell' }, avatar(a.photo),
        h('div', {}, h('b', { text: a.display_name || '—' }),
          h('div', { class: 'hint', text: a.public_id || '' })))),
      h('td', { 'data-l': 'Vérifié' }, a.is_verified ? pill('Vérifié', 'green') : pill('Non vérifié', 'grey')),
      h('td', { 'data-l': 'Entrée', class: 'hint', text: fmtFull(a.joined_at) })));
    attendeesBox.replaceChildren(rows.length
      ? h('div', { class: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Participant'), h('th', {}, 'Vérifié'), h('th', {}, 'Entrée'))),
          h('tbody', {}, ...rows)))
      : empty('Personne n’est encore entré.'));
  };

  const paint = () => {
    const open = accessOpen(state.currentEvent);
    stateLine.textContent = open ? 'Accès ouvert : le code QR fonctionne.' : 'Accès fermé : le code QR ne fonctionne plus.';
    stateLine.style.color = open ? '#16a34a' : '#dc2626';
    accessBtn.textContent = open ? "Mettre fin à l'accès" : "Rouvrir l'accès";
    accessBtn.className = open ? 'btn danger sm' : 'btn sm';
    endsInput.value = toLocalInput(state.currentEvent.ends_at);
    priceInput.value = String(state.currentEvent.price_cdf ?? 0);
    priceLine.textContent = state.currentEvent.price_cdf > 0
      ? `Entrée à ${num(state.currentEvent.price_cdf)} CDF, réglée sur le portail de paiement.`
      : 'Entrée libre : le scan donne accès sans passer par le paiement.';
  };

  // Le prix ne vaut que pour les entrées à venir : celles déjà payées le sont
  // au tarif du moment, on ne rembourse ni ne réclame après coup.
  const savePrice = async () => {
    const p = parseInt(priceInput.value, 10);
    if (!Number.isFinite(p) || p < 0) { toast('Indiquez un prix en CDF (0 = entrée libre).', true); return; }
    if (!priceAccepted(p)) return;
    const patch = { price_cdf: p };
    const { error } = await supabase.from('events').update(patch).eq('id', state.currentEvent.id);
    if (error) { toast('Enregistrement impossible.', true); return; }
    Object.assign(state.currentEvent, patch);
    paint();
    toast(p > 0 ? `Entrée fixée à ${num(p)} CDF.` : 'Entrée passée en accès libre.');
  };

  accessBtn.addEventListener('click', async () => {
    const ev2 = state.currentEvent;
    const close = accessOpen(ev2);
    if (close && !confirm("Mettre fin à l'accès maintenant ? Le code QR cessera immédiatement de fonctionner, le paquet de la soirée disparaîtra de l'application et les recalages faits ce soir seront effacés. Les matchs restent.")) return;
    // Fermer : désactiver ET dater la fin, sinon une fin future rouvrirait.
    // Rouvrir : réactiver et effacer une fin déjà passée.
    const patch = close
      ? { is_active: false, ends_at: new Date().toISOString() }
      : {
          is_active: true,
          ends_at: ev2.ends_at && new Date(ev2.ends_at) <= new Date() ? null : ev2.ends_at,
        };
    const { error } = await supabase.from('events').update(patch).eq('id', ev2.id);
    if (error) { toast('Modification impossible.', true); return; }
    Object.assign(state.currentEvent, patch);
    paint();
    paintStats();
    toast(close ? "Accès fermé." : "Accès rouvert.");
  });

  const saveEnds = async () => {
    const iso = endsInput.value ? new Date(endsInput.value).toISOString() : null;
    const patch = { ends_at: iso };
    if (iso && new Date(iso) > new Date()) patch.is_active = true;
    const { error } = await supabase.from('events').update(patch).eq('id', state.currentEvent.id);
    if (error) { toast('Enregistrement impossible.', true); return; }
    Object.assign(state.currentEvent, patch);
    paint();
    paintStats();
    toast(iso ? 'Fin programmée.' : 'Date de fin retirée.');
  };

  paint();
  paintStats();

  openDrawer(
    [h('div', {}, h('div', { style: { fontWeight: '700', fontSize: '1.02rem' }, text: ev.name }),
      h('div', {
        class: 'hint',
        text: `${ev.price_cdf > 0 ? `${num(ev.price_cdf)} CDF par entrée` : 'Entrée libre'} · ${count} participant(s)`,
      }))],
    [
      h('div', { class: 'card' },
        h('h2', { text: 'Bilan' }),
        h('p', { class: 'hint' }, "Ce que la soirée a produit : les entrées, les likes et les matchs nés entre participants pendant la soirée, et ce qui a été encaissé. Les matchs survivent à la soirée, les recalages non."),
        statsBox,
        attendeesBox),
      h('div', { class: 'card' },
        h('h2', { text: "Prix d'entrée" }),
        priceLine,
        h('p', { class: 'hint' }, "Le montant est encaissé sur le portail de paiement (carte ou Mobile Money) juste après le scan. Un changement de prix ne vaut que pour les entrées suivantes."),
        h('p', { class: 'hint' }, `Plafond du service de paiement : ${num(MAX_ENTRY_CDF)} CDF par transaction. Au-dessus, le paiement est refusé à l'entrée.`),
        h('div', { class: 'form-row', style: { marginTop: '12px', marginBottom: '0' } },
          h('div', { style: { maxWidth: '200px' } }, h('label', { class: 'field' }, 'Prix en CDF (0 = libre)'), priceInput),
          h('div', { style: { flex: '0 0 auto' } }, h('button', { class: 'btn ghost sm', onclick: savePrice }, 'Enregistrer')))),
      h('div', { class: 'card' },
        h('h2', { text: 'Affiche et code QR' }),
        h('p', { class: 'hint' }, "L'affiche à poser à l'entrée : le nom de l'endroit, l'info d'entrée, et le code QR en bas. Les participants le scannent depuis l'app Zola."),
        h('div', { class: 'poster-layout' },
          poster,
          h('div', { class: 'poster-form' },
            h('label', { class: 'field' }, "Nom sur l'affiche"), posterTitle,
            h('label', { class: 'field', style: { marginTop: '12px' } }, "Ligne d'info"), posterInfo,
            h('p', { class: 'hint', style: { marginTop: '6px' } }, "Prix, horaires, adresse. Ces textes ne servent qu'à l'affiche."),
            h('div', { class: 'btn-row', style: { marginTop: '14px' } },
              h('button', { class: 'btn sm', onclick: downloadPoster }, "Télécharger l'affiche"),
              h('button', { class: 'btn ghost sm', onclick: printPoster }, 'Imprimer'),
              h('button', { class: 'btn ghost sm', onclick: downloadQr }, 'QR seul'))))),
      h('div', { class: 'card' },
        h('h2', { text: "Accès" }),
        stateLine,
        h('p', { class: 'hint' }, "La soirée se termine à l'heure programmée, ou plus tôt avec le bouton ci-dessous ; prolonger une soirée encore ouverte ne change rien pour les participants. À la fin, personne ne peut plus entrer, le paquet de la soirée disparaît de l'application et les recalages faits ce soir s'effacent. Les matchs et les conversations restent."),
        h('div', { class: 'form-row', style: { marginTop: '12px', marginBottom: '0' } },
          h('div', { style: { maxWidth: '240px' } }, h('label', { class: 'field' }, 'Fin programmée'), endsInput),
          h('div', { style: { flex: '0 0 auto' } }, h('button', { class: 'btn ghost sm', onclick: saveEnds }, 'Enregistrer'))),
        h('div', { class: 'btn-row', style: { marginTop: '12px' } }, accessBtn)),
      h('div', { class: 'card' },
        h('h2', { text: 'Supprimer' }),
        h('p', { class: 'hint' }, 'Les entrées déjà payées ne sont pas remboursées.'),
        h('div', { class: 'btn-row', style: { marginTop: '10px' } },
          h('button', {
            class: 'btn danger sm',
            onclick: async () => {
              if (!confirm('Supprimer définitivement cette soirée ?')) return;
              const { error } = await supabase.from('events').delete().eq('id', state.currentEvent.id);
              if (error) { toast('Suppression impossible.', true); return; }
              closeDrawer();
              toast('Soirée supprimée.');
              go('events');
            },
          }, 'Supprimer la soirée'))),
    ]);
}

// ---------------------------------------------------------------------------
// Blog
// ---------------------------------------------------------------------------

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function pageBlog(root) {
  const { data: posts, error } = await supabase
    .from('posts')
    .select('id, slug, title, published, published_at, updated_at')
    .order('updated_at', { ascending: false });

  root.append(
    h('p', { class: 'page-intro' }, "Les articles publiés apparaissent sur zola-rdc.com/blog. Lien à partager pour un article : zola-rdc.com/article/son-identifiant. Le site les affiche aussitôt, et les rend plus rapides à la prochaine construction."),
    h('div', { class: 'card' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        h('h2', { text: 'Articles', style: { flex: '1' } }),
        h('button', { class: 'btn sm', onclick: () => openPostEditor(null) }, 'Nouvel article')),
      error
        ? empty('Erreur de chargement.')
        : (posts || []).length
          ? h('div', { class: 'table-wrap', style: { marginTop: '12px' } }, h('table', {},
              h('tbody', {}, ...posts.map((p) => h('tr', { class: 'clickable', onclick: () => openPostEditor(p.id) },
                h('td', { 'data-l': 'Article' }, h('b', { text: p.title }), h('div', { class: 'hint', text: `/${p.slug}` })),
                h('td', { 'data-l': 'Modifié', class: 'hint', text: ago(p.updated_at) }),
                h('td', { 'data-l': 'État' }, pill(p.published ? 'Publié' : 'Brouillon', p.published ? 'green' : 'grey')))))))
          : empty('Aucun article. Créez le premier.')));
}

async function openPostEditor(postId) {
  let post = null;
  if (postId) {
    const { data, error } = await supabase.from('posts').select('*').eq('id', postId).single();
    if (error) { toast('Chargement impossible.', true); return; }
    post = data;
  }
  state.currentPost = post;

  const fTitle = h('input', { type: 'text', maxlength: '200', value: post?.title || '' });
  const fSlug = h('input', { type: 'text', maxlength: '200', value: post?.slug || '' });
  const fExcerpt = h('input', { type: 'text', maxlength: '400', value: post?.excerpt || '' });
  const fCover = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  const fContent = h('textarea', { style: { minHeight: '320px', fontFamily: 'Consolas, monospace', fontSize: '.85rem' } });
  fContent.value = post?.content || '';
  const fPublished = h('input', { type: 'checkbox' });
  fPublished.checked = !!post?.published;

  fTitle.addEventListener('input', () => { if (!post) fSlug.value = slugify(fTitle.value); });

  const save = async () => {
    const title = fTitle.value.trim();
    const slug = fSlug.value.trim();
    if (!title) { toast('Le titre est obligatoire.', true); return; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { toast("Adresse invalide : minuscules, chiffres et tirets seulement.", true); return; }
    let cover_url = post?.cover_url ?? null;
    let savedNote = '';
    try {
      const file = fCover.files[0];
      if (file) {
        const cover = await prepareCover(file);
        const path = `covers/${Date.now()}.${cover.ext}`;
        const { error } = await supabase.storage.from('blog').upload(path, cover.blob, {
          contentType: cover.type,
          cacheControl: COVER_CACHE_SECONDS,
        });
        if (error) throw error;
        cover_url = supabase.storage.from('blog').getPublicUrl(path).data.publicUrl;
        savedNote = cover.note;
      }
      const published = fPublished.checked;
      const payload = {
        title, slug, excerpt: fExcerpt.value.trim(), content: fContent.value, cover_url, published,
        published_at: published ? (post?.published_at ?? new Date().toISOString()) : null,
      };
      let error;
      if (post) ({ error } = await supabase.from('posts').update(payload).eq('id', post.id));
      else {
        const res = await supabase.from('posts').insert(payload).select('*').single();
        error = res.error;
        if (!error) post = res.data;
      }
      if (error) throw error;
      toast('Enregistré.' + savedNote);
      go('blog');
      closeDrawer();
    } catch (e) {
      toast(e?.code === '23505' ? 'Cette adresse est déjà utilisée par un autre article.' : "Erreur lors de l'enregistrement.", true);
    }
  };

  openDrawer(
    [h('div', {}, h('div', { style: { fontWeight: '700', fontSize: '1.02rem' } }, post ? "Modifier l'article" : 'Nouvel article'))],
    [h('div', { class: 'card' },
      h('label', { class: 'field' }, 'Titre'), fTitle,
      h('label', { class: 'field', style: { marginTop: '12px' } }, "Adresse de l'article dans le lien"), fSlug,
      h('p', { class: 'hint' }, 'Minuscules, chiffres et tirets. Exemple : reussir-son-premier-rendez-vous'),
      h('label', { class: 'field', style: { marginTop: '12px' } }, 'Extrait'), fExcerpt,
      h('label', { class: 'field', style: { marginTop: '12px' } }, 'Image de couverture'), fCover,
      post?.cover_url ? h('img', { src: post.cover_url, style: { maxWidth: '220px', borderRadius: '10px', marginTop: '8px', display: 'block' } }) : null,
      h('label', { class: 'field', style: { marginTop: '12px' } }, "Texte de l'article"), fContent,
      h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', fontWeight: '600' } },
        fPublished, 'Publié (visible sur le site)'),
      h('div', { class: 'btn-row', style: { marginTop: '16px' } },
        h('button', { class: 'btn', onclick: save }, 'Enregistrer'),
        post ? h('button', {
          class: 'btn danger sm',
          onclick: async () => {
            if (!confirm('Supprimer définitivement cet article ?')) return;
            const { error } = await supabase.from('posts').delete().eq('id', post.id);
            if (error) { toast('Suppression impossible.', true); return; }
            closeDrawer();
            toast('Article supprimé.');
            go('blog');
          },
        }, "Supprimer l'article") : null))]);
}

// ---------------------------------------------------------------------------
// Guide de modération
// ---------------------------------------------------------------------------

function pageGuide(root) {
  const rule = (motif, delai, quoi) => h('tr', {},
    h('td', {}, h('b', { text: motif })),
    h('td', {}, pill(delai, delai === '1 heure' ? 'red' : delai === '24 heures' ? 'orange' : 'grey')),
    h('td', { text: quoi }));

  root.append(
    h('p', { class: 'page-intro' },
      "Ce que l'équipe doit faire, dans quel ordre, et avec quel délai. À lire une fois en entier avant de traiter son premier signalement."),

    h('div', { class: 'card doc' },
      h('h3', {}, 'Le principe'),
      h('p', {}, "Un signalement n'est pas une preuve. Votre travail est de vérifier, puis de choisir la mesure la plus légère qui règle réellement le problème. Une sanction trop lourde fait fuir un utilisateur honnête, une sanction trop faible laisse un prédateur en place."),
      h('p', {}, "Une seule exception à cette règle de proportionnalité : les mineurs. Là, on suspend d'abord, on vérifie ensuite."),

      h('h3', {}, 'Délais à respecter'),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Motif'), h('th', {}, 'Délai'), h('th', {}, 'Première réaction'))),
        h('tbody', {},
          rule('Mineur suspecté', '1 heure', 'Suspendre immédiatement, conserver les preuves, transmettre aux autorités.'),
          rule('Harcèlement', '24 heures', "Lire la conversation, avertir au premier écart, suspendre en cas de menace ou d'insistance après blocage."),
          rule('Contenu inapproprié', '24 heures', 'Supprimer la photo, avertir. Nudité ou violence : suspension directe.'),
          rule('Arnaque', '24 heures', "Vérifier les messages (demande d'argent, lien externe, numéro). Bannir si confirmé, sans avertissement."),
          rule('Faux profil', '72 heures', 'Comparer photos et incohérences. Masquer le compte si doute, bannir si preuve.'),
          rule('Autre', '72 heures', 'Lire, qualifier, reclasser dans un des motifs ci-dessus.')))),

      h('h3', {}, "L'échelle des sanctions"),
      h('ol', {},
        h('li', {}, h('b', {}, 'Avertissement. '), "Premier écart sans gravité. Reste au dossier : trois avertissements valent une suspension."),
        h('li', {}, h('b', {}, 'Masquage du compte. '), "Le compte fonctionne normalement pour son propriétaire mais les autres ne le voient plus, ni dans Rencontres, ni dans J'aime, ni dans les soirées. À utiliser quand vous avez un doute sérieux sans preuve : la personne arrête de nuire sans savoir qu'elle est repérée, et donc sans recréer un compte dans la foulée."),
        h('li', {}, h('b', {}, 'Suspension 7 ou 30 jours. '), "Faute réelle mais isolée. Le compte est déconnecté, ses conversations coupées, il ne peut plus écrire. La levée est automatique à l'échéance."),
        h('li', {}, h('b', {}, 'Bannissement définitif. '), "Arnaque, violence, récidive, refus manifeste des règles. Les données sont conservées : c'est ce qui permet de prouver la décision si la personne conteste ou revient."),
        h('li', {}, h('b', {}, 'Suppression du compte. '), "Uniquement quand le compte ne doit pas exister : mineur avéré après transmission aux autorités, ou demande légale. Irréversible, et cela efface les preuves : ne le faites jamais avant d'avoir clos le volet judiciaire.")),

      h('h3', {}, 'Ce que vous ne devez pas faire'),
      h('ul', {},
        h('li', {}, "Ouvrir une conversation sans signalement en cours. Chaque lecture est tracée avec votre nom, et une consultation injustifiée est une faute."),
        h('li', {}, "Sanctionner sans motif écrit. Le motif est ce que vous pourrez relire dans six mois, ou montrer à un juge."),
        h('li', {}, "Répondre à un utilisateur depuis votre compte personnel. Tout passe par support@zola-rdc.com."),
        h('li', {}, "Supprimer des photos ou des messages dans un dossier « mineur » avant transmission aux autorités.")),

      h('h3', {}, 'Protection des enfants, en détail'),
      h('p', {}, "Zola est interdit aux moins de 18 ans, la date de naissance est contrôlée à l'inscription. Un mineur qui passe malgré tout est une urgence, pas un dossier ordinaire."),
      h('ol', {},
        h('li', {}, "Suspendez le compte visé dès le doute sérieux. Une suspension injuste se lève en trente secondes, un mineur laissé en ligne ne se rattrape pas."),
        h('li', {}, "Ne supprimez rien. Photos, messages et profil sont les éléments que les autorités demanderont."),
        h('li', {}, "Transmettez : NCMEC pour les contenus d'exploitation sexuelle d'enfants, et les autorités congolaises compétentes. Notez la référence du dépôt dans le dossier, elle prouve que Zola a rempli son obligation."),
        h('li', {}, "Prévenez le référent, Martin Bitha, à securite@zola-rdc.com, le jour même."),
        h('li', {}, "Une fois la transmission enregistrée, supprimez le compte.")),
      h('p', {}, h('a', { href: 'securite-enfants.html', target: '_blank', rel: 'noopener' }, 'Politique publique de sécurité des enfants'), ' · ',
        h('a', { href: 'conditions.html', target: '_blank', rel: 'noopener' }, "Conditions d'utilisation")),

      h('h3', {}, 'Vérifications de profil'),
      h('p', {}, "L'application demande un selfie avec un geste tiré au sort, impossible à reproduire avec une photo volée. Votre travail tient en deux questions : est-ce le même visage que sur les photos du profil, et le geste demandé est-il bien fait ?"),
      h('ul', {},
        h('li', {}, h('b', {}, 'Validez '), "quand les deux réponses sont oui, même si la photo n'est pas belle."),
        h('li', {}, h('b', {}, 'Refusez '), "si le visage est masqué, la photo floue, le geste absent, ou si ce n'est visiblement pas la même personne. Le motif est lu par la personne : écrivez ce qu'elle doit corriger."),
        h('li', {}, "Un visage manifestement mineur sur un selfie de vérification n'est pas un refus ordinaire : ouvrez la fiche et traitez-le comme un dossier mineur."),
        h('li', {}, "Le selfie est supprimé dès votre décision. Si vous hésitez, tranchez maintenant : vous ne pourrez pas le revoir plus tard.")),

      h('h3', {}, 'Signalements abusifs'),
      h('p', {}, "Un utilisateur qui signale en masse des profils irréprochables cherche à faire retirer ses concurrents. Ouvrez sa fiche : le compteur « signalements déposés » le trahit. Avertissez, puis suspendez en cas de récidive."),

      h('h3', {}, "Qui fait quoi"),
      h('ul', {},
        h('li', {}, h('b', {}, 'Modérateur. '), 'Signalements, sanctions, photos, conversations, notes.'),
        h('li', {}, h('b', {}, 'Administrateur. '), "Tout cela, plus l'économie (ajustement de pièces) et la suppression définitive de comptes."),
        h('li', {}, h('b', {}, 'Propriétaire. '), "Tout cela, plus la gestion de l'équipe et des rôles.")),

      h('h3', {}, 'Votre propre compte'),
      h('p', {}, "Vous modérez des gens qui peuvent vous croiser dans l'application. Demandez l'abonnement Incognito offert (page Administrateurs) : votre profil n'apparaît plus chez les autres, vous continuez de voir tout le monde. Et ne répondez jamais à un utilisateur depuis votre compte personnel, même pour rendre service.")));
}

// ---------------------------------------------------------------------------
// Liste d'attente (adresses laissées sur le site avant la sortie)
// ---------------------------------------------------------------------------

const PLATFORM_LABEL = { ios: 'iPhone', android: 'Android' };

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function pageWaitlist(root) {
  const data = await rpc('admin_list_waitlist', { p_limit: 5000, p_offset: 0 });
  const items = data.items || [];
  const ios = items.filter((w) => w.platform === 'ios').length;
  const android = items.filter((w) => w.platform === 'android').length;

  const stamp = new Date().toISOString().slice(0, 10);

  const exportCsv = () => {
    // Point-virgule : Excel en français l'ouvre en colonnes sans assistant.
    // Le BOM force l'UTF-8, sinon les accents ressortent en caractères cassés.
    const lines = [['email', 'telephone', 'inscrit_le', 'source'].join(';')];
    for (const w of items) {
      lines.push([w.email, PLATFORM_LABEL[w.platform] || '', w.created_at, w.source].map(csvCell).join(';'));
    }
    downloadText(`zola-liste-attente-${stamp}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  };

  const copyEmails = async () => {
    try {
      await navigator.clipboard.writeText(items.map((w) => w.email).join(', '));
      toast(`${items.length} adresse(s) copiée(s).`);
    } catch {
      toast('Copie impossible dans ce navigateur : utilisez le CSV.', true);
    }
  };

  const remove = async (w) => {
    const v = await ask({
      title: 'Retirer cette adresse',
      text: `${w.email} ne sera plus prévenue de la sortie. À faire uniquement si la personne le demande ou si l'adresse est manifestement fausse.`,
      confirmLabel: 'Retirer', danger: true,
    });
    if (!v) return;
    try { await rpc('admin_remove_waitlist', { p_id: w.id }); toast('Adresse retirée.'); go('waitlist'); }
    catch (e) { toast(errText(e), true); }
  };

  const rows = items.map((w) => h('tr', {},
    h('td', { 'data-l': 'Adresse' }, h('b', { text: w.email })),
    h('td', { 'data-l': 'Téléphone' }, w.platform ? pill(PLATFORM_LABEL[w.platform], 'grey') : h('span', { class: 'hint', text: 'Non précisé' })),
    h('td', { 'data-l': 'Inscrit le', class: 'hint', text: fmtFull(w.created_at) }),
    h('td', { 'data-l': 'Confirmation' }, w.welcome_sent_at ? pill('Envoyée', 'green') : pill('Non envoyée', 'grey')),
    h('td', { 'data-l': 'Prévenu' }, w.notified_at ? pill(`le ${fmtDate(w.notified_at)}`, 'green') : pill('Pas encore', 'orange')),
    h('td', {}, isAdminPlus()
      ? h('button', { class: 'btn danger sm', onclick: () => remove(w) }, 'Retirer')
      : '')));

  root.append(
    h('p', { class: 'page-intro' },
      "Les personnes qui ont laissé leur adresse sur le site pour être prévenues de la sortie de l'application. Une adresse par personne, jamais de doublon. Chacune reçoit un e-mail de confirmation à l'inscription (Brevo). Le jour du lancement : exporter la liste, envoyer un seul e-mail avec les liens des stores, puis supprimer les adresses, comme promis sur le site."),
    h('div', { class: 'grid k4' },
      h('div', { class: 'stat' }, h('div', { class: 'label kicker', text: 'Inscrits' }), h('div', { class: 'value', text: num(data.total) })),
      h('div', { class: 'stat' }, h('div', { class: 'label kicker', text: '7 derniers jours' }), h('div', { class: 'value', text: num(data.week) })),
      h('div', { class: 'stat' }, h('div', { class: 'label kicker', text: 'iPhone' }), h('div', { class: 'value', text: num(ios) })),
      h('div', { class: 'stat' }, h('div', { class: 'label kicker', text: 'Android' }), h('div', { class: 'value', text: num(android) }))),
    h('div', { class: 'card' },
      h('div', { class: 'btn-row', style: { marginBottom: items.length ? '16px' : '0' } },
        h('button', { class: 'btn sm', onclick: exportCsv, disabled: !items.length }, 'Exporter en CSV'),
        h('button', { class: 'btn ghost sm', onclick: copyEmails, disabled: !items.length }, 'Copier les adresses')),
      items.length
        ? h('div', { class: 'table-wrap' }, h('table', {},
            h('thead', {}, h('tr', {},
              h('th', {}, 'Adresse'), h('th', {}, 'Téléphone'), h('th', {}, 'Inscrit le'),
              h('th', {}, 'Confirmation'), h('th', {}, 'Prévenu'), h('th', {}))),
            h('tbody', {}, ...rows)))
        : empty("Personne pour le moment. Le formulaire est en bas de la page d'accueil du site.")));
}

// ---------------------------------------------------------------------------
// Courrier (boîtes du domaine, poussé par le webhook Hostinger, migration 057)
// ---------------------------------------------------------------------------

const MAIL_CATEGORY = {
  securite: ['Sécurité des enfants', 'red'],
  partenaires: ['Partenariat', 'orange'],
  contact: ['Contact', 'blue'],
  support: ['Support', 'grey'],
  waitlist_reply: ["Réponse liste d'attente", 'green'],
  other: ['Autre', 'grey'],
};

// Chaque adresse ouvre le bon client mail, avec la réponse déjà adressée.
function mailReplyHref(m) {
  const subject = /^re:/i.test(m.subject || '') ? m.subject : `Re: ${m.subject || ''}`;
  return `mailto:${encodeURIComponent(m.from_address || '')}?subject=${encodeURIComponent(subject)}`;
}

async function pageMail(root) {
  const data = await rpc('admin_list_inbound_mail', { p_status: null, p_limit: 500 });
  const items = data.items || [];
  const open = items.filter((m) => m.status === 'new');
  const done = items.filter((m) => m.status !== 'new');

  const toggle = async (m, handled) => {
    let note = null;
    if (handled) {
      const v = await ask({
        title: 'Marquer comme traité',
        text: `« ${m.subject || '(sans objet)'} » de ${m.from_address}. Une note courte aide à retrouver ce qui a été fait.`,
        confirmLabel: 'Traité',
        fields: [{ name: 'note', label: 'Note (facultative)', type: 'text', placeholder: 'Répondu, soirée fixée au 3 octobre' }],
      });
      if (!v) return;
      note = v.note || null;
    }
    try {
      await rpc('admin_handle_inbound_mail', { p_id: m.id, p_handled: handled, p_note: note });
      toast(handled ? 'Message marqué comme traité.' : 'Message remis dans la file.');
      go('mail');
    } catch (e) { toast(errText(e), true); }
  };

  const row = (m) => {
    const cat = MAIL_CATEGORY[m.category] || MAIL_CATEGORY.other;
    const preview = h('div', { class: 'hint', style: { whiteSpace: 'pre-wrap', marginTop: '6px', display: 'none' } , text: m.body_preview || '(pas de texte dans la notification, ouvrir la boîte)' });
    return h('tr', { class: m.category === 'securite' && m.status === 'new' ? 'row-alert' : '' },
      h('td', { 'data-l': 'Type' }, pill(cat[0], cat[1]),
        m.source === 'site' ? h('div', { class: 'hint', style: { marginTop: '4px' }, text: 'Via le formulaire du site' }) : null),
      h('td', { 'data-l': 'De' }, h('b', { text: m.from_name || m.from_address || '—' }),
        m.from_name ? h('div', { class: 'hint', text: m.from_address }) : null),
      h('td', { 'data-l': 'Objet' },
        h('div', { text: m.subject || '(sans objet)', style: { cursor: 'pointer' }, onclick: () => { preview.style.display = preview.style.display === 'none' ? 'block' : 'none'; } }),
        preview,
        m.note ? h('div', { class: 'hint', text: `Note : ${m.note}` }) : null),
      h('td', { 'data-l': 'Reçu', class: 'hint', text: fmtFull(m.received_at) }),
      h('td', { 'data-l': 'Traité' }, m.status === 'new'
        ? pill('À traiter', m.category === 'securite' ? 'red' : 'orange')
        : pill(`par ${m.handled_by_email || '—'}`, 'green')),
      h('td', {}, h('div', { class: 'btn-row' },
        h('a', { class: 'btn ghost sm', href: mailReplyHref(m) }, 'Répondre'),
        m.status === 'new'
          ? h('button', { class: 'btn sm', onclick: () => toggle(m, true) }, 'Traité')
          : h('button', { class: 'btn ghost sm', onclick: () => toggle(m, false) }, 'Rouvrir'))));
  };

  const table = (list) => h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {},
      h('th', {}, 'Type'), h('th', {}, 'De'), h('th', {}, 'Objet'), h('th', {}, 'Reçu'), h('th', {}, 'Traité'), h('th', {}))),
    h('tbody', {}, ...list.map(row))));

  root.append(
    h('p', { class: 'page-intro' },
      "Tout ce qui arrive sur les boîtes du domaine et par le formulaire de contact du site, classé par sujet. Un message sur securite@ passe en tête et laisse une trace dans l'historique des actions. Cliquez sur l'objet pour lire l'extrait ; la réponse se fait depuis votre messagerie, le bouton Répondre l'ouvre déjà adressée. Marquez traité ce qui l'est, pour que rien ne se perde."),
    h('div', { class: 'grid k4' },
      h('div', { class: 'stat' }, h('div', { class: 'label kicker', text: 'À traiter' }), h('div', { class: 'value', text: num(open.length) })),
      h('div', { class: 'stat' }, h('div', { class: 'label kicker', text: 'Sécurité des enfants' }), h('div', { class: 'value', text: num(open.filter((m) => m.category === 'securite').length) })),
      h('div', { class: 'stat' }, h('div', { class: 'label kicker', text: 'Partenariats' }), h('div', { class: 'value', text: num(open.filter((m) => m.category === 'partenaires').length) })),
      h('div', { class: 'stat' }, h('div', { class: 'label kicker', text: 'Traités' }), h('div', { class: 'value', text: num(done.length) }))),
    h('div', { class: 'card' },
      h('h2', { text: 'À traiter' }),
      open.length ? table(open) : empty('Rien en attente. Les nouveaux messages apparaissent ici dès leur arrivée dans la boîte.')),
    done.length
      ? h('div', { class: 'card' }, h('h2', { text: 'Traités' }), table(done))
      : null);
}

// Compteur de la barre latérale, comme pour les vérifications.
async function paintMailCount() {
  try {
    const c = await rpc('admin_inbound_mail_counts');
    const el = $('nav-count-mail');
    el.textContent = String(c.new);
    el.classList.toggle('hidden', !c.new);
    el.classList.toggle('alert', !!c.securite_new);
  } catch { /* file indisponible : pas de compteur */ }
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const PAGES = {
  dashboard: ['Tableau de bord', pageDashboard],
  reports: ['Signalements', pageReports],
  verifications: ['Vérifications de profil', pageVerifications],
  safety: ['Sécurité des enfants', pageSafety],
  users: ['Utilisateurs', pageUsers],
  photos: ['Photos', pagePhotos],
  conversation: ['Conversations', pageConversation],
  events: ['Soirées', pageEvents],
  blog: ['Blog', pageBlog],
  economy: ['Économie', pageEconomy],
  audit: ['Historique des actions', pageAudit],
  team: ['Administrateurs', pageTeam],
  waitlist: ["Liste d'attente", pageWaitlist],
  mail: ['Courrier', pageMail],
  guide: ['Guide de modération', pageGuide],
};

// Rubrique de chaque page, affichée au-dessus du titre dans l'en-tête. Même
// découpage que le menu latéral.
const GROUPS = {
  dashboard: 'Pilotage',
  safety: 'Modération', reports: 'Modération', verifications: 'Modération', photos: 'Modération',
  users: 'Communauté', conversation: 'Communauté',
  events: 'Contenu', blog: 'Contenu',
  mail: 'Contacts', waitlist: 'Contacts',
  team: 'Équipe et réglages', audit: 'Équipe et réglages', guide: 'Équipe et réglages', economy: 'Équipe et réglages',
};

// Recherche de l'en-tête : elle cherche toujours dans la page ouverte.
//   server : la liste vient de la base, limitée à 100 lignes. La recherche
//            repart donc vers la base (Utilisateurs, Signalements).
//   items  : sinon on filtre ce qui est affiché. Par défaut les lignes des
//            tableaux ; certaines pages listent des cartes ou du texte.
// Pas de recherche sur le tableau de bord : il n'y a rien à y chercher.
const SEARCH = {
  dashboard: null,
  safety: { placeholder: 'Chercher un dossier (pseudo, motif)' },
  reports: {
    placeholder: 'Chercher un signalement (pseudo)',
    value: () => state.reportFilter.search,
    server: (q) => { state.reportFilter.search = q; },
  },
  verifications: { placeholder: 'Chercher une vérification (pseudo)', items: '.grid > .card' },
  photos: { placeholder: 'Chercher une photo (pseudo)', items: '.grid > .card' },
  users: {
    placeholder: 'Chercher un membre (pseudo, e-mail, DW-…)',
    value: () => state.userFilter.search,
    server: (q) => { state.userFilter.search = q; },
  },
  conversation: { placeholder: 'Chercher dans les signalements avec conversation' },
  events: { placeholder: 'Chercher une soirée (nom, lieu)' },
  blog: { placeholder: 'Chercher un article' },
  mail: { placeholder: 'Chercher un message (expéditeur, objet)' },
  waitlist: { placeholder: 'Chercher une adresse e-mail' },
  team: { placeholder: 'Chercher un administrateur' },
  audit: { placeholder: "Chercher une action (auteur, compte, motif)" },
  guide: { placeholder: 'Chercher dans le guide', items: '.doc > p, .doc li, .doc tbody tr' },
  economy: { placeholder: 'Chercher un réglage ou une opération' },
};

const fold = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Filtre ce qui est affiché dans la page. Un message remplace la liste quand
// plus rien ne correspond.
function applyLocalSearch() {
  const cfg = SEARCH[state.page];
  const root = $('page-root');
  root.querySelector('.search-empty')?.remove();
  if (!cfg || cfg.server) return;
  const q = fold($('tb-search-input').value.trim());
  const items = [...root.querySelectorAll(cfg.items || 'tbody tr')];
  let shown = 0;
  for (const el of items) {
    const hit = !q || fold(el.textContent).includes(q);
    el.classList.toggle('search-hidden', !hit);
    if (hit) shown += 1;
  }
  // Un tableau dont toutes les lignes sont masquées ne garde pas ses titres
  // de colonnes à vide.
  for (const table of root.querySelectorAll('table')) {
    const visible = table.querySelector('tbody tr:not(.search-hidden)');
    table.querySelector('thead')?.classList.toggle('search-hidden', !!q && !visible);
  }
  if (q && items.length && !shown) {
    root.prepend(h('div', { class: 'search-empty' },
      `Aucun résultat pour « ${$('tb-search-input').value.trim()} » dans cette page.`));
  }
}

// Prépare la barre pour la page ouverte : texte d'aide, valeur, visibilité.
function setupSearch(page, keepQuery) {
  const cfg = SEARCH[page];
  const form = $('tb-search');
  const input = $('tb-search-input');
  form.classList.toggle('hidden', !cfg);
  document.body.classList.toggle('has-search', !!cfg);
  if (!cfg) return;
  input.placeholder = cfg.placeholder;
  input.setAttribute('aria-label', cfg.placeholder);
  if (cfg.server) input.value = cfg.value() || '';
  else if (!keepQuery) input.value = '';
}

function paintCounts(d) {
  const open = d.reports.pending + d.reports.in_review;
  const setCount = (id, value, alert) => {
    const el = $(id);
    el.textContent = String(value);
    el.classList.toggle('hidden', !value);
    el.classList.toggle('alert', !!alert);
  };
  setCount('nav-count-reports', open, false);
  setCount('nav-count-safety', d.safety.csae_open, true);
  setCount('nav-count-photos', d.safety.photos_flagged, false);

  // Pastille rouge dans l'en-tête : les dossiers « mineur suspecté » passent
  // avant tout, quelle que soit la page ouverte.
  const urgent = $('tb-urgent');
  const n = d.safety.csae_open || 0;
  urgent.textContent = n > 1 ? `${n} urgents` : '1 urgent';
  urgent.classList.toggle('hidden', !n);
}

// Le nombre de vérifications en attente ne vient pas du tableau de bord : un
// compte indexé séparé coûte moins cher que de refaire toute l'agrégation.
async function paintVerifCount() {
  try {
    const v = await rpc('admin_list_verifications', { p_status: 'pending', p_limit: 1, p_offset: 0 });
    const el = $('nav-count-verif');
    el.textContent = String(v.pending);
    el.classList.toggle('hidden', !v.pending);
  } catch { /* file indisponible : on n'affiche simplement pas de compteur */ }
}

const closeNav = () => document.body.classList.remove('nav-open');

async function go(page) {
  if (!PAGES[page]) page = 'dashboard';
  const samePage = state.page === page;
  state.page = page;
  setupSearch(page, samePage);
  location.hash = `#/${page}`;
  closeNav();
  window.scrollTo(0, 0);

  closeAccountMenu();

  for (const btn of document.querySelectorAll('.nav-item')) {
    btn.classList.toggle('active', btn.dataset.page === page);
  }
  $('page-title').textContent = PAGES[page][0];
  $('page-crumb').textContent = GROUPS[page] || 'Pilotage';
  document.title = `${PAGES[page][0]} | Backoffice Zola`;

  const root = $('page-root');
  root.replaceChildren(h('p', { class: 'hint', text: 'Chargement…' }));

  try {
    const fresh = h('div');
    await PAGES[page][1](fresh);
    root.replaceChildren(...fresh.childNodes);
    applyLocalSearch();
  } catch (e) {
    root.replaceChildren(h('div', { class: 'card' },
      h('h2', { text: 'Chargement impossible' }),
      h('p', { class: 'hint', text: errText(e) })));
  }
  const stamp = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  $('btn-refresh').title = `Actualiser (dernière mise à jour à ${stamp})`;

  // Le tableau de bord rafraîchit déjà les compteurs ; ailleurs on les
  // recharge en arrière-plan pour que la file reste juste.
  if (page !== 'dashboard') {
    rpc('admin_dashboard').then((d) => { state.dashboard = d; paintCounts(d); }).catch(() => {});
    paintMailCount();
  }
  paintVerifCount();
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

function showView(id) {
  for (const v of ['view-gate', 'view-denied', 'view-app']) $(v).classList.toggle('hidden', v !== id);
}

async function boot() {
  const { data: { session } } = PREVIEW
    ? { data: { session: { user: { id: 'apercu', email: 'equipe@zola-rdc.com' } } } }
    : await supabase.auth.getSession();
  if (!session) { showView('view-gate'); return; }

  let role = null;
  try {
    role = await rpc('my_admin_role');
  } catch (e) { /* traité comme non autorisé */ }

  if (!role) {
    $('denied-email').textContent = session.user.email ?? '';
    showView('view-denied');
    return;
  }

  state.me = {
    user_id: session.user.id,
    email: session.user.email,
    role,
  };
  const roleLabel = { owner: 'Propriétaire', admin: 'Administrateur', moderator: 'Modérateur' }[role] || role;
  const email = session.user.email ?? '';
  $('who-email').textContent = email;
  $('who-role').textContent = roleLabel;
  $('menu-email').textContent = email;
  $('menu-role').textContent = roleLabel;
  $('who-initials').textContent = (email.trim()[0] || '·').toUpperCase();
  showView('view-app');

  const fromHash = location.hash.replace('#/', '');
  await go(PAGES[fromHash] ? fromHash : 'dashboard');
}

$('btn-login').addEventListener('click', async () => {
  const email = $('l-email').value.trim();
  const password = $('l-password').value;
  const msg = $('login-msg');
  msg.classList.add('hidden');
  $('btn-login').disabled = true;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  $('btn-login').disabled = false;
  if (error) {
    msg.textContent = "Connexion impossible : vérifiez l'adresse et le mot de passe.";
    msg.classList.remove('hidden');
    return;
  }
  await boot();
});

$('l-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-login').click(); });

const logout = async () => {
  await supabase.auth.signOut();
  state.me = null;
  showView('view-gate');
};

$('btn-logout').addEventListener('click', () => { closeAccountMenu(); logout(); });
$('btn-denied-logout').addEventListener('click', logout);
$('btn-refresh').addEventListener('click', async () => {
  const btn = $('btn-refresh');
  btn.classList.add('spin');
  await go(state.page);
  btn.classList.remove('spin');
});

// Menu du compte (en-tête)
function closeAccountMenu() {
  $('account-menu').classList.add('hidden');
  $('account-btn').setAttribute('aria-expanded', 'false');
}
$('account-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = $('account-menu').classList.toggle('hidden') === false;
  $('account-btn').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.account')) closeAccountMenu();
});
$('btn-menu-guide').addEventListener('click', () => go('guide'));
$('btn-menu-audit').addEventListener('click', () => go('audit'));

// Recherche de l'en-tête, liée à la page ouverte (voir SEARCH).
let searchTimer = 0;
function runSearch(now) {
  const cfg = SEARCH[state.page];
  if (!cfg) return;
  if (!cfg.server) { applyLocalSearch(); return; }
  clearTimeout(searchTimer);
  const q = $('tb-search-input').value.trim();
  if (q === (cfg.value() || '')) return;
  searchTimer = setTimeout(() => { cfg.server(q); go(state.page); }, now ? 0 : 400);
}
$('tb-search').addEventListener('submit', (e) => { e.preventDefault(); runSearch(true); });
$('tb-search-input').addEventListener('input', () => runSearch(false));
$('tb-urgent').addEventListener('click', () => go('safety'));

// Bouton Retour du navigateur : l'adresse #/page ramène à la bonne page.
window.addEventListener('hashchange', () => {
  const page = location.hash.replace('#/', '');
  if (state.me && PAGES[page] && page !== state.page) go(page);
});

for (const btn of document.querySelectorAll('.nav-item')) {
  btn.addEventListener('click', () => go(btn.dataset.page));
}

$('btn-burger').addEventListener('click', () => document.body.classList.toggle('nav-open'));
$('nav-backdrop').addEventListener('click', closeNav);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (drawerEl) closeDrawer();
  else { closeNav(); closeAccountMenu(); }
});

boot();
