import { supabase } from "@/lib/supabase/client";

export type WinningsWallet = {
  balance: number;
  totalEarned: number;
  withdrawn: number;
};

export type WithdrawalRequest = {
  id: string;
  amount: number;
  createdAt: string;
  ibanLast4: string;
  paypalEmail?: string;
  provider?: string;
  status: string;
};

export type AdminWithdrawalRequest = WithdrawalRequest & {
  holderName: string;
  note?: string;
  providerPayoutId?: string;
  providerStatus?: string;
  updatedAt: string;
  userEmail: string;
  userPseudo: string;
};

export type AdminUserOverview = {
  completedPredictionCount: number;
  createdAt: string;
  email: string;
  emailConfirmed: boolean;
  id: string;
  isAdmin: boolean;
  lastActivityAt: string | null;
  monthlyPoints: number;
  predictionCount: number;
  pseudo: string;
  subscriptionStatus: string;
  subscriptionUntil: string | null;
  weeklyPoints: number;
  weeklyReward: number;
};

export type AdminDashboard = {
  scores: {
    month: AdminUserOverview[];
    week: AdminUserOverview[];
  };
  summary: {
    activeSubscriptions: number;
    totalPredictions: number;
    totalUsers: number;
    verifiedEmails: number;
  };
  users: AdminUserOverview[];
};

export async function getMyWinnings(userId: string): Promise<WinningsWallet> {
  if (!supabase) return { balance: 0, totalEarned: 0, withdrawn: 0 };

  const result = await supabase
    .from("user_winnings")
    .select("balance_euros, total_earned_euros, withdrawn_euros")
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error || !result.data) {
    return { balance: 0, totalEarned: 0, withdrawn: 0 };
  }

  return {
    balance: result.data.balance_euros ?? 0,
    totalEarned: result.data.total_earned_euros ?? 0,
    withdrawn: result.data.withdrawn_euros ?? 0,
  };
}

export async function syncMyWeeklyWinnings() {
  if (!supabase) return { ok: false };

  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  if (!token) return { ok: false };

  const response = await fetch("/api/winnings/sync", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    method: "POST",
  });

  return { ok: response.ok };
}

export async function getMyWithdrawalRequests(
  userId: string,
): Promise<WithdrawalRequest[]> {
  if (!supabase) return [];

  const result = await supabase
    .from("withdrawal_requests")
    .select("id, amount_euros, iban_last4, paypal_email, provider, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (result.error) return [];

  return (result.data ?? []).map((request) => ({
    id: request.id,
    amount: request.amount_euros ?? 0,
    createdAt: request.created_at ?? new Date().toISOString(),
    ibanLast4: request.iban_last4 ?? "",
    paypalEmail: request.paypal_email ?? "",
    provider: request.provider ?? "",
    status: request.status ?? "pending",
  }));
}

export async function requestWithdrawal({
  amount,
  paypalEmail,
}: {
  amount: number;
  paypalEmail: string;
}) {
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
      error: new Error("Connecte-toi pour demander un retrait."),
    };
  }

  const response = await fetch("/api/withdrawals/request", {
    body: JSON.stringify({ amount, paypalEmail }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        balance?: number;
        error?: string;
        withdrawal?: {
          id: string;
          amount_euros: number;
          iban_last4: string;
          paypal_email?: string;
          provider?: string;
          status: string;
          created_at: string;
        };
      }
    | null;

  if (!response.ok || !payload?.withdrawal) {
    return {
      data: null,
      error: new Error(payload?.error ?? "Impossible de créer le retrait."),
    };
  }

  return {
    data: {
      balance: payload.balance ?? 0,
      withdrawal: {
        id: payload.withdrawal.id,
        amount: payload.withdrawal.amount_euros,
        createdAt: payload.withdrawal.created_at,
        ibanLast4: payload.withdrawal.iban_last4,
        paypalEmail: payload.withdrawal.paypal_email ?? "",
        provider: payload.withdrawal.provider ?? "paypal",
        status: payload.withdrawal.status,
      } satisfies WithdrawalRequest,
    },
    error: null,
  };
}

async function getAuthToken() {
  if (!supabase) return null;

  const session = await supabase.auth.getSession();

  return session.data.session?.access_token ?? null;
}

function toAdminWithdrawal(row: {
  id: string;
  amount_euros?: number;
  account_holder_name?: string;
  admin_note?: string | null;
  created_at?: string;
  iban_last4?: string;
  paypal_email?: string | null;
  profiles?: { pseudo?: string | null; email?: string | null } | Array<{
    pseudo?: string | null;
    email?: string | null;
  }> | null;
  provider?: string | null;
  provider_payout_id?: string | null;
  provider_status?: string | null;
  status?: string;
  updated_at?: string;
}): AdminWithdrawalRequest {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

  return {
    id: row.id,
    amount: row.amount_euros ?? 0,
    createdAt: row.created_at ?? new Date().toISOString(),
    holderName: row.account_holder_name ?? "",
    ibanLast4: row.iban_last4 ?? "",
    note: row.admin_note ?? "",
    paypalEmail: row.paypal_email ?? "",
    provider: row.provider ?? "",
    providerPayoutId: row.provider_payout_id ?? "",
    providerStatus: row.provider_status ?? "",
    status: row.status ?? "pending",
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    userEmail: profile?.email ?? "",
    userPseudo: profile?.pseudo ?? "Joueur",
  };
}

export async function getAdminWithdrawalRequests() {
  const token = await getAuthToken();

  if (!token) return { data: [], error: new Error("Session admin introuvable.") };

  const response = await fetch("/api/admin/withdrawals", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | { error?: string; withdrawals?: Parameters<typeof toAdminWithdrawal>[0][] }
    | null;

  if (!response.ok) {
    return {
      data: [],
      error: new Error(payload?.error ?? "Impossible de charger les retraits."),
    };
  }

  return {
    data: (payload?.withdrawals ?? []).map(toAdminWithdrawal),
    error: null,
  };
}

export async function getAdminDashboard() {
  const token = await getAuthToken();

  if (!token) {
    return {
      data: null,
      error: new Error("Session admin introuvable."),
    };
  }

  const response = await fetch("/api/admin/dashboard", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | (AdminDashboard & { error?: string })
    | null;

  if (!response.ok || !payload) {
    return {
      data: null,
      error: new Error(payload?.error ?? "Impossible de charger l'admin."),
    };
  }

  return {
    data: payload,
    error: null,
  };
}

export async function updateAdminWithdrawalStatus({
  id,
  note,
  status,
}: {
  id: string;
  note?: string;
  status: string;
}) {
  const token = await getAuthToken();

  if (!token) {
    return { data: null, error: new Error("Session admin introuvable.") };
  }

  const response = await fetch("/api/admin/withdrawals", {
    body: JSON.stringify({ id, note, status }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
  const payload = (await response.json().catch(() => null)) as
    | { error?: string; withdrawal?: Parameters<typeof toAdminWithdrawal>[0] }
    | null;

  if (!response.ok || !payload?.withdrawal) {
    return {
      data: null,
      error: new Error(payload?.error ?? "Impossible de modifier le retrait."),
    };
  }

  return {
    data: toAdminWithdrawal(payload.withdrawal),
    error: null,
  };
}
