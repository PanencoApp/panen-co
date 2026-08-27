import { supabase } from "@/lib/supabase/client";

type DailyTokenRow = {
  id: string;
  user_id: string;
  token_date: string;
  free_tokens: number;
  ad_tokens: number;
  subscription_tokens: number;
  used_tokens: number;
};

type TokenResult = {
  tokens: number;
  row: DailyTokenRow | null;
  error: Error | null;
};

type ConsumeResult = TokenResult & {
  ok: boolean;
};

function parisDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).formatToParts(date);

  return {
    day: Number(parts.find((part) => part.type === "day")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    year: Number(parts.find((part) => part.type === "year")?.value),
  };
}

function todayKey() {
  const { day, month, year } = parisDateParts();

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dailyFreeTokenAmount() {
  return parisDateParts().day === 5 ? 5 : 1;
}

function countAvailableTokens(row: DailyTokenRow) {
  return Math.max(
    0,
    row.free_tokens + row.ad_tokens + row.subscription_tokens - row.used_tokens,
  );
}

function unavailable(error: Error): TokenResult {
  return {
    tokens: 1,
    row: null,
    error,
  };
}

export async function getOrCreateDailyTokens(userId: string): Promise<TokenResult> {
  if (!supabase) {
    return unavailable(new Error("Supabase n'est pas encore configure."));
  }

  const tokenDate = todayKey();
  const existing = await supabase
    .from("daily_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("token_date", tokenDate)
    .maybeSingle();

  if (existing.error) {
    return unavailable(existing.error);
  }

  if (existing.data) {
    const freeTokens = dailyFreeTokenAmount();

    if (existing.data.free_tokens < freeTokens) {
      const upgraded = await supabase
        .from("daily_tokens")
        .update({ free_tokens: freeTokens })
        .eq("id", existing.data.id)
        .select("*")
        .single();

      if (!upgraded.error) {
        return {
          tokens: countAvailableTokens(upgraded.data),
          row: upgraded.data,
          error: null,
        };
      }
    }

    return {
      tokens: countAvailableTokens(existing.data),
      row: existing.data,
      error: null,
    };
  }

  const created = await supabase
    .from("daily_tokens")
    .insert({
      user_id: userId,
      token_date: tokenDate,
      free_tokens: dailyFreeTokenAmount(),
      ad_tokens: 0,
      subscription_tokens: 0,
      used_tokens: 0,
    })
    .select("*")
    .single();

  if (created.error) {
    return unavailable(created.error);
  }

  return {
    tokens: countAvailableTokens(created.data),
    row: created.data,
    error: null,
  };
}

export async function addAdToken(userId: string): Promise<TokenResult> {
  if (!supabase) {
    return unavailable(new Error("Supabase n'est pas encore configure."));
  }

  const current = await getOrCreateDailyTokens(userId);

  if (current.error || !current.row) {
    return current;
  }

  const updated = await supabase
    .from("daily_tokens")
    .update({ ad_tokens: current.row.ad_tokens + 1 })
    .eq("id", current.row.id)
    .select("*")
    .single();

  if (updated.error) {
    return {
      tokens: current.tokens,
      row: current.row,
      error: updated.error,
    };
  }

  return {
    tokens: countAvailableTokens(updated.data),
    row: updated.data,
    error: null,
  };
}

export async function consumeDailyToken(userId: string): Promise<ConsumeResult> {
  if (!supabase) {
    return {
      ...unavailable(new Error("Supabase n'est pas encore configure.")),
      ok: false,
    };
  }

  const current = await getOrCreateDailyTokens(userId);

  if (current.error || !current.row) {
    return {
      ...current,
      ok: false,
    };
  }

  if (current.tokens <= 0) {
    return {
      tokens: 0,
      row: current.row,
      error: new Error("Plus de jeton disponible aujourd'hui."),
      ok: false,
    };
  }

  const updated = await supabase
    .from("daily_tokens")
    .update({ used_tokens: current.row.used_tokens + 1 })
    .eq("id", current.row.id)
    .select("*")
    .single();

  if (updated.error) {
    return {
      tokens: current.tokens,
      row: current.row,
      error: updated.error,
      ok: false,
    };
  }

  return {
    tokens: countAvailableTokens(updated.data),
    row: updated.data,
    error: null,
    ok: true,
  };
}
