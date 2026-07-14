import { NextResponse } from "next/server";

type ApiFootballFixture = {
  fixture?: {
    id?: number;
    date?: string;
    status?: {
      short?: string;
      elapsed?: number | null;
    };
  };
  league?: {
    id?: number;
    name?: string;
  };
  teams?: {
    home?: {
      name?: string;
      logo?: string;
    };
    away?: {
      name?: string;
      logo?: string;
    };
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  };
};

const leaguePriority = new Map<number, number>([
  [1, 1],
  [4, 2],
  [2, 3],
  [3, 4],
  [5, 5],
  [848, 6],
  [39, 10],
  [140, 11],
  [135, 12],
  [78, 13],
  [61, 14],
  [15, 15],
  [9, 16],
  [45, 20],
  [143, 21],
  [137, 22],
  [81, 23],
  [66, 24],
]);

const leagueNamePriority: Array<[RegExp, number]> = [
  [/world cup/i, 1],
  [/\beuro\b|european championship/i, 2],
  [/champions league/i, 3],
  [/europa league/i, 4],
  [/nations league/i, 5],
  [/conference league/i, 6],
  [/premier league/i, 10],
  [/la liga|primera division/i, 11],
  [/serie a/i, 12],
  [/bundesliga/i, 13],
  [/ligue 1/i, 14],
  [/club world cup/i, 15],
  [/copa america/i, 16],
  [/fa cup/i, 20],
  [/copa del rey/i, 21],
  [/coppa italia/i, 22],
  [/dfb pokal/i, 23],
  [/coupe de france/i, 24],
];

function todayKey() {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function formatKickoff(date?: string) {
  if (!date) return "Aujourd'hui";

  const kickoff = new Date(date);

  if (Number.isNaN(kickoff.getTime())) return "Aujourd'hui";

  return `Aujourd'hui ${new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(kickoff)}`;
}

function scoreFixture(fixture: ApiFootballFixture) {
  const leagueId = fixture.league?.id ?? 0;
  const leagueName = fixture.league?.name ?? "";
  const namePriority =
    leagueNamePriority.find(([pattern]) => pattern.test(leagueName))?.[1] ?? 99;
  const leagueScore = Math.min(leaguePriority.get(leagueId) ?? 99, namePriority);
  const kickoff = fixture.fixture?.date
    ? new Date(fixture.fixture.date).getTime()
    : Number.MAX_SAFE_INTEGER;

  return leagueScore * 10_000_000_000 + kickoff;
}

function toMatch(fixture: ApiFootballFixture) {
  const status = fixture.fixture?.status?.short ?? "NS";
  const kickoff = fixture.fixture?.date
    ? new Date(fixture.fixture.date)
    : null;
  const kickoffHasPassed =
    !kickoff || Number.isNaN(kickoff.getTime()) || kickoff.getTime() <= Date.now();
  const homeGoals = fixture.goals?.home;
  const awayGoals = fixture.goals?.away;
  const hasScore = typeof homeGoals === "number" && typeof awayGoals === "number";
  const isPredictable = ["NS", "TBD"].includes(status) && !kickoffHasPassed;

  return {
    id: `api-football-${fixture.fixture?.id}`,
    label: `${fixture.teams?.home?.name} vs ${fixture.teams?.away?.name}`,
    time: formatKickoff(fixture.fixture?.date),
    homeLogo: fixture.teams?.home?.logo,
    awayLogo: fixture.teams?.away?.logo,
    isPredictable,
    scoreLabel: hasScore ? `${homeGoals}-${awayGoals}` : undefined,
    statusLabel: isPredictable
      ? "Ouvert"
      : status === "FT"
        ? "Termine"
        : status === "HT"
          ? "Mi-temps"
          : status === "1H" || status === "2H"
            ? `Live ${fixture.fixture?.status?.elapsed ?? ""}'`
            : kickoffHasPassed
              ? "Commence"
              : "Verrouille",
  };
}

export async function GET() {
  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    return NextResponse.json({
      source: "api-football-missing-key",
      matches: [],
    });
  }

  const url = new URL("https://v3.football.api-sports.io/fixtures");
  url.searchParams.set("date", todayKey());
  url.searchParams.set("timezone", "Europe/Paris");

  try {
    const response = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
      },
      next: { revalidate: 60 * 60 },
    });

    if (!response.ok) {
      return NextResponse.json({
        source: "api-football-error",
        matches: [],
      });
    }

    const payload = (await response.json()) as {
      response?: ApiFootballFixture[];
    };
    const fixtures = payload.response ?? [];
    const playableFixtures = fixtures
      .filter((fixture) => {
        const home = fixture.teams?.home?.name;
        const away = fixture.teams?.away?.name;

        return Boolean(home && away);
      })
      .sort((a, b) => scoreFixture(a) - scoreFixture(b))
      .slice(0, 5);
    const playable = playableFixtures.map(toMatch);

    return NextResponse.json({
      source: "api-football",
      matches: playable,
    });
  } catch {
    return NextResponse.json({
      source: "api-football-error",
      matches: [],
    });
  }
}
