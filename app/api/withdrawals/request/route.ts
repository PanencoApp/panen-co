import { NextRequest, NextResponse } from "next/server";
import { createPayPalPayout, isPayPalConfigured } from "@/lib/paypal/client";
import { isServerSupabaseConfigured, serverSupabase } from "@/lib/supabase/server";

const MIN_WITHDRAWAL_EUROS = 1;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured || !serverSupabase) {
    return NextResponse.json(
      { error: "Configuration Supabase serveur incomplète." },
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

  if (!user.email_confirmed_at) {
    return NextResponse.json(
      { error: "Confirme ton email avant de demander un retrait." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { amount?: number; paypalEmail?: string }
    | null;
  const amount = Math.floor(Number(body?.amount ?? 0));
  const paypalEmail = String(body?.paypalEmail ?? "").trim().toLowerCase();

  if (amount < MIN_WITHDRAWAL_EUROS) {
    return NextResponse.json(
      { error: "Le minimum de retrait temporaire est de 1 €." },
      { status: 400 },
    );
  }

  if (!isValidEmail(paypalEmail)) {
    return NextResponse.json(
      { error: "Indique une adresse email PayPal valide." },
      { status: 400 },
    );
  }

  if (!isPayPalConfigured) {
    return NextResponse.json(
      { error: "Retrait momentanément indisponible. Réessaie dans quelques instants." },
      { status: 503 },
    );
  }

  const wallet = await serverSupabase
    .from("user_winnings")
    .select("balance_euros")
    .eq("user_id", user.id)
    .maybeSingle();

  if (wallet.error) {
    return NextResponse.json({ error: wallet.error.message }, { status: 500 });
  }

  const balance = wallet.data?.balance_euros ?? 0;

  if (balance < amount) {
    return NextResponse.json(
      { error: "Solde gains insuffisant pour ce retrait." },
      { status: 400 },
    );
  }

  const nextBalance = balance - amount;
  const updatedWallet = await serverSupabase
    .from("user_winnings")
    .update({
      balance_euros: nextBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("balance_euros", balance)
    .select("balance_euros")
    .maybeSingle();

  if (updatedWallet.error || !updatedWallet.data) {
    return NextResponse.json(
      { error: "Le solde a changé. Réessaie dans quelques secondes." },
      { status: 409 },
    );
  }

  const withdrawal = await serverSupabase
    .from("withdrawal_requests")
    .insert({
      account_holder_name: paypalEmail,
      iban: paypalEmail,
      iban_last4: paypalEmail.slice(-4),
      paypal_email: paypalEmail,
      provider: "paypal",
      status: "pending",
      user_id: user.id,
      amount_euros: amount,
    })
    .select("id, amount_euros, iban_last4, paypal_email, provider, status, created_at")
    .single();

  if (withdrawal.error) {
    await serverSupabase
      .from("user_winnings")
      .update({
        balance_euros: balance,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return NextResponse.json({ error: withdrawal.error.message }, { status: 500 });
  }

  try {
    const payout = await createPayPalPayout({
      amount,
      receiverEmail: paypalEmail,
      withdrawalId: withdrawal.data.id,
    });

    const updatedWithdrawal = await serverSupabase
      .from("withdrawal_requests")
      .update({
        provider_item_id: withdrawal.data.id,
        provider_payout_id: payout.batchId,
        provider_status: payout.status,
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawal.data.id)
      .select("id, amount_euros, iban_last4, paypal_email, provider, status, created_at")
      .single();

    if (!updatedWithdrawal.error && updatedWithdrawal.data) {
      return NextResponse.json({
        balance: updatedWallet.data.balance_euros,
        withdrawal: updatedWithdrawal.data,
      });
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Payout PayPal impossible.";

    await serverSupabase
      .from("user_winnings")
      .update({
        balance_euros: balance,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    await serverSupabase
      .from("withdrawal_requests")
      .update({
        provider_error: errorMessage,
        provider_status: "FAILED_TO_CREATE",
        status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawal.data.id);

    return NextResponse.json(
      { error: `Retrait PayPal impossible : ${errorMessage}` },
      { status: 502 },
    );
  }

  await serverSupabase
    .from("user_winnings")
    .update({
      balance_euros: balance,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  await serverSupabase
    .from("withdrawal_requests")
    .update({
      provider_error: "Statut PayPal impossible à confirmer.",
      provider_status: "FAILED_TO_CONFIRM",
      status: "rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", withdrawal.data.id);

  return NextResponse.json(
    { error: "Retrait impossible, le compte renseigné est introuvable." },
    { status: 502 },
  );
}
