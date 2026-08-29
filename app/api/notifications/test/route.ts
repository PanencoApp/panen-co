import { NextRequest, NextResponse } from "next/server";
import { sendPushToUsers } from "@/lib/onesignal/server";
import {
  isServerSupabaseConfigured,
  serverSupabase,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!isServerSupabaseConfigured || !serverSupabase) {
    return NextResponse.json(
      { error: "Configuration Supabase serveur incomplète." },
      { status: 500 },
    );
  }

  if (!token) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const auth = await serverSupabase.auth.getUser(token);
  const user = auth.data.user;

  if (auth.error || !user) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  const sent = await sendPushToUsers({
    body: "Les notifications Panen&Co sont bien activées sur ce compte.",
    idempotencyKey: `notification-test-${user.id}-${Date.now()}`,
    title: "Notification test",
    url: "/",
    userIds: [user.id],
  });

  if (sent.error) {
    return NextResponse.json(
      { error: sent.error.message, details: sent.data },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, details: sent.data });
}

