import type { MatchOption } from "@/types";
import { matches as demoMatches } from "@/lib/demo-data";
import { supabase } from "@/lib/supabase/client";

type MatchRow = {
  id: string;
  external_id: string | null;
  home_team: string;
  away_team: string;
  kickoff_at: string;
};

type MatchesResult = {
  data: MatchOption[];
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

function formatMatchTime(kickoffAt: string, fallback?: string) {
  const date = new Date(kickoffAt);

  if (Number.isNaN(date.getTime())) {
    return fallback ?? "Aujourd'hui";
  }

  return `Aujourd'hui ${new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

function toMatchOption(row: MatchRow, fallbackMatches: MatchOption[]) {
  const fallback = fallbackMatches.find((match) => match.id === row.external_id);

  return {
    id: row.external_id ?? row.id,
    label: fallback?.label ?? `${row.home_team} vs ${row.away_team}`,
    time: formatMatchTime(row.kickoff_at, fallback?.time),
    homeTeamId: fallback?.homeTeamId,
    awayTeamId: fallback?.awayTeamId,
    homeTeamName: fallback?.homeTeamName,
    awayTeamName: fallback?.awayTeamName,
    homeLogo: fallback?.homeLogo,
    awayLogo: fallback?.awayLogo,
    isPredictable: fallback?.isPredictable ?? true,
    scoreLabel: fallback?.scoreLabel,
    statusLabel: fallback?.statusLabel,
  };
}

function mergeMatchesInApiOrder(rows: MatchRow[], sourceMatches: MatchOption[]) {
  const rowByExternalId = new Map(
    rows
      .filter((row) => row.external_id)
      .map((row) => [row.external_id as string, row]),
  );

  return sourceMatches.map((sourceMatch) => {
    const row = rowByExternalId.get(sourceMatch.id);

    if (!row) return sourceMatch;

    return toMatchOption(row, sourceMatches);
  });
}

async function seedMissingMatches(fallbackMatches: MatchOption[]) {
  if (!supabase) return;

  const externalIds = fallbackMatches.map((match) => match.id);
  const existing = await supabase
    .from("matches")
    .select("external_id")
    .in("external_id", externalIds);

  if (existing.error) return;

  const existingIds = new Set(
    (existing.data ?? [])
      .map((match) => match.external_id)
      .filter((id): id is string => Boolean(id)),
  );
  const missing = fallbackMatches.filter((match) => !existingIds.has(match.id));

  if (missing.length === 0) return;

  await supabase.from("matches").insert(
    missing.map((match) => {
      const { homeTeam, awayTeam } = splitLabel(match.label);

      return {
        external_id: match.id,
        home_team: homeTeam,
        away_team: awayTeam,
        kickoff_at: kickoffFromLabel(match.time),
        status: "scheduled",
      };
    }),
  );
}

export async function getTodayMatches(): Promise<MatchesResult> {
  let sourceMatches: MatchOption[] = [];

  if (typeof window !== "undefined") {
    try {
      const response = await fetch("/api/today-matches");
      const payload = (await response.json()) as {
        matches?: MatchOption[];
      };

      if (response.ok && payload.matches && payload.matches.length > 0) {
        sourceMatches = payload.matches;
      }
    } catch {
      sourceMatches = [];
    }
  }

  const playableMatches = sourceMatches.length > 0 ? sourceMatches : demoMatches;

  if (!supabase) {
    return {
      data: playableMatches,
      error: new Error("Supabase n'est pas encore configure."),
    };
  }

  await seedMissingMatches(playableMatches);

  const result = await supabase
    .from("matches")
    .select("id, external_id, home_team, away_team, kickoff_at")
    .in(
      "external_id",
      playableMatches.map((match) => match.id),
    );

  if (result.error || !result.data || result.data.length === 0) {
    return {
      data: playableMatches,
      error: result.error ?? null,
    };
  }

  return {
    data: mergeMatchesInApiOrder(result.data as MatchRow[], playableMatches),
    error: null,
  };
}
