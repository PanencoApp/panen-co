import { NextRequest, NextResponse } from "next/server";
import { isServerSupabaseConfigured, serverSupabase } from "@/lib/supabase/server";

const adminEmails = new Set(["panenco14@gmail.com"]);
const allowedStatuses = new Set(["pending", "processing", "paid", "rejected"]);
const terminalStatuses = new Set(["paid", "rejected"]);

type WithdrawalStatus = "pending" | "processing" | "paid" | "rejected";

async function getAdminUser(request: NextRequest) {
  if (!serverSupabase) return null;

  const token = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) return null;

  const auth = await serverSupabase.auth.getUser(token);
  const user = auth.data.user;

  if (auth.error || !user) return null;

  const profile = await serverSupabase
    .from("profiles")
    .select("email, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const userEmail = user.email?.toLowerCase() ?? "";
  const profileEmail = profile.data?.email?.toLowerCase() ?? "";

  if (
    profile.error ||
    (profile.data?.is_admin !== true &&
      !adminEmails.has(userEmail) &&
      !adminEmails.has(profileEmail))
  ) {
    return null;
  }

  return user;
}

async function getWithdrawal(id: string) {
  return serverSupabase!
    .from("withdrawal_requests")
    .select("id, user_id, amount_euros, status")
    .eq("id", id)
    .maybeSingle();
}

async function getWallet(userId: string) {
  return serverSupabase!
    .from("user_winnings")
    .select("balance_euros, withdrawn_euros")
    .eq("user_id", userId)
    .maybeSingle();
}

async function applyWalletTransition({
  amount,
  nextStatus,
  previousStatus,
  userId,
}: {
  amount: number;
  nextStatus: WithdrawalStatus;
  previousStatus: string;
  userId: string;
}) {
  if (previousStatus === nextStatus) return null;
  if (terminalStatuses.has(previousStatus)) {
    return "Cette demande est déjà finalisée.";
  }

  if (nextStatus !== "paid" && nextStatus !== "rejected") return null;

  const wallet = await getWallet(userId);

  if (wallet.error || !wallet.data) {
    return wallet.error?.message ?? "Portefeuille introuvable.";
  }

  const payload =
    nextStatus === "paid"
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

  const admin = await getAdminUser(request);

  if (!admin) {
    return NextResponse.json({ error: "Accès admin refusé." }, { status: 403 });
  }

  const result = await serverSupabase
    .from("withdrawal_requests")
    .select(
      "id, user_id, amount_euros, account_holder_name, iban_last4, status, admin_note, created_at, updated_at, profiles!inner(pseudo, email)",
    )
    .order("created_at", { ascending: false });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ withdrawals: result.data ?? [] });
}

export async function PATCH(request: NextRequest) {
  if (!isServerSupabaseConfigured || !serverSupabase) {
    return NextResponse.json(
      { error: "Configuration Supabase serveur incomplète." },
      { status: 500 },
    );
  }

  const admin = await getAdminUser(request);

  if (!admin) {
    return NextResponse.json({ error: "Accès admin refusé." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { id?: string; status?: string; note?: string }
    | null;
  const id = String(body?.id ?? "");
  const status = String(body?.status ?? "") as WithdrawalStatus;

  if (!id || !allowedStatuses.has(status)) {
    return NextResponse.json(
      { error: "Statut ou demande invalide." },
      { status: 400 },
    );
  }

  const existing = await getWithdrawal(id);

  if (existing.error || !existing.data) {
    return NextResponse.json(
      { error: existing.error?.message ?? "Demande introuvable." },
      { status: 404 },
    );
  }

  const walletError = await applyWalletTransition({
    amount: existing.data.amount_euros ?? 0,
    nextStatus: status,
    previousStatus: existing.data.status ?? "pending",
    userId: existing.data.user_id,
  });

  if (walletError) {
    return NextResponse.json({ error: walletError }, { status: 409 });
  }

  const updatePayload: {
    admin_note?: string;
    status: string;
    updated_at: string;
  } = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (typeof body?.note === "string") {
    updatePayload.admin_note = body.note.trim();
  }

  const result = await serverSupabase
    .from("withdrawal_requests")
    .update(updatePayload)
    .eq("id", id)
    .select(
      "id, user_id, amount_euros, account_holder_name, iban_last4, status, admin_note, created_at, updated_at, profiles!inner(pseudo, email)",
    )
    .single();

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ withdrawal: result.data });
}
