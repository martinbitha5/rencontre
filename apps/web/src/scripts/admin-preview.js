// Données fictives de l'aperçu local du backoffice (/admin?apercu, en
// `npm run dev` seulement). Jamais incluses dans le site construit.
const day = (i) => new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10);
const series = Array.from({ length: 14 }, (_, i) => ({
  day: day(i),
  signups: [0, 1, 0, 2, 1, 0, 3, 1, 2, 4, 1, 0, 2, 3][i],
  reports: [0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 0, 1][i],
}));

const PREVIEW = {
  my_admin_role: 'owner',
  admin_dashboard: {
    reports: { pending: 3, in_review: 1, oldest_pending_hours: 5, critical_open: 1 },
    users: { total: 148, onboarded: 131, active_24h: 37, new_24h: 4, banned: 2, shadowbanned: 1, premium: 0 },
    safety: { csae_open: 1, photos_flagged: 2, bans_7d: 1, warnings_7d: 3, blocks_7d: 5 },
    activity: { swipes_24h: 412, matches_24h: 26, messages_24h: 318, photos_total: 512, events_active: 1 },
    economy: { coins_circulating: 0, spent_7d: 0, recharges_7d: 0, event_revenue_7d: 0 },
    series,
  },
  admin_list_verifications: { pending: 2, items: [] },
  admin_inbound_mail_counts: { new: 4, securite_new: 0 },
  admin_list_waitlist: { total: 121, week: 9, items: [] },
};

const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
const people = [
  ['Grace M.', 24, 'Kinshasa', 'femme'], ['Patrick K.', 29, 'Lubumbashi', 'homme'],
  ['Merveille T.', 22, 'Kinshasa', 'femme'], ['Jonathan B.', 31, 'Goma', 'homme'],
  ['Sarah N.', 27, 'Kinshasa', 'femme'], ['Cédric L.', 26, 'Matadi', 'homme'],
];
const user = (i, extra = {}) => ({
  user_id: `u${i}`, display_name: people[i][0], age: people[i][1], city: people[i][2], gender: people[i][3],
  public_id: `DW-${48210 + i}`, photo: null, is_banned: false, shadowbanned: false, is_verified: i % 2 === 0,
  warnings_count: 0, open_reports: 0, reports_count: 0, created_at: ago(24 * (i + 2)), last_active_at: ago(i + 1), ...extra,
});

Object.assign(PREVIEW, {
  admin_list_reports: {
    total: 4,
    items: [
      { id: 'r1', severity: 'critical', reason: 'mineur', status: 'pending', created_at: ago(1), reported: user(2, { reports_count: 2 }), reporter: { display_name: 'Patrick K.' } },
      { id: 'r2', severity: 'high', reason: 'harcelement', status: 'pending', created_at: ago(5), reported: user(3, { reports_count: 1 }), reporter: { display_name: 'Grace M.' } },
      { id: 'r3', severity: 'normal', reason: 'faux_profil', status: 'in_review', created_at: ago(9), reported: user(5), reporter: { display_name: 'Sarah N.' } },
      { id: 'r4', severity: 'normal', reason: 'contenu_inapproprie', status: 'pending', created_at: ago(20), reported: user(1), reporter: null },
    ],
  },
  admin_list_users: {
    total: 6,
    items: people.map((_, i) => user(i, i === 3 ? { warnings_count: 1, open_reports: 1 } : i === 5 ? { shadowbanned: true } : {})),
  },
  admin_list_inbound_mail: {
    items: [
      { id: 'm1', category: 'partenaires', status: 'new', from_name: 'Le Bar Matonge', from_address: 'contact@barmatonge.cd', subject: 'Soirée Zola le 12 décembre', body_preview: 'Bonjour, nous aimerions organiser une soirée avec vous.', received_at: ago(2) },
      { id: 'm2', category: 'support', status: 'new', from_name: 'Grace M.', from_address: 'grace@example.com', subject: 'Je ne reçois pas le code', body_preview: 'Le SMS ne vient pas.', received_at: ago(6) },
      { id: 'm3', category: 'contact', status: 'handled', from_name: 'Radio Okapi', from_address: 'redaction@example.com', subject: 'Demande d\'interview', body_preview: 'Bonjour à l\'équipe.', received_at: ago(30), handled_by_email: 'equipe@zola-rdc.com', note: 'Répondu' },
    ],
  },
  admin_list_audit: {
    items: [
      { action: 'warn_user', actor: 'equipe@zola-rdc.com', created_at: ago(3), target_name: 'Jonathan B.', target_user_id: 'u3', reason: 'Messages insistants', metadata: {} },
      { action: 'review_verification', actor: 'equipe@zola-rdc.com', created_at: ago(7), target_name: 'Grace M.', target_user_id: 'u0', reason: null, metadata: { approved: true } },
    ],
  },
  admin_list_photos: { total: 0, items: [] },
  admin_list_admins: [
    { user_id: 'a1', email: 'equipe@zola-rdc.com', full_name: 'Équipe Zola', role: 'owner', is_active: true, last_sign_in_at: ago(1) },
  ],
});
PREVIEW.admin_list_waitlist = {
  total: 121, week: 9,
  items: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, email: `inscrit${i + 1}@example.com`, platform: ['android', 'ios', null][i % 3], source: 'site', created_at: ago(10 * i + 1), welcome_sent_at: ago(10 * i), notified_at: null })),
};

export default PREVIEW;

// Recherche côté « base » : les deux listes paginées filtrent comme le
// ferait la vraie RPC.
const match = (q, ...fields) => !q || fields.some((f) => String(f || '').toLowerCase().includes(q.toLowerCase()));
const allUsers = PREVIEW.admin_list_users.items;
const allReports = PREVIEW.admin_list_reports.items;
PREVIEW.admin_list_users = ({ p_search } = {}) => {
  const items = allUsers.filter((u) => match(p_search, u.display_name, u.public_id, u.city));
  return { total: items.length, items: structuredClone(items) };
};
PREVIEW.admin_list_reports = ({ p_search } = {}) => {
  const items = allReports.filter((r) => match(p_search, r.reported.display_name));
  return { total: items.length, items: structuredClone(items) };
};

PREVIEW.events = [
  { id: 'e1', name: 'Soirée Zola au Fleuve Congo', price_cdf: 0, qr_token: '4f1c9a2e-demo', is_active: true, ends_at: new Date(Date.now() + 6 * 36e5).toISOString(), created_at: ago(30) },
  { id: 'e2', name: 'Le Bar Matonge', price_cdf: 10000, qr_token: '8b2d7e11-demo', is_active: false, ends_at: ago(48), created_at: ago(200) },
];
// Les images du site servent de selfie et de photos de profil fictifs.
const shot = (name) => `${location.origin}/img/scene-${name}-928.webp`;
PREVIEW.admin_list_verifications = (args) => {
  const items = [
    { id: 'v1', status: 'pending', gesture: 'paume_face', selfie_path: shot('profil'), created_at: ago(2),
      user: { ...user(0), photos: [shot('match'), shot('intentions'), shot('soiree')] } },
    { id: 'v2', status: 'approved', gesture: 'index_leve', selfie_path: 'u1/old.jpg', created_at: ago(30), reviewed_at: ago(28),
      user: { ...user(1), photos: [shot('affiche')] } },
  ].filter((v) => !args.p_status || v.status === args.p_status);
  return { total: items.length, pending: 1, items };
};

PREVIEW.admin_event_stats ={ entries: 42, verified: 30, matches: 11, likes: 96, revenue_cdf: 0, open: true, passes_live: 57, attendees: [] };
