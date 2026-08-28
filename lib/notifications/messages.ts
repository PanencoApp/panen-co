export type AppNotificationKind =
  | "daily-matches"
  | "daily-matches-reminder"
  | "fifth-day-tokens"
  | "friend-challenge-finished"
  | "prediction-results-ready";

type FriendChallengeFinishedParams = {
  loserPseudo: string;
  stake: string;
  winnerPseudo: string;
};

function cleanStake(stake: string) {
  const normalizedStake = stake.trim();

  return normalizedStake || "un défi";
}

export const notificationMessages = {
  dailyMatches: {
    body: "Les matchs du jour sont disponibles. À toi de jouer.",
    schedule: "Chaque jour à minuit.",
    title: "Matchs du jour disponibles",
  },
  dailyMatchesReminder: {
    body: "Petit rappel : les matchs du jour t’attendent encore.",
    schedule: "Chaque jour à 9h.",
    title: "Matchs du jour disponibles",
  },
  fifthDayTokens: {
    body: "5 jetons dispo pour toi aujourd’hui. Profites-en.",
    schedule: "Le 5 de chaque mois.",
    title: "5 du mois",
  },
  predictionResultsReady: {
    body: "Check si tu as grimpé au classement de la semaine.",
    title: "Tes résultats t’attendent",
  },
};

export function friendChallengeFinishedMessage({
  loserPseudo,
  stake,
  winnerPseudo,
}: FriendChallengeFinishedParams) {
  return {
    body: `${loserPseudo} doit ${cleanStake(stake)} à ${winnerPseudo}.`,
    title: "Le défi est terminé",
  };
}

