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
    country?: string;
    id?: number;
    name?: string;
  };
  teams?: {
    home?: {
      id?: number;
      name?: string;
      logo?: string;
    };
    away?: {
      id?: number;
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
  // Top 1 à 10 : sommets mondiaux
  [2, 1],
  [1, 1],
  [39, 3],
  [140, 4],
  [4, 5],
  [13, 6],
  [135, 7],
  [78, 8],
  [9, 9],
  [61, 10],
  // Top 11 à 20 : second tir européen et Amériques
  [3, 11],
  [71, 12],
  [15, 13],
  [128, 14],
  [40, 15],
  [94, 16],
  [253, 17],
  [88, 18],
  [262, 19],
  [6, 20],
  // Top 21 à 30 : coupes nationales et ligues émergentes
  [45, 21],
  [848, 22],
  [307, 23],
  [143, 24],
  [144, 25],
  [203, 26],
  [81, 27],
  [137, 28],
  [66, 29],
  [11, 30],
  // Top 31 à 40 : Asie, CONCACAF et compétitions secondaires
  [17, 31],
  [22, 32],
  [5, 33],
  [16, 34],
  [12, 35],
  [141, 36],
  [136, 37],
  [79, 38],
  [179, 39],
  [98, 40],
  // Top 41 à 50 : championnats régionaux et espoirs
  [207, 41],
  [239, 42],
  [292, 43],
  [72, 44],
  [197, 45],
  [106, 46],
  [218, 47],
  [113, 48],
  [531, 49],
]);

