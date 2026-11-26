// Site public et backoffice de Zola, construits par Astro.
//
// Le résultat (dossier dist/) est un site 100 % statique : on le dépose tel
// quel sur Hostinger, comme avant. Ce qui change, c'est ce qui se passe AVANT
// le dépôt : les articles du blog sont écrits dans les pages, les couvertures
// sont réduites, le code de l'admin est regroupé et compressé.
//
// Règle de design : les pages gardent leur HTML et leur CSS d'origine
// (`is:inline` partout), le rendu doit rester identique au pixel près.
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://zola-rdc.com',
  // blog.astro -> blog.html, article/x.astro -> article/x.html : les mêmes
  // noms de fichiers qu'avant, donc le .htaccess et tous les liens existants
  // (« faq.html », « /blog ») continuent de marcher.
  build: { format: 'file', assets: '_astro' },
  // Pas de réécriture des espaces : le HTML sort tel qu'il est écrit.
  compressHTML: false,
  // Les couvertures du blog vivent dans le stockage Supabase. Astro les
  // télécharge à la construction et en fait des WebP légers.
  image: { domains: ['sbsxgwdpdjxsrxcccwno.supabase.co'] },
  server: { port: 4173 },
  vite: { build: { chunkSizeWarningLimit: 800 } },
});
