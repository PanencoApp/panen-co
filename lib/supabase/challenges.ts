import type { MatchOption, PredictionPick, ScoreLine } from "@/types";
import { supabase } from "@/lib/supabase/client";

export type FriendChallenge = {
  id: string;
  creatorPseudo: string;
  friendPseudo?: string;
  matchId: string;
  matchLabel: string;
  matchTime: string;
  matchDate?: string;
  stake: string;
  creatorPick: PredictionPick;
  friendPick?: PredictionPick;
  status: "waiting" | "active" | "done";
  creatorPoints?: number;
  friendPoints?: number;
  creatorScoreDetails?: ScoreLine[];
  friendScoreDetails?: ScoreLine[];
};

type FriendChallengeRow = {
  id: string;
  creator_pseudo: string;
  friend_pseudo: string | null;
  match_id: string;
  match_label: string;
  match_time: string;
  match_date: string | null;
  stake: string;
  creator_pick: PredictionPick;
  friend_pick: PredictionPick | null;
  status: "waiting" | "active" | "done";
  creator_points: number | null;
  friend_points: number | null;
  creator_score_details: ScoreLine[] | null;
  friend_score_details: ScoreLine[] | null;
};

function toChallenge(row: FriendChallengeRow): FriendChallenge {
  return {
    id: row.id,
    creatorPseudo: row.creator_pseudo,
    friendPseudo: row.friend_pseudo ?? undefined,
    matchId: row.match_id,
    matchLabel: row.match_label,
    matchTime: row.match_time,
    matchDate: row.match_date ?? undefined,
    stake: row.stake,
    creatorPick: row.creator_pick,
    friendPick: row.friend_pick ?? undefined,
    status: row.status,
    creatorPoints: row.creator_points ?? undefined,
    friendPoints: row.friend_points ?? undefined,
    creatorScoreDetails: row.creator_score_details ?? undefined,
    friendScoreDetails: row.friend_score_details ?? undefined,
  };
}

export async function createFriendChallenge({
  match,
  pick,
  pseudo,
  stake,
  userId,
}: {
  match: MatchOption;
  pick: PredictionPick;
  pseudo: string;
  stake: string;
  userId: string;
}) {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configuré."),
    };
  }

  const result = await supabase
    .from("friend_challenges")
    .insert({
      creator_id: userId,
      creator_pseudo: pseudo,
      match_id: match.id,
      match_label: match.label,
      match_time: match.time,
      stake,
      creator_pick: pick,
      status: "waiting",
    })
    .select("*")
    .single();

  return {
    data: result.data ? toChallenge(result.data as FriendChallengeRow) : null,
    error: result.error,
  };
}

export async function getFriendChallenge(id: string) {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configuré."),
    };
  }

  const result = await supabase
    .from("friend_challenges")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return {
    data: result.data ? toChallenge(result.data as FriendChallengeRow) : null,
    error: result.error,
  };
}

export async function joinFriendChallenge({
  challengeId,
  pick,
  pseudo,
  userId,
}: {
  challengeId: string;
  pick: PredictionPick;
  pseudo: string;
  userId: string;
}) {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configuré."),
    };
  }

  const existing = await getFriendChallenge(challengeId);

  if (existing.error || !existing.data) {
    return {
      data: null,
      error: existing.error ?? new Error("Défi introuvable."),
    };
  }

  if (existing.data.friendPick) {
    return {
      data: null,
      error: new Error("Ce défi a déjà été accepté."),
    };
  }

  const result = await supabase
    .from("friend_challenges")
    .update({
      friend_id: userId,
      friend_pseudo: pseudo,
      friend_pick: pick,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", challengeId)
    .is("friend_id", null)
    .select("*")
    .single();

  return {
    data: result.data ? toChallenge(result.data as FriendChallengeRow) : null,
    error: result.error,
  };
}

export async function settleFriendChallenge(challengeId: string) {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configuré."),
    };
  }

  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;

  if (!accessToken) {
    return {
      data: null,
      error: new Error("Connexion requise pour vérifier le défi."),
    };
  }

  const response = await fetch("/api/challenges/settle", {
    body: JSON.stringify({ challengeId }),
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const payload = (await response.json()) as {
    challenge?: FriendChallenge;
    error?: string;
  };

  if (!response.ok) {
    return {
      data: null,
      error: new Error(payload.error ?? "Impossible de vérifier le défi."),
    };
  }

  return {
    data: payload.challenge ?? null,
    error: null,
  };
}
