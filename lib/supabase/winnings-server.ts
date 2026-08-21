import { rewardForRank } from "@/lib/scoring";
import {
  currentWeekStart,
  rankWeeklyPlayers,
  type RankableWeeklyPlayer,
} from "@/lib/supabase/leaderboard";
import { serverSupabase } from "@/lib/supabase/server";

type WeeklyScoreForReward = {
  user_id: string;
  pseudo: string | null;
  points: number;
};

async function creditWeeklyReward({
  rank,
  reward,
  userId,
  weekStart,
}: {
  rank: number;
  reward: number;
  userId: string;
  weekStart: string;
}) {
  if (!serverSupabase || reward <= 0) return;

  const existingClaim = await serverSupabase
    .from("weekly_reward_claims")
    .select("id, best_rank, best_reward_euros, credited_euros")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  const previousReward = existingClaim.data?.best_reward_euros ?? 0;
  const previousRank = existingClaim.data?.best_rank ?? null;
  const nextBestRank =
    previousRank === null || rank < previousRank ? rank : previousRank;

  if (reward <= previousReward) {
    if (existingClaim.data?.id && nextBestRank !== previousRank) {
      await serverSupabase
        .from("weekly_reward_claims")
        .update({
          best_rank: nextBestRank,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingClaim.data.id);
    }

    return;
  }

  const delta = reward - previousReward;

  await serverSupabase.from("user_winnings").upsert(
    {
      user_id: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  const wallet = await serverSupabase
    .from("user_winnings")
    .select("balance_euros, total_earned_euros")
    .eq("user_id", userId)
    .maybeSingle();

  await serverSupabase
    .from("user_winnings")
    .update({
      balance_euros: (wallet.data?.balance_euros ?? 0) + delta,
      total_earned_euros: (wallet.data?.total_earned_euros ?? 0) + delta,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  const claimPayload = {
    user_id: userId,
    week_start: weekStart,
    best_rank: nextBestRank,
    best_reward_euros: reward,
    credited_euros: reward,
    updated_at: new Date().toISOString(),
  };

  if (existingClaim.data?.id) {
    await serverSupabase
      .from("weekly_reward_claims")
      .update(claimPayload)
      .eq("id", existingClaim.data.id);
    return;
  }

  await serverSupabase.from("weekly_reward_claims").insert(claimPayload);
}

export async function syncWeeklyRewards(userId?: string) {
  if (!serverSupabase) return { creditedUsers: 0 };

  const weekStart = currentWeekStart();
  const scores = await serverSupabase
    .from("weekly_scores")
    .select("user_id, pseudo, points")
    .eq("week_start", weekStart)
    .order("points", { ascending: false });

  if (scores.error) throw scores.error;

  const realPlayers: RankableWeeklyPlayer[] = (
    (scores.data ?? []) as WeeklyScoreForReward[]
  ).map((score) => ({
    userId: score.user_id,
    pseudo: score.pseudo ?? "Joueur",
    points: score.points,
  }));

  const ranked = rankWeeklyPlayers(realPlayers);
  const rewardedPlayers = ranked.filter(
    (player) =>
      !player.isVirtual &&
      player.userId &&
      player.rank <= 50 &&
      (!userId || player.userId === userId),
  );

  for (const player of rewardedPlayers) {
    await creditWeeklyReward({
      rank: player.rank,
      reward: rewardForRank(player.rank),
      userId: player.userId!,
      weekStart,
    });

    await serverSupabase
      .from("weekly_scores")
      .update({
        reward_euros: rewardForRank(player.rank),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", player.userId)
      .eq("week_start", weekStart);
  }

  return { creditedUsers: rewardedPlayers.length };
}
