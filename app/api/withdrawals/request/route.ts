import { NextRequest, NextResponse } from "next/server";
import { isServerSupabaseConfigured, serverSupabase } from "@/lib/supabase/server";

const MIN_WITHDRAWAL_EUROS = 20;

function normalizeIban(value: string) {
  return value.replace(/\s/g, "").toUpperCase();
}

function isValidBasicIban(value: string) {
  return /^[A-Z]{2}[0-9A-Z]{13,32}$/.test(value);
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
    | { amount?: number; holderName?: string; iban?: string }
    | null;
  const amount = Math.floor(Number(body?.amount ?? 0));
  const holderName = String(body?.holderName ?? "").trim();
  const iban = normalizeIban(String(body?.iban ?? ""));

  if (amount < MIN_WITHDRAWAL_EUROS) {
    return NextResponse.json(
      { error: "Le minimum de retrait est de 20 €." },
      { status: 400 },
    );
  }

  if (holderName.length < 3) {
    return NextResponse.json(
      { error: "Indique le nom du titulaire du compte." },
      { status: 400 },
    );
  }

  if (!isValidBasicIban(iban)) {
    return NextResponse.json(
      { error: "IBAN invalide. Vérifie les caractères saisis." },
      { status: 400 },
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
      user_id: user.id,
      amount_euros: amount,
      account_holder_name: holderName,
      iban,
      iban_last4: iban.slice(-4),
      status: "pending",
    })
    .select("id, amount_euros, iban_last4, status, created_at")
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

  return NextResponse.json({
    balance: updatedWallet.data.balance_euros,
    withdrawal: withdrawal.data,
  });
}
