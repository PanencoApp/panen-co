import { NextRequest, NextResponse } from "next/server";
import { isServerSupabaseConfigured, serverSupabase } from "@/lib/supabase/server";
import { syncWeeklyRewards } from "@/lib/supabase/winnings-server";

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

  try {
    const result = await syncWeeklyRewards(user.id);

    return NextResponse.json({
      ok: true,
      creditedUsers: result.creditedUsers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de synchroniser les gains.",
      },
      { status: 500 },
    );
  }
}
