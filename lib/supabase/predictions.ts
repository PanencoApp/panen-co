import type {
  MatchOption,
  PredictionPick,
  PredictionRecord,
  ScoreLine,
} from "@/types";
import { supabase } from "@/lib/supabase/client";

type MatchRow = {
  id: string;
  external_id: string | null;
  home_team: string;
  away_team: string;
  kickoff_at: string;
};

type PredictionRow = {
  id: string;
  match_id: string;
  created_at: string;
  result_pick: string;
  scorer_pick: string;
  exact_score_pick: string;
  first_team_pick: string;
  last_team_pick: string;
  goals_pick: string;
  status: string;
  points: number;
  score_details: ScoreLine[] | null;
  matches: MatchRow | MatchRow[] | null;
};

type PredictionResult = {
  data: PredictionRecord | null;
  error: Error | null;
};

type PredictionsResult = {
  data: PredictionRecord[];
  error: Error | null;
};

function splitLabel(label: string) {
  const [homeTeam, awayTeam] = label.split(" vs ");

  return {
    homeTeam: homeTeam?.trim() || label,
    awayTeam: awayTeam?.trim() || "Adversaire",
  };
}

function kickoffFromLabel(time: string) {
  const match = time.match(/(\d{1,2}):(\d{2})/);
  const date = new Date();

  if (match) {
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  }

  return date.toISOString();
}

function formatPredictionMatchTime(kickoffAt?: string, fallback?: string) {
  if (!kickoffAt) return fallback ?? "Aujourd'hui";

  const date = new Date(kickoffAt);

  if (Number.isNaN(date.getTime())) return fallback ?? "Aujourd'hui";

  const today = new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).format(new Date());
  const matchDay = new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(date);

  if (today === matchDay) return `Aujourd'hui ${time}`;

  const day = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/Paris",
  }).format(date);

  return `${day} ${time}`;
}

function getMatchRow(row: PredictionRow) {
  if (Array.isArray(row.matches)) return row.matches[0] ?? null;
  return row.matches;
}

function toPredictionRecord(
  row: PredictionRow,
  matchOptions: MatchOption[],
): PredictionRecord {
  const matchRow = getMatchRow(row);
  const localMatch = matchOptions.find(
    (match) => match.id === matchRow?.external_id,
  );
  const matchLabel =
    localMatch?.label ??
    (matchRow ? `${matchRow.home_team} vs ${matchRow.away_team}` : "Match du jour");

  return {
    id: row.id,
    matchId: matchRow?.external_id ?? row.match_id,
    matchLabel,
    matchTime: localMatch?.time ?? formatPredictionMatchTime(matchRow?.kickoff_at),
    matchDate: matchRow?.kickoff_at,
    createdAt: row.created_at,
    pick: {
      result: row.result_pick,
      scorer: row.scorer_pick,
      exactScore: row.exact_score_pick,
      firstTeam: row.first_team_pick,
      lastTeam: row.last_team_pick,
      goals: row.goals_pick,
    },
    status: row.status === "done" ? "done" : "active",
    score: row.status === "done" ? row.points : undefined,
    scoreDetails: Array.isArray(row.score_details)
      ? row.score_details
      : undefined,
  };
}

async function ensureMatch(match: MatchOption) {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configure."),
    };
  }

  const existing = await supabase
    .from("matches")
    .select("id")
    .eq("external_id", match.id)
    .maybeSingle();

  if (existing.error) return existing;
  if (existing.data) return existing;

  const { homeTeam, awayTeam } = splitLabel(match.label);

  return supabase
    .from("matches")
    .insert({
      external_id: match.id,
      home_team: homeTeam,
      away_team: awayTeam,
      kickoff_at: kickoffFromLabel(match.time),
      status: "scheduled",
    })
    .select("id")
    .single();
}

export async function getMyPredictions(
  userId: string,
  matchOptions: MatchOption[],
): Promise<PredictionsResult> {
  if (!supabase) {
    return {
      data: [],
      error: new Error("Supabase n'est pas encore configure."),
    };
  }

  const result = await supabase
    .from("predictions")
    .select(
      "id, match_id, created_at, result_pick, scorer_pick, exact_score_pick, first_team_pick, last_team_pick, goals_pick, status, points, score_details, matches(id, external_id, home_team, away_team, kickoff_at)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (result.error) {
    return {
      data: [],
      error: result.error,
    };
  }

  return {
    data: (result.data ?? []).map((row) =>
      toPredictionRecord(row as PredictionRow, matchOptions),
    ),
    error: null,
  };
}

export async function savePrediction({
  userId,
  match,
  pick,
  matchOptions,
}: {
  userId: string;
  match: MatchOption;
  pick: PredictionPick;
  matchOptions: MatchOption[];
}): Promise<PredictionResult> {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configure."),
    };
  }

  const savedMatch = await ensureMatch(match);

  if (savedMatch.error || !savedMatch.data) {
    return {
      data: null,
      error: savedMatch.error,
    };
  }

  const result = await supabase
    .from("predictions")
    .insert({
      user_id: userId,
      match_id: savedMatch.data.id,
      result_pick: pick.result,
      scorer_pick: pick.scorer,
      exact_score_pick: pick.exactScore,
      first_team_pick: pick.firstTeam,
      last_team_pick: pick.lastTeam,
      goals_pick: pick.goals,
      status: "active",
      points: 0,
    })
    .select(
      "id, match_id, created_at, result_pick, scorer_pick, exact_score_pick, first_team_pick, last_team_pick, goals_pick, status, points, score_details, matches(id, external_id, home_team, away_team, kickoff_at)",
    )
    .single();

  if (result.error) {
    const message = result.error.message;

    return {
      data: null,
      error: new Error(
        message.includes("MATCH_ALREADY_STARTED")
          ? "Ce match a deja commence."
          : message.includes("DAILY_PREDICTION_LIMIT_REACHED")
            ? "Tu as deja utilise tes 5 predictions du jour."
            : message.includes("duplicate key")
              ? "Tu as deja valide une prediction sur ce match."
              : result.error.message,
      ),
    };
  }

  return {
    data: toPredictionRecord(result.data as PredictionRow, matchOptions),
    error: null,
  };
}

export async function finishPredictionDemoInSupabase({
  predictionId,
  score,
  scoreDetails,
  matchOptions,
}: {
  predictionId: string;
  score: number;
  scoreDetails: ScoreLine[];
  matchOptions: MatchOption[];
}): Promise<PredictionResult> {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configure."),
    };
  }

  const result = await supabase
    .from("predictions")
    .update({ status: "done", points: score, score_details: scoreDetails })
    .eq("id", predictionId)
    .eq("status", "active")
    .select(
      "id, match_id, created_at, result_pick, scorer_pick, exact_score_pick, first_team_pick, last_team_pick, goals_pick, status, points, score_details, matches(id, external_id, home_team, away_team, kickoff_at)",
    )
    .maybeSingle();

  if (result.error) {
    return {
      data: null,
      error: result.error,
    };
  }

  return {
    data: toPredictionRecord(result.data as PredictionRow, matchOptions),
    error: null,
  };
}
