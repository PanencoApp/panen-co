import { supabase } from "@/lib/supabase/client";

export type AdminUserOverview = {
  completedPredictionCount: number;
  createdAt: string;
  email: string;
  emailConfirmed: boolean;
  id: string;
  isAdmin: boolean;
  lastActivityAt: string | null;
  monthlyPoints: number;
  predictionCount: number;
  pseudo: string;
  subscriptionStatus: string;
  subscriptionUntil: string | null;
  weeklyPoints: number;
};

export type AdminDashboard = {
  scores: {
    month: AdminUserOverview[];
    week: AdminUserOverview[];
  };
  summary: {
    activeSubscriptions: number;
    totalPredictions: number;
    totalUsers: number;
    verifiedEmails: number;
  };
  users: AdminUserOverview[];
};

async function getAuthToken() {
  if (!supabase) return null;

  const session = await supabase.auth.getSession();

  return session.data.session?.access_token ?? null;
}

export async function getAdminDashboard() {
  const token = await getAuthToken();

  if (!token) {
    return {
      data: null,
      error: new Error("Session admin introuvable."),
    };
  }

  const response = await fetch("/api/admin/dashboard", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | (AdminDashboard & { error?: string })
    | null;

  if (!response.ok || !payload) {
    return {
      data: null,
      error: new Error(payload?.error ?? "Impossible de charger l'admin."),
    };
  }

  return {
    data: payload,
    error: null,
  };
}
