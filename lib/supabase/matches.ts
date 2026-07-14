import type { MatchOption } from "@/types";
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
    label: `${row.home_team} vs ${row.away_team}`,
    time: formatMatchTime(row.kickoff_at, fallback?.time),
    homeLogo: fallback?.homeLogo,
    awayLogo: fallback?.awayLogo,
    isPredictable: fallback?.isPredictable ?? true,
    scoreLabel: fallback?.scoreLabel,
    statusLabel: fallback?.statusLabel,
  };
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

  if (!supabase) {
    return {
      data: sourceMatches,
      error: new Error("Supabase n'est pas encore configure."),
    };
  }

  if (sourceMatches.length === 0) {
    return {
      data: [],
      error: null,
    };
  }

  await seedMissingMatches(sourceMatches);

  const result = await supabase
    .from("matches")
    .select("id, external_id, home_team, away_team, kickoff_at")
    .in(
      "external_id",
      sourceMatches.map((match) => match.id),
    )
    .order("kickoff_at", { ascending: true })
    .limit(5);

  if (result.error || !result.data || result.data.length === 0) {
    return {
      data: sourceMatches,
      error: result.error ?? null,
    };
  }

  return {
    data: (result.data as MatchRow[]).map((row) =>
      toMatchOption(row, sourceMatches),
    ),
    error: null,
  };
}
