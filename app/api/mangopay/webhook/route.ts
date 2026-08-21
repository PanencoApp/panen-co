import { NextRequest, NextResponse } from "next/server";
import { getMangopayPayout, isMangopayConfigured } from "@/lib/mangopay/client";
import { isServerSupabaseConfigured, serverSupabase } from "@/lib/supabase/server";

const successEvents = new Set(["PAYOUT_NORMAL_SUCCEEDED", "INSTANT_PAYOUT_SUCCEEDED"]);
const failedEvents = new Set([
  "PAYOUT_NORMAL_FAILED",
  "INSTANT_PAYOUT_FAILED",
  "PAYOUT_REFUND_SUCCEEDED",
]);

async function updateWalletForFinalStatus({
  amount,
  status,
  userId,
}: {
  amount: number;
  status: "paid" | "rejected";
  userId: string;
}) {
  const wallet = await serverSupabase!
    .from("user_winnings")
    .select("balance_euros, withdrawn_euros")
    .eq("user_id", userId)
    .maybeSingle();

  if (wallet.error || !wallet.data) {
    return wallet.error?.message ?? "Portefeuille introuvable.";
  }

  const payload =
    status === "paid"
      ? {
          withdrawn_euros: (wallet.data.withdrawn_euros ?? 0) + amount,
          updated_at: new Date().toISOString(),
        }
      : {
          balance_euros: (wallet.data.balance_euros ?? 0) + amount,
          updated_at: new Date().toISOString(),
        };

  const update = await serverSupabase!
    .from("user_winnings")
    .update(payload)
    .eq("user_id", userId);

  return update.error?.message ?? null;
}

export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured || !serverSupabase) {
    return NextResponse.json(
      { error: "Configuration Supabase serveur incomplète." },
      { status: 500 },
    );
  }

  const eventType = request.nextUrl.searchParams.get("EventType") ?? "";
  const payoutId = request.nextUrl.searchParams.get("RessourceId") ?? "";

  if (!payoutId) {
    return NextResponse.json({ ok: true });
  }

  if (!successEvents.has(eventType) && !failedEvents.has(eventType)) {
    return NextResponse.json({ ok: true });
  }

  let providerStatus = eventType;
  let providerError = "";

  if (isMangopayConfigured) {
    try {
      const payout = await getMangopayPayout(payoutId);
      providerStatus = payout.Status ?? eventType;
      providerError = payout.ResultMessage ?? "";
    } catch (error) {
      providerError =
        error instanceof Error ? error.message : "Lecture Mangopay impossible.";
    }
  }

  const withdrawal = await serverSupabase
    .from("withdrawal_requests")
    .select("id, user_id, amount_euros, status")
    .eq("provider_payout_id", payoutId)
    .maybeSingle();

  if (withdrawal.error || !withdrawal.data) {
    return NextResponse.json({ ok: true });
  }

  const currentStatus = withdrawal.data.status ?? "pending";

  if (currentStatus === "paid" || currentStatus === "rejected") {
    return NextResponse.json({ ok: true });
  }

  const nextStatus = successEvents.has(eventType) ? "paid" : "rejected";
  const walletError = await updateWalletForFinalStatus({
    amount: withdrawal.data.amount_euros ?? 0,
    status: nextStatus,
    userId: withdrawal.data.user_id,
  });

  if (walletError) {
    return NextResponse.json({ error: walletError }, { status: 409 });
  }

  const update = await serverSupabase
    .from("withdrawal_requests")
    .update({
      provider_error: providerError,
      provider_processed_at: new Date().toISOString(),
      provider_status: providerStatus,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", withdrawal.data.id);

  if (update.error) {
    return NextResponse.json({ error: update.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
