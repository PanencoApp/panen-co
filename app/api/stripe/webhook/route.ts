import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { stripeWebhookSecret } from "@/lib/stripe/config";
import { isServerSupabaseConfigured, serverSupabase } from "@/lib/supabase/server";

type StripeEvent = {
  data?: {
    object?: Record<string, unknown>;
  };
  type?: string;
};

function parseStripeSignature(header: string | null) {
  const parts = new Map<string, string>();

  header?.split(",").forEach((part) => {
    const [key, value] = part.split("=");

    if (key && value) parts.set(key, value);
  });

  return {
    signature: parts.get("v1") ?? "",
    timestamp: parts.get("t") ?? "",
  };
}

function verifyStripeSignature(rawBody: string, signatureHeader: string | null) {
  if (!stripeWebhookSecret) return false;

  const { signature, timestamp } = parseStripeSignature(signatureHeader);

  if (!signature || !timestamp) return false;

  const expected = createHmac("sha256", stripeWebhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const receivedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function subscriptionStatus(status: unknown) {
  const value = typeof status === "string" ? status : "inactive";

  return value === "active" || value === "trialing" ? value : value;
}

function periodEnd(value: unknown) {
  if (typeof value !== "number") return null;

  return new Date(value * 1000).toISOString();
}

function oneYearCommitmentFromNow(plan: unknown) {
  if (plan !== "annual") return null;

  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);

  return date.toISOString();
}

async function upsertSubscription(payload: {
  commitmentUntil?: string | null;
  customerId?: unknown;
  periodEnd?: unknown;
  plan?: unknown;
  priceId?: unknown;
  status?: unknown;
  subscriptionId?: unknown;
  userId?: unknown;
}) {
  const userId = typeof payload.userId === "string" ? payload.userId : "";

  if (!userId) return;

  await serverSupabase!.from("subscriptions").upsert(
    {
      commitment_until: payload.commitmentUntil ?? null,
      current_period_end: periodEnd(payload.periodEnd),
      plan: typeof payload.plan === "string" ? payload.plan : null,
      price_id: typeof payload.priceId === "string" ? payload.priceId : null,
      provider: "stripe",
      provider_customer_id:
        typeof payload.customerId === "string" ? payload.customerId : null,
      provider_subscription_id:
        typeof payload.subscriptionId === "string"
          ? payload.subscriptionId
          : null,
      status: subscriptionStatus(payload.status),
      updated_at: new Date().toISOString(),
      user_id: userId,
    },
    { onConflict: "user_id" },
  );
}

async function updateSubscriptionByProviderId(payload: {
  periodEnd?: unknown;
  status?: unknown;
  subscriptionId?: unknown;
}) {
  const subscriptionId =
    typeof payload.subscriptionId === "string" ? payload.subscriptionId : "";

  if (!subscriptionId) return;

  await serverSupabase!
    .from("subscriptions")
    .update({
      current_period_end: periodEnd(payload.periodEnd),
      status: subscriptionStatus(payload.status),
      updated_at: new Date().toISOString(),
    })
    .eq("provider_subscription_id", subscriptionId);
}

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured || !serverSupabase) {
    return NextResponse.json(
      { error: "Configuration Supabase serveur incomplète." },
      { status: 500 },
    );
  }

  const rawBody = await request.text();

  if (!verifyStripeSignature(rawBody, request.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "Signature Stripe invalide." }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as StripeEvent;
  const object = event.data?.object ?? {};

  if (event.type === "checkout.session.completed") {
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;

    await upsertSubscription({
      commitmentUntil: oneYearCommitmentFromNow(metadata.plan),
      customerId: object.customer,
      plan: metadata.plan,
      priceId: metadata.price_id,
      status: "active",
      subscriptionId: object.subscription,
      userId: object.client_reference_id ?? metadata.user_id,
    });
  }

  if (event.type === "customer.subscription.updated") {
    await updateSubscriptionByProviderId({
      periodEnd: object.current_period_end,
      status: object.status,
      subscriptionId: object.id,
    });
  }

  if (event.type === "customer.subscription.deleted") {
    await updateSubscriptionByProviderId({
      periodEnd: object.current_period_end,
      status: "canceled",
      subscriptionId: object.id,
    });
  }

  return NextResponse.json({ ok: true });
}
