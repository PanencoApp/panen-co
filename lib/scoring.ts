import type { PredictionPick, ScoreLine } from "@/types";

export type MatchResult = {
  homeScore: number;
  awayScore: number;
  scorers: string[];
  firstTeam: "Domicile" | "Exterieur" | "Aucun";
  lastTeam: "Domicile" | "Exterieur" | "Aucun";
};

export function rewardForRank(rank: number) {
  if (rank === 1) return 150;
  if (rank <= 3) return 100;
  if (rank <= 10) return 50;
  if (rank <= 30) return 30;
  return 10;
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isSameChoice(left: string, right: string) {
  return normalize(left) === normalize(right);
}

function expectedResult(result: MatchResult) {
  if (result.homeScore > result.awayScore) return "Victoire domicile";
  if (result.homeScore < result.awayScore) return "Victoire exterieur";
  return "Nul";
}

function exactScore(result: MatchResult) {
  return `${result.homeScore}-${result.awayScore}`;
}

function goalsPick(result: MatchResult) {
  return result.homeScore + result.awayScore > 1.5
    ? "Plus de 1.5"
    : "Moins de 1.5";
}

function includesScorer(scorers: string[], pick: string) {
  if (isSameChoice(pick, "Aucun buteur")) return scorers.length === 0;
  return scorers.some((scorer) => isSameChoice(scorer, pick));
}

function scoreLine({
  label,
  maxPoints,
  won,
}: {
  label: string;
  maxPoints: number;
  won: boolean;
}): ScoreLine {
  return {
    label,
    maxPoints,
    won,
    points: won ? maxPoints : 0,
  };
}

export function calculatePredictionScore(
  pick: PredictionPick,
  result: MatchResult,
) {
  const details: ScoreLine[] = [
    scoreLine({
      label: "Résultat 1N2",
      maxPoints: 1,
      won: isSameChoice(pick.result, expectedResult(result)),
    }),
    scoreLine({
      label: "Buteur",
      maxPoints: 2,
      won: includesScorer(result.scorers, pick.scorer),
    }),
    scoreLine({
      label: "Score exact",
      maxPoints: 3,
      won: isSameChoice(pick.exactScore, exactScore(result)),
    }),
    scoreLine({
      label: "Première équipe",
      maxPoints: 1,
      won: isSameChoice(pick.firstTeam, result.firstTeam),
    }),
    scoreLine({
      label: "Dernière équipe",
      maxPoints: 1,
      won: isSameChoice(pick.lastTeam, result.lastTeam),
    }),
    scoreLine({
      label: "Total buts",
      maxPoints: 1,
      won: isSameChoice(pick.goals, goalsPick(result)),
    }),
  ];

  return {
    total: details.reduce((sum, detail) => sum + detail.points, 0),
    details,
  };
}

export const demoMatchResult: MatchResult = {
  homeScore: 2,
  awayScore: 1,
  scorers: ["Kylian Mbappe", "Erling Haaland"],
  firstTeam: "Domicile",
  lastTeam: "Exterieur",
};
