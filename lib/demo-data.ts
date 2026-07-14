import type { HistoryItem, MatchOption, TopPlayer, UserProfile } from "@/types";
import { rewardForRank } from "@/lib/scoring";

export const currentUser = "admin";

export const defaultProfile: UserProfile = {
  pseudo: "admin",
  email: "admin@panen-co.app",
  password: "panenco123",
};

export const weeklyRank = 7;
export const finalScore = 7;

export const matches: MatchOption[] = [
  { id: "real-city", label: "Real Madrid vs Man. City", time: "Aujourd'hui 21:00" },
  { id: "psg-bayern", label: "Paris SG vs Bayern", time: "Aujourd'hui 20:45" },
  { id: "barca-inter", label: "Barca vs Inter", time: "Aujourd'hui 22:00" },
  { id: "arsenal-juve", label: "Arsenal vs Juventus", time: "Aujourd'hui 18:30" },
  { id: "om-atleti", label: "Marseille vs Atletico", time: "Aujourd'hui 19:00" },
];

export const scorerOptions = [
  "Kylian Mbappe",
  "Erling Haaland",
  "Vinicius Junior",
  "Harry Kane",
  "Bukayo Saka",
  "Lautaro Martinez",
  "Antoine Griezmann",
  "Aucun buteur",
];

const playerNames = [
  "NinaGoal",
  "Kariim",
  "AyaWin",
  "Malo7",
  "SofiaX",
  "TikiTaka",
  "Lucarne",
  "DerbyKing",
  "Capitaine",
  "PanenMax",
];

export const demoHistory: HistoryItem[] = [
  { id: "demo-1", matchLabel: "Real Madrid vs Man. City", date: "7 juillet 2026", points: 7 },
  { id: "demo-2", matchLabel: "Paris SG vs Bayern", date: "6 juillet 2026", points: 5 },
  { id: "demo-3", matchLabel: "Barca vs Inter", date: "5 juillet 2026", points: 9 },
  { id: "demo-4", matchLabel: "Marseille vs Atletico", date: "4 juillet 2026", points: 4 },
];

export const topPlayers: TopPlayer[] = Array.from({ length: 50 }, (_, index) => {
  const rank = index + 1;
  const isCurrentUser = rank === weeklyRank;

  return {
    rank,
    pseudo: isCurrentUser
      ? currentUser
      : playerNames[index % playerNames.length] + (rank > 10 ? rank : ""),
    points: 1380 - index * 23,
    reward: rewardForRank(rank),
    isCurrentUser,
  };
});
