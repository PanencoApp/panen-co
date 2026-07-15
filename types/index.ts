export type View =
  | "home"
  | "matches"
  | "challenge"
  | "prediction-active"
  | "prediction-done";

export type OnboardingStep = 1 | 2 | "conditions" | "login" | "done";

export type PredictionPick = {
  result: string;
  scorer: string;
  exactScore: string;
  firstTeam: string;
  lastTeam: string;
  goals: string;
};

export type PredictionRecord = {
  id: string;
  matchId: string;
  matchLabel: string;
  matchTime: string;
  matchDate?: string;
  createdAt?: string;
  pick: PredictionPick;
  status: "active" | "done";
  score?: number;
  scoreDetails?: ScoreLine[];
  rank?: number;
};

export type ScoreLine = {
  label: string;
  points: number;
  maxPoints: number;
  won: boolean;
};

export type UserProfile = {
  pseudo: string;
  email: string;
  password: string;
};

export type MatchOption = {
  id: string;
  label: string;
  time: string;
  homeTeamId?: number;
  awayTeamId?: number;
  homeTeamName?: string;
  awayTeamName?: string;
  homeLogo?: string;
  awayLogo?: string;
  isPredictable?: boolean;
  scoreLabel?: string;
  statusLabel?: string;
};

export type PlayerOption = {
  id: number;
  name: string;
  photo?: string;
  position?: string;
  team: "home" | "away";
};

export type TopPlayer = {
  rank: number;
  pseudo: string;
  points: number;
  reward: number;
  isCurrentUser: boolean;
  isVirtual?: boolean;
};

export type HistoryItem = {
  id: string;
  matchLabel: string;
  date: string;
  points: number;
};
