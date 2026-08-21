import { supabase } from "@/lib/supabase/client";

export type WinningsWallet = {
  balance: number;
  totalEarned: number;
  withdrawn: number;
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
