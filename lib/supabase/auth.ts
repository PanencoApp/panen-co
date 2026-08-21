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

export async function checkProfileAvailability({
  pseudo,
  email,
}: {
  pseudo: string;
  email: string;
}) {
  if (!supabase) {
    return {
      data: { pseudoAvailable: true, emailAvailable: true },
      error: null,
    };
  }

  const result = await supabase.rpc("check_profile_availability", {
    requested_email: email,
    requested_pseudo: pseudo,
  });

  if (result.error) {
    return {
      data: { pseudoAvailable: true, emailAvailable: true },
      error: result.error,
    };
  }

  const availability = Array.isArray(result.data)
    ? result.data[0]
    : result.data;

  return {
    data: {
      pseudoAvailable: availability?.pseudo_available !== false,
      emailAvailable: availability?.email_available !== false,
    },
    error: null,
  };
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

export async function sendPasswordResetEmail(email: string, redirectTo: string) {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configuré."),
    };
  }

  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
}

export async function updatePassword(password: string) {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase n'est pas encore configuré."),
    };
  }

  return supabase.auth.updateUser({ password });
}

export function listenForPasswordRecovery(onRecovery: () => void) {
  if (!supabase) return () => undefined;

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      onRecovery();
    }
  });

  return () => subscription.unsubscribe();
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
    .select("pseudo,email,is_admin")
    .eq("id", userId)
    .single();
}
