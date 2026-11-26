// Plan du site pour Google, généré à chaque construction. Avant, chaque
// article devait être ajouté à la main ; maintenant la liste vient de
// Supabase et pointe vers les pages statiques /article/<slug>.
import { getPosts, articlePath } from '../lib/blog.js';

const PAGES = [
  ['/', '2026-11-24', 'weekly', '1.0'],
  ['/blog', null, 'weekly', '0.8'],
  ['/faq', '2026-11-24', 'monthly', '0.7'],
  ['/conseils', '2026-11-24', 'monthly', '0.6'],
  ['/contact', '2026-11-24', 'monthly', '0.5'],
  ['/conditions', '2026-09-15', 'yearly', '0.3'],
  ['/confidentialite', '2026-09-13', 'yearly', '0.3'],
  ['/securite-enfants', '2026-09-15', 'yearly', '0.3'],
  ['/mentions-legales', '2026-09-15', 'yearly', '0.2'],
];

const day = (iso) => (iso ? String(iso).slice(0, 10) : null);
const url = (loc, lastmod, freq, prio) =>
  `  <url><loc>https://zola-rdc.com${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}` +
  `<changefreq>${freq}</changefreq><priority>${prio}</priority></url>`;

export async function GET() {
  const posts = await getPosts();
  const newest = day(posts[0]?.published_at) || '2026-09-15';
  const lines = [
    ...PAGES.map(([loc, lastmod, freq, prio]) => url(loc, lastmod || newest, freq, prio)),
    ...posts.map((p) => url(articlePath(p.slug), day(p.published_at), 'monthly', '0.6')),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lines.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
