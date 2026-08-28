import { NextRequest, NextResponse } from "next/server";
import { friendChallengeFinishedMessage } from "@/lib/notifications/messages";
import { sendPushToUsers } from "@/lib/onesignal/server";
import { calculatePredictionScore, type MatchResult } from "@/lib/scoring";
import {
  isServerSupabaseConfigured,
  serverSupabase,
} from "@/lib/supabase/server";
import type { PredictionPick, ScoreLine } from "@/types";

export const dynamic = "force-dynamic";

type ChallengeRow = {
  id: string;
  creator_id: string;
  creator_pseudo: string;
  friend_id: string | null;
  friend_pseudo: string | null;
  match_id: string;
  match_label: string;
  match_time: string;
  match_date: string | null;
  stake: string;
  creator_pick: PredictionPick;
  friend_pick: PredictionPick | null;
  status: "waiting" | "active" | "done";
  creator_points: number | null;
  friend_points: number | null;
  creator_score_details: ScoreLine[] | null;
  friend_score_details: ScoreLine[] | null;
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

function normalize(value?: string) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function toChallenge(row: ChallengeRow) {
  return {
    id: row.id,
    creatorPseudo: row.creator_pseudo,
    friendPseudo: row.friend_pseudo ?? undefined,
    matchId: row.match_id,
    matchLabel: row.match_label,
    matchTime: row.match_time,
    matchDate: row.match_date ?? undefined,
    stake: row.stake,
    creatorPick: row.creator_pick,
    friendPick: row.friend_pick ?? undefined,
    status: row.status,
    creatorPoints: row.creator_points ?? undefined,
    friendPoints: row.friend_points ?? undefined,
    creatorScoreDetails: row.creator_score_details ?? undefined,
    friendScoreDetails: row.friend_score_details ?? undefined,
  };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const token = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!apiKey || !isServerSupabaseConfigured || !serverSupabase) {
    return NextResponse.json(
      { error: "Configuration serveur incomplète." },
      { status: 500 },
    );
  }

  if (!token) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const auth = await serverSupabase.auth.getUser(token);
  const user = auth.data.user;

  if (!user) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  const body = (await request.json()) as { challengeId?: string };

  if (!body.challengeId) {
    return NextResponse.json({ error: "Défi introuvable." }, { status: 400 });
  }

  const challengeResult = await serverSupabase
    .from("friend_challenges")
    .select("*")
    .eq("id", body.challengeId)
    .maybeSingle();
  const challenge = challengeResult.data as ChallengeRow | null;

  if (challengeResult.error || !challenge) {
    return NextResponse.json({ error: "Défi introuvable." }, { status: 404 });
  }

  if (challenge.creator_id !== user.id && challenge.friend_id !== user.id) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  if (challenge.status === "done") {
    return NextResponse.json({ challenge: toChallenge(challenge) });
  }

  if (!challenge.friend_pick) {
    return NextResponse.json({ challenge: toChallenge(challenge) });
  }

  const fixtureId = challenge.match_id.replace("api-football-", "");

  if (!fixtureId || fixtureId === challenge.match_id) {
    return NextResponse.json(
      { error: "Ce défi n'est pas lié à un match API." },
      { status: 400 },
    );
  }

  const result = await getFixtureResult(fixtureId, apiKey);

  if (!result) {
    return NextResponse.json({ challenge: toChallenge(challenge) });
  }

  const creatorScoring = calculatePredictionScore(
    challenge.creator_pick,
    result,
  );
  const friendScoring = calculatePredictionScore(challenge.friend_pick, result);
  const updated = await serverSupabase
    .from("friend_challenges")
    .update({
      creator_points: creatorScoring.total,
      creator_score_details: creatorScoring.details,
      friend_points: friendScoring.total,
      friend_score_details: friendScoring.details,
      result_summary: result,
      settled_at: new Date().toISOString(),
      status: "done",
      updated_at: new Date().toISOString(),
    })
    .eq("id", challenge.id)
    .select("*")
    .single();

  if (updated.error || !updated.data) {
    return NextResponse.json(
      { error: updated.error?.message ?? "Résultat non sauvegardé." },
      { status: 500 },
    );
  }

  const userIds = [challenge.creator_id, challenge.friend_id].filter(
    (id): id is string => Boolean(id),
  );

  if (userIds.length > 0) {
    const isCreatorWinner = creatorScoring.total > friendScoring.total;
    const isFriendWinner = friendScoring.total > creatorScoring.total;
    const message =
      isCreatorWinner || isFriendWinner
        ? friendChallengeFinishedMessage({
            loserPseudo: isCreatorWinner
              ? (challenge.friend_pseudo ?? "Ton ami")
              : challenge.creator_pseudo,
            stake: challenge.stake,
            winnerPseudo: isCreatorWinner
              ? challenge.creator_pseudo
              : (challenge.friend_pseudo ?? "Ton ami"),
          })
        : {
            body: "Égalité parfaite sur le défi Panen&Co.",
            title: "Le défi est terminé",
          };

    await sendPushToUsers({
      body: message.body,
      idempotencyKey: `friend-challenge-finished-${challenge.id}`,
      title: message.title,
      url: `/?defi=${challenge.id}`,
      userIds,
    }).catch(() => null);
  }

  return NextResponse.json({
    challenge: toChallenge(updated.data as ChallengeRow),
  });
}