const internationalLeagueNamePriority: Array<[RegExp, number]> = [
  [/club world cup|coupe du monde des clubs/i, 13],
  [/afc champions league|ligue des champions de l'afc/i, 31],
  [/concacaf champions/i, 34],
  [/caf champions league|ligue des champions de la caf/i, 35],
  [/uefa champions league|ligue des champions de l'uefa|champions league/i, 1],
  [/fifa world cup|world cup|coupe du monde/i, 2],
  [/\beuro\b|european championship|championnat d'europe/i, 5],
  [/libertadores/i, 6],
  [/copa america/i, 9],
  [/europa league|ligue europa/i, 11],
  [/africa cup of nations|coupe d'afrique|can\b/i, 20],
  [/fa cup/i, 21],
  [/conference league|ligue conférence/i, 22],
  [/copa sudamericana|sudamericana/i, 30],
  [/gold cup/i, 32],
  [/nations league|ligue des nations/i, 33],
  [/uefa super cup|supercopa de europa|super coupe/i, 49],
];

const domesticLeagueNamePriority: Array<[RegExp, RegExp, number]> = [
  [/france/i, /ligue 1|mcdonald/i, 10],
  [/england/i, /premier league/i, 3],
  [/spain/i, /laliga|la liga/i, 4],
  [/italy/i, /serie a|enilive/i, 7],
  [/germany/i, /bundesliga$/i, 8],
  [/brazil/i, /brasileir|serie a/i, 12],
  [/argentina/i, /liga profesional|primera division/i, 14],
  [/england/i, /championship/i, 15],
  [/portugal/i, /liga portugal|primeira liga|betclic/i, 16],
  [/usa|united states|canada/i, /major league soccer|\bmls\b/i, 17],
  [/netherlands/i, /eredivisie/i, 18],
  [/mexico/i, /liga mx/i, 19],
  [/spain/i, /copa del rey/i, 24],
  [/belgium/i, /jupiler pro league|first division a/i, 25],
  [/turkey/i, /super lig|süper lig/i, 26],
  [/germany/i, /dfb pokal|dfb-pokal/i, 27],
  [/italy/i, /coppa italia/i, 28],
  [/france/i, /coupe de france/i, 29],
  [/spain/i, /hypermotion|segunda division/i, 36],
  [/italy/i, /serie b/i, 37],
  [/germany/i, /2\. bundesliga|zweite bundesliga/i, 38],
  [/scotland/i, /premiership/i, 39],
  [/japan/i, /j1 league/i, 40],
  [/switzerland/i, /super league/i, 41],
  [/argentina|colombia/i, /superliga|primera a|categoría primera a/i, 42],
  [/south korea|korea/i, /k league 1/i, 43],
  [/brazil/i, /serie b|série b/i, 44],
  [/greece/i, /super league/i, 45],
  [/poland/i, /ekstraklasa|sdr/i, 46],
  [/austria/i, /bundesliga/i, 47],
  [/sweden/i, /allsvenskan/i, 48],
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

const teamTranslations = new Map<string, string>([
  ["argentina", "Argentine"],
  ["england", "Angleterre"],
  ["spain", "Espagne"],
  ["germany", "Allemagne"],
  ["italy", "Italie"],
  ["brazil", "Brésil"],
  ["netherlands", "Pays-Bas"],
  ["belgium", "Belgique"],
  ["mexico", "Mexique"],
  ["united states", "États-Unis"],
  ["usa", "États-Unis"],
]);

const unreliableMatchPattern =
  /\b(u\d{2}|u-\d{2}|under\s*\d{2}|youth|reserve|reserves|women|woman|female|feminine|féminin|féminine|feminino|feminina|w\b|amateur|academy|sub-\d{2})\b/i;

function translateTeam(name?: string) {
  if (!name) return "Équipe";

  return teamTranslations.get(name.trim().toLowerCase()) ?? name;
}

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

function leagueNameScore(fixture: ApiFootballFixture) {
  const leagueName = fixture.league?.name ?? "";
  const country = fixture.league?.country ?? "";
  const internationalScore = internationalLeagueNamePriority.find(([pattern]) =>
    pattern.test(leagueName),
  )?.[1];

  if (internationalScore) return internationalScore;

  return (
    domesticLeagueNamePriority.find(
      ([countryPattern, leaguePattern]) =>
        countryPattern.test(country) && leaguePattern.test(leagueName),
    )?.[2] ?? 99
  );
}

function hasReliableResultCoverage(fixture: ApiFootballFixture) {
  const fixtureId = fixture.fixture?.id;
  const home = fixture.teams?.home?.name ?? "";
  const away = fixture.teams?.away?.name ?? "";
  const league = fixture.league?.name ?? "";
  const label = `${home} ${away} ${league}`;

  return Boolean(
    fixtureId &&
      home &&
      away &&
      !unreliableMatchPattern.test(label),
  );
}

function isKnownPriorityFixture(fixture: ApiFootballFixture) {
  const leagueId = fixture.league?.id ?? 0;

  return (
    leaguePriority.has(leagueId) ||
    leagueNameScore(fixture) < 99 ||
    fixtureAttractiveness(fixture) < 50
  );
}

function scoreFixture(fixture: ApiFootballFixture) {
  const leagueId = fixture.league?.id ?? 0;
  const leagueScore = leaguePriority.get(leagueId) ?? leagueNameScore(fixture);
  const kickoff = fixture.fixture?.date
    ? new Date(fixture.fixture.date).getTime()
    : Number.MAX_SAFE_INTEGER;

  return (
    leagueScore * 10_000_000_000_000 +
    fixtureAttractiveness(fixture) * 10_000_000_000 +
    kickoff
  );
}

function deterministicNumber(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 9973;
  }

  return hash;
}

function rotatingTopLeagueScore(fixture: ApiFootballFixture) {
  const leagueId = fixture.league?.id ?? 0;
  const leagueScore = leaguePriority.get(leagueId) ?? leagueNameScore(fixture);

  if (leagueScore > 20) return Number.MAX_SAFE_INTEGER;

  const leagueKey = fixtureLeagueKey(fixture);
  const rotation = deterministicNumber(`${todayKey()}-${leagueKey}`) % 20;

  return leagueScore * 2 + rotation;
}

function fixtureLeagueKey(fixture: ApiFootballFixture) {
  return String(fixture.league?.id ?? fixture.league?.name ?? "unknown");
}

function isMajorInternationalFixture(fixture: ApiFootballFixture) {
  const country = fixture.league?.country ?? "";
  const leagueName = fixture.league?.name ?? "";
  const isInternationalCompetition =
    /world|euro|copa america|nations league|africa cup|gold cup/i.test(
      `${country} ${leagueName}`,
    );

  return isInternationalCompetition && fixtureAttractiveness(fixture) <= 10;
}

function pickDailyFixtures(fixtures: ApiFootballFixture[]) {
  const sortedFixtures = [...fixtures].sort((a, b) => scoreFixture(a) - scoreFixture(b));
  const topTwentyByLeague = new Map<string, ApiFootballFixture[]>();
  const selected: ApiFootballFixture[] = [];
  const byLeague = new Map<string, number>();

  for (const fixture of sortedFixtures) {
    if (rotatingTopLeagueScore(fixture) === Number.MAX_SAFE_INTEGER) continue;

    const leagueKey = fixtureLeagueKey(fixture);
    const group = topTwentyByLeague.get(leagueKey) ?? [];

    group.push(fixture);
    topTwentyByLeague.set(leagueKey, group);
  }

  const topTwentyGroups = [...topTwentyByLeague.entries()]
    .map(([leagueKey, group]) => ({
      fixtures: group.sort((a, b) => scoreFixture(a) - scoreFixture(b)),
      leagueKey,
      rotationScore: rotatingTopLeagueScore(group[0]),
    }))
    .sort((a, b) => a.rotationScore - b.rotationScore);

  for (const group of topTwentyGroups) {
    selected.push(group.fixtures[0]);
    byLeague.set(group.leagueKey, 1);

    if (selected.length === 5) return selected;
  }

  for (const fixture of sortedFixtures) {
    if (selected.includes(fixture)) continue;

    const leagueKey = fixtureLeagueKey(fixture);
    const leagueCount = byLeague.get(leagueKey) ?? 0;

    if (leagueCount >= 2 && !isMajorInternationalFixture(fixture)) continue;

    selected.push(fixture);
    byLeague.set(leagueKey, leagueCount + 1);

    if (selected.length === 5) return selected;
  }

  for (const fixture of sortedFixtures) {
    if (selected.includes(fixture)) continue;

    selected.push(fixture);

    if (selected.length === 5) return selected;
  }

  return selected;
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
    label: `${translateTeam(fixture.teams?.home?.name)} vs ${translateTeam(fixture.teams?.away?.name)}`,
    time: formatKickoff(fixture.fixture?.date),
    homeTeamId: fixture.teams?.home?.id,
    awayTeamId: fixture.teams?.away?.id,
    homeTeamName: translateTeam(fixture.teams?.home?.name),
    awayTeamName: translateTeam(fixture.teams?.away?.name),
    homeLogo: fixture.teams?.home?.logo,
    awayLogo: fixture.teams?.away?.logo,
    isPredictable,
    scoreLabel: hasScore ? `${homeGoals}-${awayGoals}` : undefined,
    statusLabel: isPredictable
      ? "Ouvert"
      : status === "FT"
        ? "Terminé"
        : status === "HT"
          ? "Mi-temps"
          : status === "1H" || status === "2H"
            ? `Live ${fixture.fixture?.status?.elapsed ?? ""}'`
            : kickoffHasPassed
              ? "Commencé"
              : "Verrouillé",
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
      next: { revalidate: 10 * 60 },
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
    const reliableFixtures = fixtures.filter(hasReliableResultCoverage);
    const priorityFixtures = reliableFixtures.filter(isKnownPriorityFixture);
    const secondaryFixtures = reliableFixtures.filter(
      (fixture) => !isKnownPriorityFixture(fixture),
    );
    const playableFixtures = pickDailyFixtures([
      ...priorityFixtures,
      ...secondaryFixtures,
    ]);
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
