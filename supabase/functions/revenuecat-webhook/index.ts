import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  product_id?: string;
  transaction_id?: string;
  store?: string;
  environment?: string;
}

const KNOWN_PRODUCTS = new Set([
  'decouverte',
  'elan',
  'envol',
  'prestige',
  '3m',
  '6m',
  '12m',
]);

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const expectedAuthorization = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (!expectedAuthorization) {
    console.error('REVENUECAT_WEBHOOK_AUTH is not configured');
    return json(500, { error: 'webhook_not_configured' });
  }

  const authorization = request.headers.get('authorization') ?? '';
  if (!constantTimeEqual(authorization, `Bearer ${expectedAuthorization}`)) {
    return json(401, { error: 'unauthorized' });
  }

  let event: RevenueCatEvent;
  try {
    const payload = await request.json();
    event = payload?.event;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  if (!event || event.type === 'TEST') return json(200, { received: true });
  if (
    !['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE'].includes(event.type ?? '') ||
    !['APP_STORE', 'PLAY_STORE'].includes(event.store ?? '')
  ) {
    return json(200, { received: true, ignored: true });
  }

  const productId = event.product_id?.split(':', 1)[0];
  if (!productId || !KNOWN_PRODUCTS.has(productId)) {
    console.warn('Ignoring unknown RevenueCat product', event.product_id);
    return json(200, { received: true, ignored: true });
  }

  if (
    !event.id ||
    !event.transaction_id ||
    !event.app_user_id ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      event.app_user_id,
    ) ||
    !['SANDBOX', 'PRODUCTION'].includes(event.environment ?? '')
  ) {
    return json(200, { received: true, ignored: true });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { error } = await admin.rpc('credit_revenuecat_purchase', {
    p_event_id: event.id,
    p_transaction_id: event.transaction_id,
    p_user: event.app_user_id,
    p_product_id: productId,
    p_event_type: event.type,
    p_store: event.store,
    p_environment: event.environment,
  });

  if (error) {
    console.error('RevenueCat purchase processing failed', event.id, error);
    return json(500, { error: 'purchase_processing_failed' });
  }

  return json(200, { received: true });
});