import { supabase } from "@/lib/supabase/client";

export type SignUpInput = {
  pseudo: string;
  email: string;
  password: string;
};

export async function signUpWithEmail({ pseudo, email, password }: SignUpInput) {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configure."),
    };
  }

  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { pseudo },
    },
  });
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configure."),
    };
  }

  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  if (!supabase) {
    return {
      data: { user: null },
      error: new Error("Supabase n'est pas encore configure."),
    };
  }

  return supabase.auth.getUser();
}

export async function getProfile(userId: string) {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configure."),
    };
  }

  return supabase
    .from("profiles")
    .select("pseudo,email")
    .eq("id", userId)
    .single();
}
