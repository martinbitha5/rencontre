// Backoffice Dowe
//
// Règle d'architecture : cette page ne fait AUCUNE écriture directe sur les
// données sensibles. Tout passe par des RPC `admin_*` côté Postgres qui
// vérifient le rôle de l'appelant et écrivent une ligne dans le journal
// d'audit. La clé utilisée ici est la clé publique : sans un compte présent
// dans `admin_users`, aucune de ces fonctions ne répond.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import QRCode from 'https://esm.sh/qrcode@1.5.4';

const SUPABASE_URL = 'https://sbsxgwdpdjxsrxcccwno.supabase.co';
const supabase = createClient(SUPABASE_URL, 'sb_publishable_m7L5upRFZXPIaBltmLIkAQ_P77Ij01u');

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
  admin_added: 'Administrateur ajouté',
  admin_removed: 'Administrateur retiré',
  admin_role_changed: 'Rôle modifié',
  admin_enabled: 'Administrateur réactivé',
  admin_disabled: 'Administrateur désactivé',
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
  account_not_found: "Aucun compte Dowe avec cette adresse. La personne doit d'abord créer un compte.",
  invalid_role: 'Rôle inconnu.',
  invalid_status: 'Statut inconnu.',
};

function errText(error) {
  const raw = String(error?.message || error || '');
  for (const key of Object.keys(ERRORS)) if (raw.includes(key)) return ERRORS[key];
  return 'Action impossible. Réessayez ou prévenez le responsable technique.';
}

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args || {});
  if (error) throw error;
  return data;
}

