import { NextRequest, NextResponse } from "next/server";
import { isServerSupabaseConfigured, serverSupabase } from "@/lib/supabase/server";

const allowedStatuses = new Set(["pending", "processing", "paid", "rejected"]);

async function getAdminUser(request: NextRequest) {
  if (!serverSupabase) return null;

  const token = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) return null;

  const auth = await serverSupabase.auth.getUser(token);
  const user = auth.data.user;

  if (auth.error || !user) return null;

  const profile = await serverSupabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profile.error || profile.data?.is_admin !== true) {
    return null;
  }

  return user;
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
  const status = String(body?.status ?? "");

  if (!id || !allowedStatuses.has(status)) {
    return NextResponse.json(
      { error: "Statut ou demande invalide." },
      { status: 400 },
    );
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
