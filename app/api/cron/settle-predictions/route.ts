import { NextRequest, NextResponse } from "next/server";
import { notificationMessages } from "@/lib/notifications/messages";
import { sendPushToUsers } from "@/lib/onesignal/server";
import { calculatePredictionScore, type MatchResult } from "@/lib/scoring";
import { currentWeekStart } from "@/lib/supabase/leaderboard";
import {
  isServerSupabaseConfigured,
  serverSupabase,
} from "@/lib/supabase/server";
import { syncWeeklyRewards } from "@/lib/supabase/winnings-server";
import type { PredictionPick } from "@/types";

export const dynamic = "force-dynamic";

type MatchRow = {
  id: string;
  external_id: string | null;
  home_team: string;
  away_team: string;
};

type ProfileRow = {
  pseudo: string | null;
};

type PredictionRow = {
  id: string;
  user_id: string;
  result_pick: string;
  scorer_pick: string;
  exact_score_pick: string;
  first_team_pick: string;
  last_team_pick: string;
  goals_pick: string;
  matches: MatchRow | MatchRow[] | null;
  profiles?: ProfileRow | ProfileRow[] | null;
};

type ApiFootballFixture = {
  fixture?: {
    status?: {
      short?: string;
    };
  };
  teams?: {
    home?: {
      name?: string;
    };
    away?: {
      name?: string;
    };
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  };
};

type ApiFootballEvent = {
  time?: {
    elapsed?: number;
    extra?: number | null;
  };
  team?: {
    name?: string;
  };
  player?: {
    name?: string;
  };
  type?: string;
};

const finishedStatuses = new Set(["FT", "AET", "PEN"]);

function parisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).formatToParts(date);

  return {
    day: Number(parts.find((part) => part.type === "day")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    year: Number(parts.find((part) => part.type === "year")?.value),
  };
}

