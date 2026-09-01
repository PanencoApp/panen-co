import { NextRequest, NextResponse } from "next/server";
import { appUrl, isStripeConfigured, stripeSecretKey } from "@/lib/stripe/config";
import { isServerSupabaseConfigured, serverSupabase } from "@/lib/supabase/server";

type StripeCustomerList = {
  data?: Array<{
    id?: string;
  }>;
};

type StripeSubscription = {
  current_period_end?: number;
  id?: string;
  items?: {
    data?: Array<{
      price?: {
        id?: string;
      };
    }>;
  };
  metadata?: {
    plan?: string;
  };
  status?: string;
};

type StripeSubscriptionList = {
  data?: StripeSubscription[];
};

type StripeCheckoutSessionList = {
  data?: Array<{
    client_reference_id?: string;
    customer?: string;
    subscription?: string;
  }>;
};

function periodEnd(value?: number) {
  if (!value) return null;

  return new Date(value * 1000).toISOString();
}

async function fetchStripeJson<T>(path: string) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: {
      authorization: `Bearer ${stripeSecretKey}`,
    },
    method: "GET",
  });
  const data = (await response.json().catch(() => null)) as T | null;

  return { data, ok: response.ok };
}

function activeSubscription(subscription?: StripeSubscription | null) {
  if (!subscription?.id) return null;

  if (subscription.status !== "active" && subscription.status !== "trialing") {
    return null;
  }

  return subscription;
}

async function findLiveSubscriptionByEmail(email?: string | null) {
  if (!email) return null;

  const customers = await fetchStripeJson<StripeCustomerList>(
    `customers?email=${encodeURIComponent(email)}&limit=10`,
  );

  if (!customers.ok) return null;

  for (const customer of customers.data?.data ?? []) {
    if (!customer.id) continue;

    const subscriptions = await fetchStripeJson<StripeSubscriptionList>(
      `subscriptions?customer=${encodeURIComponent(customer.id)}&status=all&limit=10`,
    );

    if (!subscriptions.ok) continue;

    const subscription = (subscriptions.data?.data ?? []).find((item) =>
      activeSubscription(item),
    );

    if (!subscription?.id) continue;

    return {
      customerId: customer.id,
      subscription,
    };
  }

  return null;
}

async function findLiveSubscriptionByCheckoutSession(userId: string) {
  const sessions = await fetchStripeJson<StripeCheckoutSessionList>(
    "checkout/sessions?limit=100",
  );

  if (!sessions.ok) return null;

  for (const session of sessions.data?.data ?? []) {
    if (session.client_reference_id !== userId) continue;
    if (!session.customer || !session.subscription) continue;

    const subscription = await fetchStripeJson<StripeSubscription>(
      `subscriptions/${encodeURIComponent(session.subscription)}`,
    );
    const active = activeSubscription(subscription.data);

    if (!subscription.ok || !active) continue;

    return {
      customerId: session.customer,
      subscription: active,
    };
  }

  return null;
}

async function repairSubscriptionCustomer(userId: string, email?: string | null) {
  const liveSubscription =
    (await findLiveSubscriptionByEmail(email)) ??
    (await findLiveSubscriptionByCheckoutSession(userId));

  if (!liveSubscription) return null;

  const plan =
    liveSubscription.subscription.metadata?.plan === "annual" ||
    liveSubscription.subscription.metadata?.plan === "monthly"
      ? liveSubscription.subscription.metadata.plan
      : null;
  const priceId = liveSubscription.subscription.items?.data?.[0]?.price?.id ?? null;

  await serverSupabase!
    .from("subscriptions")
    .update({
      current_period_end: periodEnd(
        liveSubscription.subscription.current_period_end,
      ),
      plan,
      price_id: priceId,
      provider_customer_id: liveSubscription.customerId,
      provider_subscription_id: liveSubscription.subscription.id,
      status: liveSubscription.subscription.status ?? "active",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return liveSubscription.customerId;
}

async function createPortalSession(customerId: string) {
  const body = new URLSearchParams();
  body.set("customer", customerId);
  body.set("return_url", appUrl);

  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    body,
    headers: {
      authorization: `Bearer ${stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string }; url?: string }
    | null;

  return { payload, response };
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

  let { payload, response: portal } = await createPortalSession(customerId);

  if (!portal.ok && payload?.error?.message?.includes("No such customer")) {
    const repairedCustomerId = await repairSubscriptionCustomer(user.id, user.email);

    if (repairedCustomerId) {
      ({ payload, response: portal } = await createPortalSession(repairedCustomerId));
    }
  }

  if (!portal.ok || !payload?.url) {
    return NextResponse.json(
      { error: payload?.error?.message ?? "Portail Stripe indisponible." },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: payload.url });
}
