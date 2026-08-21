import { NextRequest, NextResponse } from "next/server";
import { currentWeekStart } from "@/lib/supabase/leaderboard";
import { isServerSupabaseConfigured, serverSupabase } from "@/lib/supabase/server";

const adminEmails = new Set(["panenco14@gmail.com"]);

type ProfileRow = {
  created_at: string;
  email: string;
  id: string;
  is_admin?: boolean;
  pseudo: string;
};

type PredictionRow = {
  created_at: string;
  points: number;
  status: string;
  user_id: string;
};

type SubscriptionRow = {
  current_period_end: string | null;
  status: string;
  updated_at: string;
  user_id: string;
};

type WeeklyScoreRow = {
  points: number;
  reward_euros: number;
  user_id: string;
};

function parisMonthStart() {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return `${year}-${month}-01T00:00:00.000Z`;
}

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

function addToMap(map: Map<string, number>, userId: string, value: number) {
  map.set(userId, (map.get(userId) ?? 0) + value);
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

  const [profiles, weeklyScores, monthlyPredictions, allPredictions, subscriptions, authUsers] =
    await Promise.all([
      serverSupabase
        .from("profiles")
        .select("id, pseudo, email, is_admin, created_at")
        .order("created_at", { ascending: false }),
      serverSupabase
        .from("weekly_scores")
        .select("user_id, points, reward_euros")
        .eq("week_start", currentWeekStart()),
      serverSupabase
        .from("predictions")
        .select("user_id, points, status, created_at")
        .eq("status", "done")
        .gte("created_at", parisMonthStart()),
      serverSupabase
        .from("predictions")
        .select("user_id, points, status, created_at")
        .order("created_at", { ascending: false }),
      serverSupabase
        .from("subscriptions")
        .select("user_id, status, current_period_end, updated_at"),
      serverSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  if (profiles.error) {
    return NextResponse.json({ error: profiles.error.message }, { status: 500 });
  }

  const profileRows = (profiles.data ?? []) as ProfileRow[];
  const weeklyRows = ((weeklyScores.data ?? []) as WeeklyScoreRow[]).filter(Boolean);
  const monthlyRows = ((monthlyPredictions.data ?? []) as PredictionRow[]).filter(Boolean);
  const predictionRows = ((allPredictions.data ?? []) as PredictionRow[]).filter(Boolean);
  const subscriptionRows = ((subscriptions.data ?? []) as SubscriptionRow[]).filter(Boolean);
  const authById = new Map(
    (authUsers.data.users ?? []).map((user) => [
      user.id,
      Boolean(user.email_confirmed_at),
    ]),
  );
  const weeklyById = new Map(weeklyRows.map((score) => [score.user_id, score]));
  const monthlyPointsById = new Map<string, number>();
  const predictionCountById = new Map<string, number>();
  const completedPredictionCountById = new Map<string, number>();
  const lastActivityById = new Map<string, string>();
  const subscriptionById = new Map(subscriptionRows.map((subscription) => [
    subscription.user_id,
    subscription,
  ]));

  for (const prediction of monthlyRows) {
    addToMap(monthlyPointsById, prediction.user_id, prediction.points ?? 0);
  }

  for (const prediction of predictionRows) {
    addToMap(predictionCountById, prediction.user_id, 1);
    if (prediction.status === "done") {
      addToMap(completedPredictionCountById, prediction.user_id, 1);
    }
    if (!lastActivityById.has(prediction.user_id)) {
      lastActivityById.set(prediction.user_id, prediction.created_at);
    }
  }

  const users = profileRows.map((profile) => {
    const subscription = subscriptionById.get(profile.id);

    return {
      createdAt: profile.created_at,
      email: profile.email,
      emailConfirmed: authById.get(profile.id) ?? false,
      id: profile.id,
      isAdmin: profile.is_admin === true,
      lastActivityAt: lastActivityById.get(profile.id) ?? null,
      monthlyPoints: monthlyPointsById.get(profile.id) ?? 0,
      predictionCount: predictionCountById.get(profile.id) ?? 0,
      completedPredictionCount: completedPredictionCountById.get(profile.id) ?? 0,
      pseudo: profile.pseudo,
      subscriptionStatus: subscription?.status ?? "inactive",
      subscriptionUntil: subscription?.current_period_end ?? null,
      weeklyPoints: weeklyById.get(profile.id)?.points ?? 0,
      weeklyReward: weeklyById.get(profile.id)?.reward_euros ?? 0,
    };
  });

  const weeklyScoresList = [...users]
    .sort((left, right) => right.weeklyPoints - left.weeklyPoints)
    .filter((user) => user.weeklyPoints > 0)
    .slice(0, 50);
  const monthlyScoresList = [...users]
    .sort((left, right) => right.monthlyPoints - left.monthlyPoints)
    .filter((user) => user.monthlyPoints > 0)
    .slice(0, 50);

  return NextResponse.json({
    scores: {
      month: monthlyScoresList,
      week: weeklyScoresList,
    },
    summary: {
      activeSubscriptions: users.filter((user) => user.subscriptionStatus === "active").length,
      totalPredictions: predictionRows.length,
      totalUsers: users.length,
      verifiedEmails: users.filter((user) => user.emailConfirmed).length,
    },
    users,
  });
}
