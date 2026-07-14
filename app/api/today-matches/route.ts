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
  // International
  [1, 1],
  [4, 2],
  [5, 3],
  [9, 4],
  [2, 5],
  [3, 6],
  // France
  [61, 10],
  [62, 11],
  // Angleterre
  [39, 20],
  [40, 21],
  // Espagne
  [140, 30],
  [141, 31],
  // Italie
  [135, 40],
  [136, 41],
  // Allemagne
  [78, 50],
  [79, 51],
  // Portugal
  [94, 60],
  [95, 61],
  // Pays-Bas
  [88, 70],
  [89, 71],
  // Belgique
  [144, 80],
  [145, 81],
  // Turquie
  [203, 90],
  [204, 91],
  // Bresil
  [71, 100],
  [72, 101],
  // Argentine
  [128, 110],
  [129, 111],
  // Etats-Unis, Canada, Mexique
  [253, 120],
  [255, 121],
  [262, 130],
  [263, 131],
]);

const leagueNamePriority: Array<[RegExp, number]> = [
  [/world cup/i, 1],
  [/\beuro\b|european championship/i, 2],
  [/nations league/i, 3],
  [/copa america/i, 4],
  [/champions league/i, 5],
  [/europa league/i, 6],
  [/ligue 1|mcdonald/i, 10],
  [/ligue 2|bkt/i, 11],
  [/premier league/i, 20],
  [/championship/i, 21],
  [/hypermotion|segunda division/i, 31],
  [/laliga|la liga|primera division/i, 30],
  [/serie b/i, 41],
  [/serie a|enilive/i, 40],
  [/2\. bundesliga|zweite bundesliga/i, 51],
  [/bundesliga$/i, 50],
  [/liga portugal 2|segunda liga|meu super/i, 61],
  [/liga portugal|primeira liga|betclic/i, 60],
  [/eredivisie/i, 70],
  [/keuken kampioen|eerste divisie/i, 71],
  [/jupiler pro league|first division a/i, 80],
  [/challenger pro league|first division b/i, 81],
  [/super lig|süper lig/i, 90],
  [/1\. lig/i, 91],
  [/brasileir|serie a/i, 100],
  [/brasil.*serie b|série b/i, 101],
  [/liga profesional|primera division/i, 110],
  [/primera nacional/i, 111],
  [/major league soccer|\bmls\b/i, 120],
  [/usl championship/i, 121],
  [/liga mx/i, 130],
  [/liga de expansion|expansión mx/i, 131],
];

const teamPriority: Array<[RegExp, number]> = [
  [/france/i, 1],
  [/spain|espagne/i, 1],
  [/argentina|argentine/i, 2],
  [/england|angleterre/i, 2],
  [/brazil|brasil|brésil/i, 3],
  [/portugal/i, 3],
  [/germany|allemagne/i, 4],
  [/italy|italie/i, 4],
  [/netherlands|pays-bas|holland/i, 5],
  [/belgium|belgique/i, 5],
  [/mexico|mexique/i, 6],
  [/uruguay/i, 6],
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

function teamScore(name?: string) {
  if (!name) return 50;

  return teamPriority.find(([pattern]) => pattern.test(name))?.[1] ?? 50;
}

function fixtureAttractiveness(fixture: ApiFootballFixture) {
  const home = fixture.teams?.home?.name ?? "";
  const away = fixture.teams?.away?.name ?? "";
  const pair = `${home} ${away}`;

  if (/france/i.test(pair) && /spain|espagne/i.test(pair)) return 0;

  return teamScore(home) + teamScore(away);
}

function scoreFixture(fixture: ApiFootballFixture) {
  const leagueId = fixture.league?.id ?? 0;
  const leagueName = fixture.league?.name ?? "";
  const namePriority =
    leagueNamePriority.find(([pattern]) => pattern.test(leagueName))?.[1] ?? 99;
  const leagueScore = leaguePriority.get(leagueId) ?? namePriority;
  const kickoff = fixture.fixture?.date
    ? new Date(fixture.fixture.date).getTime()
    : Number.MAX_SAFE_INTEGER;

  return (
    leagueScore * 10_000_000_000_000 +
    fixtureAttractiveness(fixture) * 10_000_000_000 +
    kickoff
  );
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
