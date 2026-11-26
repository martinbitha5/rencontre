// Articles du blog, lus dans Supabase AU MOMENT DE LA CONSTRUCTION.
//
// Avant, chaque visiteur ouvrait une page vide qui demandait ensuite les
// articles à Supabase (jusqu'à 7 secondes mesurées au premier appel), puis
// téléchargeait la couverture d'origine (2,2 Mo). Ici, le travail est fait
// une fois pour toutes pendant `npm run build` : le texte est déjà dans la
// page et les couvertures sont réduites en WebP.
import { getImage } from 'astro:assets';
import sharp from 'sharp';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

import { SUPABASE_URL, SUPABASE_KEY } from './supabase-public.js';

const POSTS_QUERY =
  '/rest/v1/posts?select=slug,title,excerpt,content,cover_url,published_at' +
  '&published=eq.true&order=published_at.desc&limit=200';

let postsPromise;

// Une seule requête pour toute la construction (blog, articles, sitemap).
// Si Supabase ne répond pas, la construction échoue au lieu de publier un
// blog vide.
export function getPosts() {
  postsPromise ??= (async () => {
    let lastError;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const res = await fetch(SUPABASE_URL + POSTS_QUERY, {
          headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
        });
        if (!res.ok) throw new Error('Supabase a répondu ' + res.status);
        return await res.json();
      } catch (error) {
        lastError = error;
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
    throw new Error('Impossible de lire les articles du blog : ' + lastError?.message);
  })();
  return postsPromise;
}

export function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function readTime(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200)) + ' min de lecture';
}

export function cardMeta(post) {
  return fmtDate(post.published_at) + ' · ' + readTime(post.content || post.excerpt);
}

export const articlePath = (slug) => '/article/' + encodeURIComponent(slug);

// Trois versions par couverture : 600 et 1200 px en WebP pour les pages,
// 1000 px en JPEG pour les aperçus WhatsApp et Facebook (plus compatibles,
// et sous les 300 Ko que WhatsApp accepte). Une image plus étroite que la
// taille demandée n'est jamais agrandie : le srcset annonce donc la largeur
// réellement produite.
//
// Orientation : une photo de téléphone est souvent enregistrée couchée avec
// une consigne de rotation (EXIF). Astro lit la taille brute et déformait
// l'image (1200 x 4032 au lieu de 1200 x 1600). On lit donc l'orientation
// avec sharp et on fournit nous-mêmes la largeur ET la hauteur à l'écran.
async function displaySize(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error('Couverture introuvable : ' + src);
  const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
  const turned = meta.orientation >= 5; // 5 à 8 : quart de tour
  return turned ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
}

export async function coverSet(url) {
  if (!url) return null;
  const src = encodeURI(url);
  const size = await displaySize(src);
  const at = (width) => ({ width, height: Math.round((width * size.height) / size.width) });
  const smallW = Math.min(600, size.width);
  const largeW = Math.min(1200, size.width);
  const [small, large, og] = await Promise.all([
    getImage({ src, ...at(smallW), format: 'webp', quality: 62 }),
    getImage({ src, ...at(largeW), format: 'webp', quality: 62 }),
    getImage({ src, ...at(Math.min(1000, size.width)), format: 'jpg', quality: 60 }),
  ]);
  const srcset = smallW >= largeW
    ? `${large.src} ${largeW}w`
    : `${small.src} ${smallW}w, ${large.src} ${largeW}w`;
  return { src: large.src, srcset, og: new URL(og.src, 'https://zola-rdc.com').href };
}

// Même rendu que l'ancienne page (marked + nettoyage), mais fait une fois
// à la construction au lieu de charger deux librairies chez chaque visiteur.
export function renderMarkdown(markdown) {
  return sanitizeHtml(marked.parse(markdown || ''), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2']),
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
    },
  });
}

export function excerptOf(post) {
  return String(post.excerpt || post.content || '')
    .replace(/[#*_>\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
}
