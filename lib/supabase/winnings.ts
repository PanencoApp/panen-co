import { supabase } from "@/lib/supabase/client";

export type WinningsWallet = {
  balance: number;
  totalEarned: number;
  withdrawn: number;
};

export type WithdrawalRequest = {
  id: string;
  amount: number;
  ibanLast4: string;
  status: string;
  createdAt: string;
};

export type AdminWithdrawalRequest = WithdrawalRequest & {
  holderName: string;
  note?: string;
  updatedAt: string;
  userEmail: string;
  userPseudo: string;
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
    .select("id, amount_euros, iban_last4, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (result.error) return [];

  return (result.data ?? []).map((request) => ({
    id: request.id,
    amount: request.amount_euros ?? 0,
    ibanLast4: request.iban_last4 ?? "",
    status: request.status ?? "pending",
    createdAt: request.created_at ?? new Date().toISOString(),
  }));
}

export async function requestWithdrawal({
  amount,
  holderName,
  iban,
}: {
  amount: number;
  holderName: string;
  iban: string;
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
    body: JSON.stringify({ amount, holderName, iban }),
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
        ibanLast4: payload.withdrawal.iban_last4,
        status: payload.withdrawal.status,
        createdAt: payload.withdrawal.created_at,
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
  iban_last4?: string;
  status?: string;
  admin_note?: string | null;
  created_at?: string;
  updated_at?: string;
  profiles?: { pseudo?: string | null; email?: string | null } | Array<{
    pseudo?: string | null;
    email?: string | null;
  }> | null;
}): AdminWithdrawalRequest {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

  return {
    id: row.id,
    amount: row.amount_euros ?? 0,
    createdAt: row.created_at ?? new Date().toISOString(),
    holderName: row.account_holder_name ?? "",
    ibanLast4: row.iban_last4 ?? "",
    note: row.admin_note ?? "",
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