function photoUrl(path, bucket) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket || 'photos'}/${path}`;
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

function avatar(path, big) {
  const url = photoUrl(path);
  if (url) return h('img', { class: `avatar${big ? ' lg' : ''}`, src: url, alt: '', loading: 'lazy' });
  return h('div', { class: `avatar${big ? ' lg' : ''}` });
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
    text: "La photo disparaît du profil et du stockage. L'action est tracée.",
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
            h('img', { src: photoUrl(ph.path), alt: '', loading: 'lazy' }),
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
        "À faire dès qu'il existe un soupçon sérieux d'exploitation ou d'abus sexuel d'enfant. Notez la référence du dépôt (NCMEC, police, procureur) : elle prouve que Dowe a rempli son obligation."),
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

async function pageDashboard(root) {
  const d = await rpc('admin_dashboard');
  state.dashboard = d;
  paintCounts(d);
  paintVerifCount();

  if (d.safety.csae_open > 0) {
    root.append(h('div', { class: 'callout red', style: { marginBottom: '16px' } },
      h('b', {}, `${d.safety.csae_open} signalement(s) « mineur suspecté » en attente. `),
      'À traiter avant tout le reste. ',
      h('button', { class: 'btn danger sm', style: { marginLeft: '8px' }, onclick: () => go('safety') }, 'Ouvrir la file')));
  }

  root.append(
    h('div', { class: 'grid k4' },
      statCard('Signalements ouverts', num(d.reports.pending + d.reports.in_review),
        d.reports.oldest_pending_hours ? `Le plus ancien : ${d.reports.oldest_pending_hours} h` : 'File vide',
        d.reports.pending + d.reports.in_review > 0 ? 'alert' : 'good'),
      statCard('Critiques', num(d.reports.critical_open), 'Mineurs suspectés', d.reports.critical_open ? 'alert' : null),
      statCard('Comptes', num(d.users.total), `${num(d.users.onboarded)} profils complets`),
      statCard('Actifs sur 24 h', num(d.users.active_24h), `${num(d.users.new_24h)} inscription(s) aujourd'hui`)),
    h('div', { class: 'grid k4', style: { marginTop: '14px' } },
      statCard('Comptes bannis', num(d.users.banned)),
      statCard('Comptes masqués', num(d.users.shadowbanned), 'Invisibles pour les autres'),
      statCard('Sanctions 7 jours', num(d.safety.bans_7d), `${num(d.safety.warnings_7d)} avertissement(s)`),
      statCard('Blocages 7 jours', num(d.safety.blocks_7d), 'Entre utilisateurs')),
    h('div', { class: 'grid k2', style: { marginTop: '16px' } },
      barChart(d.series, 'signups', 'Inscriptions'),
      barChart(d.series, 'reports', 'Signalements')),
    h('div', { class: 'grid k2', style: { marginTop: '16px' } },
      h('div', { class: 'card' },
        h('h2', { text: 'Activité' }),
        h('dl', { class: 'kv', style: { marginTop: '10px' } },
          h('dt', {}, 'Swipes 24 h'), h('dd', { text: num(d.activity.swipes_24h) }),
          h('dt', {}, 'Matchs 24 h'), h('dd', { text: num(d.activity.matches_24h) }),
          h('dt', {}, 'Messages 24 h'), h('dd', { text: num(d.activity.messages_24h) }),
          h('dt', {}, 'Photos en ligne'), h('dd', { text: num(d.activity.photos_total) }),
          h('dt', {}, 'Soirées ouvertes'), h('dd', { text: num(d.activity.events_active) }))),
      h('div', { class: 'card' },
        h('h2', { text: 'Économie' }),
        h('dl', { class: 'kv', style: { marginTop: '10px' } },
          h('dt', {}, 'Pièces en circulation'), h('dd', { text: num(d.economy.coins_circulating) }),
          h('dt', {}, 'Dépensées 7 j'), h('dd', { text: num(d.economy.spent_7d) }),
          h('dt', {}, 'Rechargées 7 j'), h('dd', { text: num(d.economy.recharges_7d) }),
          h('dt', {}, 'Entrées soirées 7 j'), h('dd', { text: `${num(d.economy.event_revenue_7d)} CDF` }),
          h('dt', {}, 'Comptes premium'), h('dd', { text: num(d.users.premium) })))));
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

  const search = h('input', {
    type: 'search', placeholder: 'Rechercher un pseudo signalé', value: f.search,
    style: { maxWidth: '280px' },
    onchange: (e) => { f.search = e.target.value; go('reports'); },
  });

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
      h('div', { style: { flex: '0 0 auto' } }, search),
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
      "Dowe est interdit aux moins de 18 ans. Cette file regroupe tout ce qui touche à la présence d'un mineur ou à l'exploitation d'un enfant. C'est la seule file avec un délai imposé : une heure."),
    h('div', { class: 'callout red', style: { marginBottom: '16px' } },
      h('b', {}, 'Procédure. '),
      "1. Suspendre le compte visé dès qu'il y a doute sérieux, sans attendre la preuve. ",
      "2. Ne supprimer ni photos ni messages : ce sont les preuves. ",
      "3. Transmettre aux autorités et enregistrer la référence du dépôt. ",
      "4. Une fois la transmission faite, supprimer le compte. ",
      h('a', { href: 'securite-enfants.html', target: '_blank', rel: 'noopener' }, 'Politique publique de Dowe')),
    h('div', { class: 'grid k4', style: { marginBottom: '16px' } },
      statCard('En attente de traitement', num(open.length), 'Délai cible : 1 heure', open.length ? 'alert' : 'good'),
      statCard('Transmis aux autorités', num(data.items.filter((r) => r.csae_escalated_at).length)),
      statCard('Total historique', num(data.total)),
      statCard('Référent sécurité enfants', 'Martin Bitha', 'support@dowe.app')),
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

  const search = h('input', {
    type: 'search', placeholder: 'Pseudo, e-mail ou numéro DW-…', value: f.search,
    style: { maxWidth: '320px' },
    onchange: (e) => { f.search = e.target.value; go('users'); },
  });

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
      h('div', { style: { flex: '0 0 auto' } }, search),
      h('div', { class: 'hint', style: { flex: '1', textAlign: 'right' } }, `${data.total} compte(s)`)),
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
async function selfieUrl(path) {
  const { data } = await supabase.storage.from('verifications').createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

async function pageVerifications(root) {
  const status = state.verifFilter || 'pending';
  const data = await rpc('admin_list_verifications', { p_status: status, p_limit: 60, p_offset: 0 });

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
    const url = v.status === 'pending' ? await selfieUrl(v.selfie_path) : null;

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
      if (!v2) return;
      try {
        const r = await rpc('admin_review_verification', { p_id: v.id, p_approve: approve, p_reason: v2.reason || null });
        // Le selfie part maintenant : la décision est prise, la donnée
        // biométrique n'a plus de raison d'exister.
        if (r.selfie_path) await supabase.storage.from('verifications').remove([r.selfie_path]);
        toast(approve ? 'Profil vérifié.' : 'Demande refusée.');
        go('verifications');
      } catch (e) { toast(errText(e), true); }
    };

    return h('div', { class: 'card' },
      h('div', { style: { display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' } },
        h('div', {},
          h('div', { class: 'hint', style: { marginBottom: '4px', fontWeight: '700' } }, 'Selfie envoyé'),
          url
            ? h('img', {
                src: url, alt: '',
                style: { width: '170px', height: '215px', objectFit: 'cover', borderRadius: '12px', background: '#f7e4ee' },
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
            ...(u.photos.length
              ? u.photos.slice(0, 4).map((p) => h('img', {
                  src: photoUrl(p), alt: '',
                  style: { width: '104px', height: '132px', objectFit: 'cover', borderRadius: '10px', background: '#f7e4ee' },
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
        h('div', { class: 'callout', style: { marginTop: '10px' } },
          h('b', {}, 'Geste demandé : '), GESTURES[v.gesture] || v.gesture),
        v.reject_reason
          ? h('div', { class: 'hint', style: { marginTop: '8px' } }, `Motif du refus : ${v.reject_reason}`)
          : null,
        h('div', { class: 'btn-row', style: { marginTop: '12px' } },
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
    h('img', {
      src: photoUrl(p.path), alt: '', loading: 'lazy',
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
          h('p', { class: 'hint' }, "La personne doit déjà avoir un compte Dowe créé avec cette adresse e-mail."),
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
  const { data: events, error } = await supabase
    .from('events')
    .select('id, name, price_cdf, qr_token, is_active, ends_at, created_at')
    .order('created_at', { ascending: false });

  if (error) { root.append(h('div', { class: 'card' }, empty('Erreur de chargement des soirées.'))); return; }

  const counts = {};
  const { data: attendees } = await supabase.from('event_attendees').select('event_id');
  for (const a of attendees ?? []) counts[a.event_id] = (counts[a.event_id] ?? 0) + 1;

  const name = h('input', { type: 'text', maxlength: '80', placeholder: 'Soirée Dowe au Fleuve Congo' });
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
      "Une soirée, un code QR. Le scan ouvre le portail de paiement au prix fixé ici, réglable par carte ou Mobile Money ; l'entrée se paie une seule fois, puis on sort et on revient librement. Sur place, les participants se découvrent entre eux dans l'application."),
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
  const canvas = h('canvas', { style: { border: '1px solid #f3d8e6', borderRadius: '12px' } });
  await QRCode.toCanvas(canvas, `dowe://event/${ev.qr_token}`, {
    width: 240, margin: 2, color: { dark: '#18181b', light: '#ffffff' },
  });

  const endsInput = h('input', { type: 'datetime-local', value: toLocalInput(ev.ends_at) });
  const priceInput = h('input', { type: 'number', min: '0', step: '100', value: String(ev.price_cdf ?? 0) });
  const priceLine = h('p', { class: 'hint', style: { margin: '0' } });
  const stateLine = h('p', { style: { fontWeight: '700', margin: '0 0 4px' } });
  const accessBtn = h('button', { class: 'btn danger sm' });

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
    if (close && !confirm("Mettre fin à l'accès maintenant ? Le code QR cessera immédiatement de fonctionner.")) return;
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
    toast(iso ? 'Fin programmée.' : 'Date de fin retirée.');
  };

  paint();

  openDrawer(
    [h('div', {}, h('div', { style: { fontWeight: '700', fontSize: '1.02rem' }, text: ev.name }),
      h('div', {
        class: 'hint',
        text: `${ev.price_cdf > 0 ? `${num(ev.price_cdf)} CDF par entrée` : 'Entrée libre'} · ${count} participant(s)`,
      }))],
    [
      h('div', { class: 'card' },
        h('h2', { text: "Prix d'entrée" }),
        priceLine,
        h('p', { class: 'hint' }, "Le montant est encaissé sur le portail de paiement (carte ou Mobile Money) juste après le scan. Un changement de prix ne vaut que pour les entrées suivantes."),
        h('p', { class: 'hint' }, `Plafond du service de paiement : ${num(MAX_ENTRY_CDF)} CDF par transaction. Au-dessus, le paiement est refusé à l'entrée.`),
        h('div', { class: 'form-row', style: { marginTop: '12px', marginBottom: '0' } },
          h('div', { style: { maxWidth: '200px' } }, h('label', { class: 'field' }, 'Prix en CDF (0 = libre)'), priceInput),
          h('div', { style: { flex: '0 0 auto' } }, h('button', { class: 'btn ghost sm', onclick: savePrice }, 'Enregistrer')))),
      h('div', { class: 'card' },
        h('h2', { text: 'Code QR' }),
        h('p', { class: 'hint' }, "À imprimer ou à afficher à l'entrée. Les abonnés le scannent depuis Profil, Scanner une soirée."),
        h('div', { style: { marginTop: '12px' } }, canvas),
        h('div', { class: 'btn-row', style: { marginTop: '12px' } },
          h('a', {
            class: 'btn ghost sm', href: canvas.toDataURL('image/png'),
            download: `qr-${ev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`,
          }, 'Télécharger le QR'))),
      h('div', { class: 'card' },
        h('h2', { text: "Accès" }),
        stateLine,
        h('p', { class: 'hint' }, "Une fois l'accès fermé, personne ne peut plus entrer. Les entrées déjà payées restent valables et les participants continuent de se voir."),
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
    h('p', { class: 'page-intro' }, "Les articles publiés apparaissent sur dowe-eight.vercel.app/blog."),
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
    try {
      const file = fCover.files[0];
      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `covers/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('blog').upload(path, file, { contentType: file.type });
        if (error) throw error;
        cover_url = supabase.storage.from('blog').getPublicUrl(path).data.publicUrl;
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
      toast('Enregistré.');
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
        h('li', {}, "Répondre à un utilisateur depuis votre compte personnel. Tout passe par support@dowe.app."),
        h('li', {}, "Supprimer des photos ou des messages dans un dossier « mineur » avant transmission aux autorités.")),

      h('h3', {}, 'Protection des enfants, en détail'),
      h('p', {}, "Dowe est interdit aux moins de 18 ans, la date de naissance est contrôlée à l'inscription. Un mineur qui passe malgré tout est une urgence, pas un dossier ordinaire."),
      h('ol', {},
        h('li', {}, "Suspendez le compte visé dès le doute sérieux. Une suspension injuste se lève en trente secondes, un mineur laissé en ligne ne se rattrape pas."),
        h('li', {}, "Ne supprimez rien. Photos, messages et profil sont les éléments que les autorités demanderont."),
        h('li', {}, "Transmettez : NCMEC pour les contenus d'exploitation sexuelle d'enfants, et les autorités congolaises compétentes. Notez la référence du dépôt dans le dossier, elle prouve que Dowe a rempli son obligation."),
        h('li', {}, "Prévenez le référent, Martin Bitha, à support@dowe.app, le jour même."),
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
  guide: ['Guide de modération', pageGuide],
};

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
  state.page = page;
  location.hash = `#/${page}`;
  closeNav();
  window.scrollTo(0, 0);

  for (const btn of document.querySelectorAll('.nav-item')) {
    btn.classList.toggle('active', btn.dataset.page === page);
  }
  $('page-title').textContent = PAGES[page][0];

  const root = $('page-root');
  root.replaceChildren(h('p', { class: 'hint', text: 'Chargement…' }));

  try {
    const fresh = h('div');
    await PAGES[page][1](fresh);
    root.replaceChildren(...fresh.childNodes);
  } catch (e) {
    root.replaceChildren(h('div', { class: 'card' },
      h('h2', { text: 'Chargement impossible' }),
      h('p', { class: 'hint', text: errText(e) })));
  }

  // Le tableau de bord rafraîchit déjà les compteurs ; ailleurs on les
  // recharge en arrière-plan pour que la file reste juste.
  if (page !== 'dashboard') {
    rpc('admin_dashboard').then((d) => { state.dashboard = d; paintCounts(d); }).catch(() => {});
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
  const { data: { session } } = await supabase.auth.getSession();
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
  $('who-email').textContent = session.user.email ?? '';
  $('who-role').textContent = roleLabel;
  $('side-email').textContent = session.user.email ?? '';
  $('side-role').textContent = roleLabel;
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

$('btn-logout').addEventListener('click', logout);
$('btn-denied-logout').addEventListener('click', logout);
$('btn-refresh').addEventListener('click', () => go(state.page));

for (const btn of document.querySelectorAll('.nav-item')) {
  btn.addEventListener('click', () => go(btn.dataset.page));
}

$('btn-burger').addEventListener('click', () => document.body.classList.toggle('nav-open'));
$('nav-backdrop').addEventListener('click', closeNav);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (drawerEl) closeDrawer();
  else closeNav();
});

boot();