function parisDayKey(date = new Date()) {
  const parts = parisParts(date);

  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function normalize(value?: string) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getMatch(row: PredictionRow) {
  if (Array.isArray(row.matches)) return row.matches[0] ?? null;
  return row.matches;
}

function getPseudo(row: PredictionRow) {
  const profile = Array.isArray(row.profiles)
    ? row.profiles[0]
    : row.profiles;

  return profile?.pseudo ?? "Joueur";
}

function pickFromPrediction(row: PredictionRow): PredictionPick {
  return {
    result: row.result_pick,
    scorer: row.scorer_pick,
    exactScore: row.exact_score_pick,
    firstTeam: row.first_team_pick,
    lastTeam: row.last_team_pick,
    goals: row.goals_pick,
  };
}

function teamSide(teamName: string | undefined, homeName: string, awayName: string) {
  const team = normalize(teamName);

  if (team === normalize(homeName)) return "Domicile";
  if (team === normalize(awayName)) return "Exterieur";
  return "Aucun";
}

function goalMinute(event: ApiFootballEvent) {
  return (event.time?.elapsed ?? 0) * 100 + (event.time?.extra ?? 0);
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const userAgent = request.headers.get("user-agent") ?? "";

  if (secret && authorization === `Bearer ${secret}`) return true;
  if (userAgent.includes("vercel-cron/1.0")) return true;
  return process.env.NODE_ENV !== "production";
}

async function fetchApiFootball(path: string, apiKey: string) {
  const response = await fetch(`https://v3.football.api-sports.io/${path}`, {
    headers: {
      "x-apisports-key": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;

  return response.json();
}

async function getFixtureResult(fixtureId: string, apiKey: string) {
  const fixturePayload = (await fetchApiFootball(
    `fixtures?id=${fixtureId}`,
    apiKey,
  )) as { response?: ApiFootballFixture[] } | null;
  const fixture = fixturePayload?.response?.[0];
  const status = fixture?.fixture?.status?.short ?? "";

  if (!fixture || !finishedStatuses.has(status)) return null;

  const homeName = fixture.teams?.home?.name ?? "Domicile";
  const awayName = fixture.teams?.away?.name ?? "Exterieur";
  const homeScore = fixture.goals?.home ?? 0;
  const awayScore = fixture.goals?.away ?? 0;
  const eventsPayload = (await fetchApiFootball(
    `fixtures/events?fixture=${fixtureId}`,
    apiKey,
  )) as { response?: ApiFootballEvent[] } | null;
  const goalEvents = (eventsPayload?.response ?? [])
    .filter((event) => normalize(event.type) === "goal")
    .sort((a, b) => goalMinute(a) - goalMinute(b));
  const firstGoal = goalEvents[0];
  const lastGoal = goalEvents[goalEvents.length - 1];

  return {
    homeScore,
    awayScore,
    scorers: goalEvents
      .map((event) => event.player?.name)
      .filter((name): name is string => Boolean(name)),
    firstTeam: teamSide(firstGoal?.team?.name, homeName, awayName),
    lastTeam: teamSide(lastGoal?.team?.name, homeName, awayName),
  } satisfies MatchResult;
}

async function addWeeklyPoints({
  points,
  pseudo,
  userId,
}: {
  points: number;
  pseudo: string;
  userId: string;
}) {
  if (!serverSupabase) return;

  const weekStart = currentWeekStart();
  const existing = await serverSupabase
    .from("weekly_scores")
    .select("id, points")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  const nextPoints = (existing.data?.points ?? 0) + points;
  const payload = {
    user_id: userId,
    pseudo,
    week_start: weekStart,
    points: nextPoints,
    reward_euros: 0,
    updated_at: new Date().toISOString(),
  };

  if (existing.data?.id) {
    await serverSupabase
      .from("weekly_scores")
      .update(payload)
      .eq("id", existing.data.id);
    return;
  }

  await serverSupabase.from("weekly_scores").insert(payload);
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!apiKey || !isServerSupabaseConfigured || !serverSupabase) {
    return NextResponse.json(
      {
        error:
          "Configuration incomplete. API_FOOTBALL_KEY and SUPABASE_SERVICE_ROLE_KEY are required.",
      },
      { status: 500 },
    );
  }

  const active = await serverSupabase
    .from("predictions")
    .select(
      "id, user_id, result_pick, scorer_pick, exact_score_pick, first_team_pick, last_team_pick, goals_pick, matches!inner(id, external_id, home_team, away_team), profiles!inner(pseudo)",
    )
    .eq("status", "active")
    .like("matches.external_id", "api-football-%")
    .limit(100);

  if (active.error) {
    return NextResponse.json({ error: active.error.message }, { status: 500 });
  }

  const rows = (active.data ?? []) as PredictionRow[];
  const resultCache = new Map<string, MatchResult | null>();
  const resultNotificationUserIds = new Set<string>();
  let settled = 0;

  for (const row of rows) {
    const match = getMatch(row);
    const externalId = match?.external_id;
    const fixtureId = externalId?.replace("api-football-", "");

    if (!fixtureId || !match) continue;

    if (!resultCache.has(fixtureId)) {
      resultCache.set(fixtureId, await getFixtureResult(fixtureId, apiKey));
    }

    const result = resultCache.get(fixtureId);

    if (!result) continue;

    const scoring = calculatePredictionScore(pickFromPrediction(row), result);
    const updated = await serverSupabase
      .from("predictions")
      .update({
        points: scoring.total,
        score_details: scoring.details,
        status: "done",
      })
      .eq("id", row.id)
      .eq("status", "active")
      .select("id")
      .maybeSingle();

    if (!updated.data || updated.error) continue;

    settled += 1;
    resultNotificationUserIds.add(row.user_id);
    await addWeeklyPoints({
      points: scoring.total,
      pseudo: getPseudo(row),
      userId: row.user_id,
    });

    await serverSupabase
      .from("matches")
      .update({
        first_scoring_team: result.firstTeam,
        home_score: result.homeScore,
        last_scoring_team: result.lastTeam,
        status: "finished",
        total_goals: result.homeScore + result.awayScore,
        away_score: result.awayScore,
      })
      .eq("id", match.id);
  }

  const rewards =
    settled > 0
      ? await syncWeeklyRewards().catch(() => ({ creditedUsers: 0 }))
      : { creditedUsers: 0 };
  const dayKey = parisDayKey();
  const notificationReports = [];

  if (resultNotificationUserIds.size > 0) {
    const resultsReady = notificationMessages.predictionResultsReady;

    const resultsReadyPush = await sendPushToUsers({
      body: resultsReady.body,
      idempotencyKey: `prediction-results-ready-${dayKey}-${settled}`,
      title: resultsReady.title,
      url: "/",
      userIds: Array.from(resultNotificationUserIds),
    });

    notificationReports.push({
      name: "prediction-results-ready",
      ok: !resultsReadyPush.error,
      error: resultsReadyPush.error?.message,
      users: resultNotificationUserIds.size,
    });
  }

  return NextResponse.json({
    checked: rows.length,
    creditedUsers: rewards.creditedUsers,
    notifications: notificationReports,
    settled,
  });
}
