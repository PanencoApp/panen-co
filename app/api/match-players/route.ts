import { NextRequest, NextResponse } from "next/server";
import type { PlayerOption } from "@/types";

type ApiPlayer = {
  player?: {
    id?: number;
    name?: string;
    photo?: string;
    position?: string;
  };
};

const positionPriority = new Map<string, number>([
  ["Attacker", 1],
  ["Forward", 1],
  ["Midfielder", 2],
  ["Defender", 3],
  ["Goalkeeper", 4],
]);

const playerNamePriority: Array<[RegExp, number]> = [
  [/mbapp/i, 1],
  [/vinicius|vinícius/i, 2],
  [/bellingham/i, 3],
  [/haaland/i, 4],
  [/kane/i, 5],
  [/salah/i, 6],
  [/yamal/i, 7],
  [/dembele|dembélé/i, 8],
  [/griezmann/i, 9],
];

function playerPriority(player: PlayerOption) {
  const namePriority =
    playerNamePriority.find(([pattern]) => pattern.test(player.name))?.[1] ?? 50;
  const positionScore = positionPriority.get(player.position ?? "") ?? 9;

  return namePriority * 10 + positionScore;
}

async function fetchTeamPlayers({
  apiKey,
  teamId,
  teamSide,
}: {
  apiKey: string;
  teamId: string;
  teamSide: "home" | "away";
}) {
  const url = new URL("https://v3.football.api-sports.io/players/squads");
  url.searchParams.set("team", teamId);

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
    next: { revalidate: 60 * 60 * 12 },
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as {
    response?: Array<{ players?: ApiPlayer["player"][] }>;
  };

  return (payload.response?.[0]?.players ?? [])
    .filter((player): player is NonNullable<ApiPlayer["player"]> =>
      Boolean(player?.id && player.name),
    )
    .map((player) => ({
      id: player.id as number,
      name: player.name as string,
      photo: player.photo,
      position: player.position,
      team: teamSide,
    })) satisfies PlayerOption[];
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const homeTeamId = request.nextUrl.searchParams.get("homeTeamId");
  const awayTeamId = request.nextUrl.searchParams.get("awayTeamId");

  if (!apiKey || !homeTeamId || !awayTeamId) {
    return NextResponse.json({ players: [] });
  }

  const [homePlayers, awayPlayers] = await Promise.all([
    fetchTeamPlayers({ apiKey, teamId: homeTeamId, teamSide: "home" }),
    fetchTeamPlayers({ apiKey, teamId: awayTeamId, teamSide: "away" }),
  ]);
  const players = [...homePlayers, ...awayPlayers]
    .sort((left, right) => {
      const priority = playerPriority(left) - playerPriority(right);
      if (priority !== 0) return priority;
      return left.name.localeCompare(right.name);
    })
    .slice(0, 40);

  return NextResponse.json({
    players,
  });
}
