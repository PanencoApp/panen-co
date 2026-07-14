import type { TopPlayer } from "@/types";
import { rewardForRank } from "@/lib/scoring";
import { supabase } from "@/lib/supabase/client";

type WeeklyScoreRow = {
  user_id: string;
  pseudo: string | null;
  points: number;
  reward_euros: number;
};

const virtualPseudos = [
  "MaxDuFoot",
  "NinoFC",
  "Lucarne7",
  "MaloGoal",
  "TikiThomas",
  "AyaTactique",
  "DerbyKing",
  "SofiaBall",
  "Kariim10",
  "CapitaineL",
  "NinaGoal",
  "PanenMax",
  "LucaProno",
  "MisterVAR",
  "Zone14",
  "MatheoFC",
  "NoaCorner",
  "RayanFoot",
  "CamilleXG",
  "LeoSurface",
  "Amine9",
  "SachaGoal",
  "TheoPressing",
  "IlyesFC",
  "HugoDerby",
  "MilaFoot",
  "SamTiki",
  "AlexLucarne",
  "Eliott10",
  "NassimBall",
  "ChloeLiga",
  "RyanButeur",
  "TomProno",
  "EnzoVAR",
  "YanFootix",
  "NoeFinale",
  "LinaGoal",
  "OscarFC",
  "MehdiFoot",
  "JulesCorner",
  "AdamDerby",
  "NoraTacle",
  "IsaacSport",
  "EdenProno",
  "IlanBut",
  "MaelFoot",
  "LennyZone",
  "AminataFC",
  "NaelScore",
  "YanisTop",
];

function parisDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

export function currentWeekStart() {
  const { year, month, day } = parisDateParts();
  const parisNoon = new Date(Date.UTC(year, month - 1, day, 12));
  const daysSinceSunday = parisNoon.getUTCDay();

  parisNoon.setUTCDate(parisNoon.getUTCDate() - daysSinceSunday);

  return parisNoon.toISOString().slice(0, 10);
}

function virtualScore(rank: number) {
  if (rank === 1) return 250;
  if (rank <= 3) return 245 - rank * 4;
  if (rank <= 10) return 225 - rank * 5 - ((rank * 3) % 4);
  if (rank <= 30) return 190 - rank * 3 - ((rank * 5) % 7);
  return Math.max(70, 125 - rank - ((rank * 7) % 6));
}

function fillWithVirtualPlayers(
  players: TopPlayer[],
  currentUserId?: string | null,
) {
  const usedPseudos = new Set(players.map((player) => player.pseudo));
  const virtualPlayers: TopPlayer[] = [];

  for (const pseudo of virtualPseudos) {
    if (virtualPlayers.length >= 50) break;
    if (usedPseudos.has(pseudo)) continue;

    const virtualRank = virtualPlayers.length + 1;

    virtualPlayers.push({
      rank: virtualRank,
      pseudo,
      points: virtualScore(virtualRank),
      reward: rewardForRank(virtualRank),
      isCurrentUser: false,
      isVirtual: true,
    });
  }

  return [...players, ...virtualPlayers]
    .sort((left, right) => {
      if (right.points !== left.points) return right.points - left.points;
      if (left.isVirtual === right.isVirtual) return left.pseudo.localeCompare(right.pseudo);
      return left.isVirtual ? 1 : -1;
    })
    .slice(0, 50)
    .map((player, index) => ({
      ...player,
      rank: index + 1,
      reward: rewardForRank(index + 1),
      isCurrentUser: player.isCurrentUser || player.pseudo === currentUserId,
    }));
}

export async function getWeeklyLeaderboard(currentUserId?: string | null) {
  if (!supabase) return fillWithVirtualPlayers([], currentUserId);

  const result = await supabase
    .from("weekly_scores")
    .select("user_id, pseudo, points, reward_euros")
    .eq("week_start", currentWeekStart())
    .order("points", { ascending: false })
    .limit(50);

  if (result.error) return fillWithVirtualPlayers([], currentUserId);

  const realPlayers = ((result.data ?? []) as WeeklyScoreRow[]).map((row, index) => {
    const rank = index + 1;

    return {
      rank,
      pseudo: row.pseudo ?? `Joueur ${rank}`,
      points: row.points,
      reward: row.reward_euros || rewardForRank(rank),
      isCurrentUser: row.user_id === currentUserId,
    } satisfies TopPlayer;
  });

  return fillWithVirtualPlayers(realPlayers, currentUserId);
}

export async function addWeeklyPoints({
  userId,
  pseudo,
  points,
}: {
  userId: string;
  pseudo: string;
  points: number;
}) {
  if (!supabase) return { error: new Error("Supabase n'est pas encore configure.") };

  const weekStart = currentWeekStart();
  const existing = await supabase
    .from("weekly_scores")
    .select("id, points")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existing.error) return { error: existing.error };

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
    return supabase
      .from("weekly_scores")
      .update(payload)
      .eq("id", existing.data.id);
  }

  return supabase.from("weekly_scores").insert(payload);
}
