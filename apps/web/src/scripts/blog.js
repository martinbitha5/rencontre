// Blog : recherche et actualisation en arrière-plan.
//
// Les articles sont déjà dans la page (écrits à la construction). Ce script
// ne bloque donc rien : il branche la recherche, puis vérifie discrètement
// auprès de Supabase si un article a été publié ou retiré depuis la dernière
// construction. Si oui, la liste est redessinée, avec le même balisage.
import { SUPABASE_URL, SUPABASE_KEY } from '../lib/supabase-public.js';

const box = document.getElementById('content');
const built = JSON.parse(document.getElementById('posts-data').textContent || '[]');
const builtBySlug = new Map(built.map((p) => [p.slug, p]));
let ALL = built;

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function readTime(post) {
  const words = String(post.content || post.excerpt || '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200)) + ' min de lecture';
}

const cardMeta = (post) => post.meta || fmtDate(post.published_at) + ' · ' + readTime(post);

// Un article déjà construit a sa page statique ; un article publié depuis
// passe par la page de secours, qui le lit en direct.
const hrefOf = (post) =>
  builtBySlug.has(post.slug)
    ? '/article/' + encodeURIComponent(post.slug)
    : 'article.html?slug=' + encodeURIComponent(post.slug);

function makeCover(post, eager) {
  const cover = document.createElement('div');
  cover.className = 'cover';
  if (!post.cover_url) return cover;

  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.loading = eager ? 'eager' : 'lazy';
  img.fetchPriority = eager ? 'high' : 'low';
  const reveal = () => cover.classList.add('loaded');
  img.addEventListener('load', reveal);
  img.addEventListener('error', reveal);
  if (post.cover) {
    img.srcset = post.cover.srcset;
    img.sizes = eager ? '(max-width: 820px) 100vw, 560px' : '(max-width: 820px) 100vw, 540px';
    img.src = post.cover.src;
  } else {
    img.src = encodeURI(post.cover_url);
  }
  if (img.complete) reveal();
  cover.append(img);
  return cover;
}

function card(post) {
  const a = document.createElement('a');
  a.className = 'post';
  a.href = hrefOf(post);
  const k = document.createElement('p'); k.className = 'kicker'; k.textContent = 'Article';
  const h = document.createElement('h2'); h.textContent = post.title;
  const p = document.createElement('p'); p.className = 'excerpt'; p.textContent = post.excerpt || '';
  const m = document.createElement('p'); m.className = 'meta'; m.textContent = cardMeta(post);
  a.append(makeCover(post, false), k, h, p, m);
  return a;
}

function render(posts) {
  if (!posts.length) {
    box.className = 'state';
    box.textContent = 'Les premiers articles arrivent très bientôt.';
    return;
  }
  const [latest, ...rest] = posts;
  const frag = document.createDocumentFragment();

  const feat = document.createElement('a');
  feat.className = 'featured';
  feat.href = hrefOf(latest);
  const body = document.createElement('div');
  const k = document.createElement('p'); k.className = 'kicker'; k.textContent = 'Article';
  const h = document.createElement('h2'); h.textContent = latest.title;
  const ex = document.createElement('p'); ex.className = 'excerpt'; ex.textContent = latest.excerpt || '';
  const m = document.createElement('p'); m.className = 'meta'; m.textContent = cardMeta(latest);
  body.append(k, h, ex, m);
  const featCover = makeCover(latest, true);
  feat.append(featCover, body);
  frag.append(feat);

  const featImg = featCover.querySelector('img');
  if (featImg) {
    const paint = () => {
      document.getElementById('hero').style.backgroundImage = "url('" + (featImg.currentSrc || featImg.src) + "')";
    };
    if (featImg.complete) paint(); else featImg.addEventListener('load', paint, { once: true });
  }

  if (rest.length) {
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const post of rest) grid.append(card(post));
    frag.append(grid);
  }
  box.className = '';
  box.replaceChildren(frag);
}

function renderResults(posts) {
  if (!posts.length) {
    box.className = 'state';
    box.textContent = 'Aucun article ne correspond à votre recherche.';
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const post of posts) grid.append(card(post));
  box.className = '';
  box.replaceChildren(grid);
}

// ---------- Recherche ----------
const norm = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const searchBtn = document.getElementById('search-btn');
const searchPanel = document.getElementById('search-panel');
const searchInput = document.getElementById('search-input');
const searchCount = document.getElementById('search-count');
const searching = () => searchPanel.classList.contains('open') && searchInput.value.trim();

searchBtn.addEventListener('click', () => {
  const open = searchPanel.classList.toggle('open');
  searchBtn.setAttribute('aria-expanded', open);
  if (open) {
    searchInput.focus();
    searchPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    searchInput.value = '';
    searchCount.textContent = '';
    render(ALL);
  }
});

searchInput.addEventListener('input', () => {
  const q = norm(searchInput.value.trim());
  if (!q) {
    searchCount.textContent = '';
    render(ALL);
    return;
  }
  const hits = ALL.filter((p) => norm(p.title).includes(q) || norm(p.excerpt).includes(q) || norm(p.content).includes(q));
  searchCount.textContent = hits.length + (hits.length > 1 ? ' résultats' : ' résultat');
  renderResults(hits);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') searchBtn.click();
});

// ---------- Actualisation en arrière-plan ----------
const signature = (posts) =>
  posts.map((p) => [p.slug, p.title, p.excerpt, p.cover_url, p.published_at].join('|')).join('\n');

async function refresh() {
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/posts?select=slug,title,excerpt,content,cover_url,published_at' +
        '&published=eq.true&order=published_at.desc&limit=200',
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } },
    );
    if (!res.ok) return;
    const fresh = await res.json();
    if (signature(fresh) === signature(built)) return;
    // On garde les couvertures réduites des articles déjà construits.
    ALL = fresh.map((p) => {
      const b = builtBySlug.get(p.slug);
      return b && b.cover_url === p.cover_url ? { ...p, cover: b.cover } : p;
    });
    if (!searching()) render(ALL);
  } catch {
    /* hors ligne : la liste construite reste affichée */
  }
}

// Après l'affichage, sans concurrencer les images de la page.
if ('requestIdleCallback' in window) requestIdleCallback(refresh, { timeout: 4000 });
else setTimeout(refresh, 1500);
