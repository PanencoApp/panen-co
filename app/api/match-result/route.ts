import { NextRequest, NextResponse } from "next/server";
import type { MatchResult } from "@/lib/scoring";

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
  detail?: string;
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

export async function GET(request: NextRequest) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const fixtureId = request.nextUrl.searchParams.get("fixtureId");

  if (!apiKey || !fixtureId) {
    return NextResponse.json(
      { status: "error", message: "Configuration API incomplete." },
      { status: 400 },
    );
  }

  const fixturePayload = (await fetchApiFootball(
    `fixtures?id=${fixtureId}`,
    apiKey,
  )) as { response?: ApiFootballFixture[] } | null;
  const fixture = fixturePayload?.response?.[0];

  if (!fixture) {
    return NextResponse.json(
      { status: "error", message: "Match introuvable." },
      { status: 404 },
    );
  }

  const status = fixture.fixture?.status?.short ?? "";

  if (!finishedStatuses.has(status)) {
    return NextResponse.json({
      status: "not_finished",
      apiStatus: status,
    });
  }

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
  const result: MatchResult = {
    homeScore,
    awayScore,
    scorers: goalEvents
      .map((event) => event.player?.name)
      .filter((name): name is string => Boolean(name)),
    firstTeam: teamSide(firstGoal?.team?.name, homeName, awayName),
    lastTeam: teamSide(lastGoal?.team?.name, homeName, awayName),
  };

  return NextResponse.json({
    status: "finished",
    result,
  });
}
