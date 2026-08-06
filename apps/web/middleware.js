// Géoblocage : le portail Dowe n'est accessible que depuis la RDC.
// Vercel ajoute automatiquement l'en-tête `x-vercel-ip-country` (code pays ISO
// déduit de l'IP du visiteur). Le code de la RDC est « CD ».
//
// Comportement :
//   - Visiteur en RDC (CD)         -> accès autorisé
//   - Pas d'en-tête pays (dev local, IP inconnue) -> autorisé (pour développer)
//   - Tout autre pays              -> redirigé vers /indisponible.html
//
// Limite connue : la géoloc par IP se contourne avec un VPN. Aucun géoblocage
// (même celui de Netflix) n'est infaillible.

// Exception importante : les pages légales restent accessibles depuis le monde
// entier. Apple et Google examinent les applications depuis les États-Unis et
// exigent des URL de conditions, de confidentialité et de sécurité des enfants
// joignables ; une page légale géobloquée fait échouer la revue.
export const config = {
  // S'exécute sur toutes les routes SAUF la page de blocage elle-même, les
  // pages légales, les feuilles de style qu'elles partagent, les fichiers
  // internes Vercel et le favicon (pour éviter une boucle).
  //
  // theme.css et legal.css doivent rester joignables : une page exemptée dont
  // la feuille de style est redirigée s'affiche sans style. Toute nouvelle
  // ressource chargée par ces pages est à ajouter ici.
  matcher: [
    // payer et paiement-retour : pages du flux MultiPay (Interswitch). Elles
    // sont ouvertes dans le navigateur intégré de l'app et par la redirection
    // d'Interswitch ; un géoblocage ici casserait un paiement en cours.
    '/((?!indisponible|conditions|confidentialite|conseils|securite-enfants|mentions-legales|contact|payer|paiement-retour|theme\\.css|legal\\.css|_vercel|favicon\\.ico).*)',
  ],
};

const PAYS_AUTORISE = 'CD'; // République Démocratique du Congo

export default function middleware(request) {
  const pays = request.headers.get('x-vercel-ip-country');

  // Autorisé : en RDC, ou pas d'info pays (ex. développement local).
  if (!pays || pays === PAYS_AUTORISE) {
    return;
  }

  // Bloqué : redirection vers la page « indisponible ».
  return Response.redirect(new URL('/indisponible.html', request.url), 307);
}
