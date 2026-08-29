import { supabase } from "@/lib/supabase/client";

export type SubscriptionPlan = "annual" | "monthly";

export type UserSubscription = {
  currentPeriodEnd: string | null;
  status: string;
};

export function isActiveSubscription(subscription: UserSubscription | null) {
  if (!subscription) return false;

  if (subscription.status !== "active" && subscription.status !== "trialing") {
    return false;
  }

  if (!subscription.currentPeriodEnd) return true;

  return new Date(subscription.currentPeriodEnd).getTime() > Date.now();
}

export async function getMySubscription(userId: string) {
  if (!supabase) return { data: null, error: null };

  const result = await supabase
    .from("subscriptions")
    .select("status,current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) {
    return { data: null, error: result.error };
  }

  return {
    data: result.data
      ? {
          currentPeriodEnd: result.data.current_period_end ?? null,
          status: result.data.status ?? "inactive",
        }
      : null,
    error: null,
  };
}

export async function createSubscriptionCheckout(plan: SubscriptionPlan) {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configuré."),
    };
  }

  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  if (!token) {
    return {
      data: null,
      error: new Error("Connecte-toi pour choisir un abonnement."),
    };
  }

  const response = await fetch("/api/stripe/checkout", {
    body: JSON.stringify({ plan }),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; url?: string }
    | null;

  if (!response.ok || !payload?.url) {
    return {
      data: null,
      error: new Error(payload?.error ?? "Paiement indisponible pour le moment."),
    };
  }

  return {
    data: { url: payload.url },
    error: null,
  };
}

export async function openSubscriptionPortal() {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configuré."),
    };
  }

  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  if (!token) {
    return {
      data: null,
      error: new Error("Connecte-toi pour gérer ton abonnement."),
    };
  }

  const response = await fetch("/api/stripe/portal", {
    headers: {
      authorization: `Bearer ${token}`,
    },
    method: "POST",
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; url?: string }
    | null;

  if (!response.ok || !payload?.url) {
    return {
      data: null,
      error: new Error(payload?.error ?? "Gestion de l'abonnement indisponible."),
    };
  }

  return {
    data: { url: payload.url },
    error: null,
  };
}
