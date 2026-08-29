import { NextRequest, NextResponse } from "next/server";
import {
  appUrl,
  isStripeConfigured,
  stripeAnnualPriceId,
  stripeMonthlyPriceId,
  stripeSecretKey,
} from "@/lib/stripe/config";
import { isServerSupabaseConfigured, serverSupabase } from "@/lib/supabase/server";

function stripeBody(entries: Record<string, string>) {
  const body = new URLSearchParams();

  Object.entries(entries).forEach(([key, value]) => {
    body.set(key, value);
  });

  return body;
}

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

  const existingSubscription = await serverSupabase
    .from("subscriptions")
    .select("status,current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingSubscription.error) {
    return NextResponse.json(
      { error: "Impossible de vérifier l'abonnement en cours." },
      { status: 500 },
    );
  }

  const activePeriodEnd = existingSubscription.data?.current_period_end
    ? new Date(existingSubscription.data.current_period_end).getTime()
    : null;
  const alreadySubscribed =
    existingSubscription.data &&
    (existingSubscription.data.status === "active" ||
      existingSubscription.data.status === "trialing") &&
    (!activePeriodEnd || activePeriodEnd > Date.now());

  if (alreadySubscribed) {
    return NextResponse.json(
      { error: "Tu as déjà un abonnement en cours." },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { plan?: "annual" | "monthly" }
    | null;
  const plan = body?.plan === "annual" ? "annual" : "monthly";
  const priceId = plan === "annual" ? stripeAnnualPriceId : stripeMonthlyPriceId;
  const commitmentMonths = plan === "annual" ? "12" : "0";
  const origin = request.headers.get("origin") || appUrl;

  const checkout = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    body: stripeBody({
      allow_promotion_codes: "true",
      cancel_url: `${origin}/?stripe=cancel`,
      client_reference_id: user.id,
      customer_email: user.email ?? "",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "metadata[plan]": plan,
      "metadata[price_id]": priceId,
      "metadata[user_id]": user.id,
      mode: "subscription",
      "subscription_data[metadata][commitment_months]": commitmentMonths,
      "subscription_data[metadata][price_id]": priceId,
      "subscription_data[metadata][plan]": plan,
      "subscription_data[metadata][user_id]": user.id,
      success_url: `${origin}/?stripe=success`,
    }),
    headers: {
      authorization: `Bearer ${stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  const payload = (await checkout.json().catch(() => null)) as
    | { error?: { message?: string }; url?: string }
    | null;

  if (!checkout.ok || !payload?.url) {
    return NextResponse.json(
      { error: payload?.error?.message ?? "Session Stripe non créée." },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: payload.url });
}
