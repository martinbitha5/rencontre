// Callback de dépôt pawaPay (statut final COMPLETED ou FAILED).
//
// Comme multipay-webhook, cette fonction ne crédite rien elle-même : elle
// extrait le depositId et frappe à la seule porte du crédit, pawapay-return,
// en POST JSON. pawapay-return relit le dépôt chez pawaPay avant tout octroi :
// un callback forgé ne peut donc rien accorder, au pire il déclenche une
// vérification de plus. C'est la pratique recommandée par la doc (le callback
// est un déclencheur, le GET fait foi), et c'est pourquoi la signature
// RFC 9421 optionnelle n'est pas exigée ici.
//
// pawaPay réessaie jusqu'à 8 fois sur 25 minutes tant qu'il ne reçoit pas
// 200 : on répond 200 quand le message est traité ou sans objet, 500 quand
// notre chaîne a flanché et qu'un nouvel essai a du sens.
//
// À configurer dans le tableau de bord pawaPay (Callback URLs > Deposits) :
//   https://<projet>.supabase.co/functions/v1/pawapay-webhook
// Déploiement sans vérification JWT.
//
// Doc : https://docs.pawapay.io/v2/api-reference/deposits/deposit-callback
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });

  let depositId = '';
  try {
    const body = await req.json();
    depositId = typeof body?.depositId === 'string' ? body.depositId : '';
    console.log('pawapay callback', depositId, body?.status);
  } catch {
    console.error('pawapay callback illisible');
    return new Response(null, { status: 200 });
  }
  if (!UUID_RE.test(depositId)) return new Response(null, { status: 200 });

  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/pawapay-return`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ ref: depositId }),
    });
    // 404 : dépôt qui n'est pas une commande Zola pawaPay, rien à réessayer.
    if (res.status === 404) return new Response(null, { status: 200 });
    if (res.ok) {
      // Encore pending après un callback final : pawaPay était injoignable au
      // moment de la relecture. 500 pour obtenir un nouvel essai.
      const result = await res.json().catch(() => null);
      if (result?.status === 'pending') return new Response(null, { status: 500 });
      return new Response(null, { status: 200 });
    }
    console.error('pawapay-return a échoué', depositId, res.status);
    return new Response(null, { status: 500 });
  } catch (err) {
    console.error('pawapay-return injoignable', depositId, err);
    return new Response(null, { status: 500 });
  }
});
