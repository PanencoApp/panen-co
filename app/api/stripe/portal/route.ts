import { NextRequest, NextResponse } from "next/server";
import { appUrl, isStripeConfigured, stripeSecretKey } from "@/lib/stripe/config";
import { isServerSupabaseConfigured, serverSupabase } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured || !serverSupabase) {
    return NextResponse.json(
      { error: "Configuration Supabase serveur incomplète." },
      { status: 500 },
    );
  }

  if (!isStripeConfigured) {
    return NextResponse.json(
      { error: "Configuration Stripe incomplète." },
      { status: 500 },
    );
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Utilisateur non connecté." }, { status: 401 });
  }

  const auth = await serverSupabase.auth.getUser(token);
  const user = auth.data.user;

  if (auth.error || !user) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  const subscription = await serverSupabase
    .from("subscriptions")
    .select("provider_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const customerId = subscription.data?.provider_customer_id;

  if (!customerId) {
    return NextResponse.json(
      { error: "Aucun abonnement Stripe trouvé pour ce compte." },
      { status: 404 },
    );
  }

  const body = new URLSearchParams();
  body.set("customer", customerId);
  body.set("return_url", appUrl);

  const portal = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    body,
    headers: {
      authorization: `Bearer ${stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  const payload = (await portal.json().catch(() => null)) as
    | { error?: { message?: string }; url?: string }
    | null;

  if (!portal.ok || !payload?.url) {
    return NextResponse.json(
      { error: payload?.error?.message ?? "Portail Stripe indisponible." },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: payload.url });
}
