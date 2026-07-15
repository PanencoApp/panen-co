"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultProfile,
  weeklyRank,
} from "@/lib/demo-data";
import {
  calculatePredictionScore,
  type MatchResult,
} from "@/lib/scoring";
import { Field } from "@/components/ui/Field";
import { Header } from "@/components/ui/Header";
import { Top50 } from "@/components/home/Top50";
import {
  checkProfileAvailability,
  getCurrentUser,
  getProfile,
  signInWithEmail,
  signOut,
  signUpWithEmail,
} from "@/lib/supabase/auth";
import {
  addAdToken,
  consumeDailyToken,
  getOrCreateDailyTokens,
} from "@/lib/supabase/tokens";
import {
  finishPredictionDemoInSupabase,
  getMyPredictions,
  savePrediction,
} from "@/lib/supabase/predictions";
import { getTodayMatches } from "@/lib/supabase/matches";
import {
  addWeeklyPoints,
  getWeeklyLeaderboard,
} from "@/lib/supabase/leaderboard";
import type {
  MatchOption,
  OnboardingStep,
  PlayerOption,
  PredictionPick,
  PredictionRecord,
  TopPlayer,
  UserProfile,
  View,
} from "@/types";

function parisDayKey(date: string | Date) {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).formatToParts(new Date(date));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

const exactScoreOptions = [
  {
    label: "Domicile",
    scores: ["1-0", "2-0", "2-1", "3-0", "3-1", "3-2", "4-0", "4-1", "4-2", "4-3"],
  },
  {
    label: "Nul",
    scores: ["0-0", "1-1", "2-2", "3-3", "4-4"],
  },
  {
    label: "Extérieur",
    scores: ["0-1", "0-2", "1-2", "0-3", "1-3", "2-3", "0-4", "1-4", "2-4", "3-4"],
  },
  {
    label: "Autre",
    scores: ["Autres"],
  },
];

function exactScoreLabel(score: string) {
  return score === "Autres" ? score : score.replace("-", " - ");
}

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(1);
  const [view, setView] = useState<View>("home");
  const [tokens, setTokens] = useState(1);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [dailyMatches, setDailyMatches] = useState<MatchOption[]>([]);
  const [matchPlayers, setMatchPlayers] = useState<PlayerOption[]>([]);
  const [challengePlayers, setChallengePlayers] = useState<PlayerOption[]>([]);
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [leaderboard, setLeaderboard] = useState<TopPlayer[]>([]);
  const [challengeMatch, setChallengeMatch] = useState("");
  const [challengeStep, setChallengeStep] = useState<
    "setup" | "predict" | "share" | "friend" | "result"
  >("setup");
  const [challengePick, setChallengePick] = useState<PredictionPick | null>(null);
  const [friendPick, setFriendPick] = useState<PredictionPick | null>(null);
  const [challengeStake, setChallengeStake] = useState("Un verre ce week-end");
  const [challengeFriendPseudo] = useState("Malo7");
  const [challengeCopied, setChallengeCopied] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>(defaultProfile);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [resultsSeenToday, setResultsSeenToday] = useState(false);

  const selected = useMemo(
    () => dailyMatches.find((match) => match.id === selectedMatch),
    [dailyMatches, selectedMatch],
  );
  const mainMatch = dailyMatches[0] ?? null;
  const selectedChallenge = useMemo(
    () =>
      dailyMatches.find((match) => match.id === challengeMatch) ??
      dailyMatches[0] ?? {
        id: "",
        label: "Aucun match disponible",
        time: "Aujourd'hui",
      },
    [challengeMatch, dailyMatches],
  );
  const challengeLink = `https://panen-co.app/defi/${challengeMatch.toUpperCase()}-AMICOD3`;
  const activePredictions = predictions.filter(
    (prediction) => prediction.status === "active",
  );
  const donePredictions = predictions.filter(
    (prediction) => prediction.status === "done",
  );
  const todayDonePredictions = donePredictions.filter((prediction) => {
    const referenceDate = prediction.matchDate ?? prediction.createdAt;
    return referenceDate ? parisDayKey(referenceDate) === parisDayKey(new Date()) : false;
  });
  const homeDonePredictions = resultsSeenToday ? [] : todayDonePredictions;
  const pastDonePredictions = donePredictions.filter((prediction) => {
    const referenceDate = prediction.matchDate ?? prediction.createdAt;
    return referenceDate ? parisDayKey(referenceDate) !== parisDayKey(new Date()) : false;
  });
  const visibleDonePredictions =
    todayDonePredictions.length > 0 ? todayDonePredictions : pastDonePredictions;
  const usedMatchIds = predictions.map((prediction) => prediction.matchId);
  const doneDayTotal = visibleDonePredictions.reduce(
    (sum, prediction) => sum + (prediction.score ?? 0),
    0,
  );
  const updatedWeeklyRank =
    leaderboard.find((player) => player.isCurrentUser)?.rank ?? weeklyRank;

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Panen&Co reste utilisable si le navigateur refuse le service worker.
    });
  }, []);

  async function loadPlayers(match: MatchOption | null) {
    if (!match?.homeTeamId || !match.awayTeamId) return [];

    try {
      const response = await fetch(
        `/api/match-players?homeTeamId=${match.homeTeamId}&awayTeamId=${match.awayTeamId}`,
      );
      const payload = (await response.json()) as { players?: PlayerOption[] };

      return payload.players ?? [];
    } catch {
      return [];
    }
  }

  useEffect(() => {
    let cancelled = false;

    loadPlayers(selected ?? null).then((players) => {
      if (!cancelled) setMatchPlayers(players);
    });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    let cancelled = false;

    loadPlayers(selectedChallenge).then((players) => {
      if (!cancelled) setChallengePlayers(players);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedChallenge]);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      setShowSplash(true);
      setSelectedMatch(null);
      setShowTokens(false);
      setShowProfile(false);

      try {
        const [result] = await Promise.all([
          getCurrentUser(),
          new Promise((resolve) => window.setTimeout(resolve, 1800)),
        ]);
        const user = result.data.user;

        if (!isMounted) return;

        if (!user) {
          setCurrentUserId(null);
          setTokens(1);
          setDailyMatches([]);
          setLeaderboard([]);
          setOnboardingStep(1);
          setView("home");
          return;
        }

        const profile = await getProfile(user.id);
        const email = profile.data?.email ?? user.email ?? defaultProfile.email;
        const pseudo =
          profile.data?.pseudo ??
          String(user.user_metadata?.pseudo || email.split("@")[0]);

        setUserProfile({
          pseudo,
          email,
          password: "********",
        });
        setCurrentUserId(user.id);
        const dailyTokens = await getOrCreateDailyTokens(user.id);
        if (isMounted) setTokens(dailyTokens.tokens);
        const todayMatches = await getTodayMatches();
        if (isMounted) {
          setDailyMatches(todayMatches.data);
          setChallengeMatch((current) =>
            todayMatches.data.some((match) => match.id === current)
              ? current
              : todayMatches.data[0]?.id ?? "",
          );
        }
        const savedPredictions = await getMyPredictions(user.id, todayMatches.data);
        if (isMounted) setPredictions(savedPredictions.data);
        const weeklyPlayers = await getWeeklyLeaderboard(user.id);
        if (isMounted) setLeaderboard(weeklyPlayers);
        const todayKey = parisDayKey(new Date());
        const hasPastDoneResults = savedPredictions.data.some((prediction) => {
          const referenceDate = prediction.matchDate ?? prediction.createdAt;
          return (
            prediction.status === "done" &&
            referenceDate &&
            parisDayKey(referenceDate) !== todayKey
          );
        });
        const seenResultsKey = `panen-co-results-seen-${todayKey}`;
        const hasSeenResultsToday = window.localStorage.getItem(seenResultsKey) === "yes";
        setResultsSeenToday(hasSeenResultsToday);
        setOnboardingStep("done");
        setView(
          hasPastDoneResults && !hasSeenResultsToday
            ? "prediction-done"
            : "home",
        );
      } finally {
        if (isMounted) setShowSplash(false);
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  function openMatches() {
    setSelectedMatch(null);
    setView("matches");
  }

  function startPrediction() {
    if (
      !selectedMatch ||
      !selected ||
      selected.isPredictable === false ||
      tokens <= 0 ||
      usedMatchIds.includes(selectedMatch)
    ) {
      if (tokens <= 0) setShowTokens(true);
      return;
    }

    setView("prediction-active");
  }

  function changeMatch() {
    setSelectedMatch(null);
    setView("matches");
  }

  async function submitPrediction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMatch || !selected) return;
    if (tokens <= 0) {
      setShowTokens(true);
      return;
    }

    const confirmed = window.confirm(
      "Tu es sûr de tes prédictions ? Une fois validées, elles seront verrouillées et 1 jeton sera utilisé.",
    );

    if (!confirmed) return;

    const form = new FormData(event.currentTarget);
    const pick: PredictionPick = {
      result: String(form.get("result")),
      scorer: String(form.get("scorer")),
      exactScore: String(form.get("exactScore")),
      firstTeam: String(form.get("firstTeam")),
      lastTeam: String(form.get("lastTeam")),
      goals: String(form.get("goals")),
    };
    const fallbackPrediction: PredictionRecord = {
      id: `${selectedMatch}-${Date.now()}`,
      matchId: selectedMatch,
      matchLabel: selected.label,
      matchTime: selected.time,
      matchDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      pick,
      status: "active",
    };

    let savedPrediction = fallbackPrediction;

    if (currentUserId) {
      const saved = await savePrediction({
        userId: currentUserId,
        match: selected,
        pick,
        matchOptions: dailyMatches,
      });

      if (saved.error || !saved.data) {
        window.alert(
          saved.error?.message.includes("duplicate key")
            ? "Tu as deja valide une prediction sur ce match."
            : (saved.error?.message ?? "Impossible d'enregistrer ta prediction."),
        );
        return;
      }

      const dailyTokens = await consumeDailyToken(currentUserId);
      setTokens(dailyTokens.tokens);

      if (!dailyTokens.ok) {
        setShowTokens(true);
        window.alert(
          dailyTokens.error?.message ??
            "Impossible d'utiliser ton jeton pour le moment.",
        );
        return;
      }

      savedPrediction = saved.data;
    } else {
      setTokens((value) => value - 1);
    }

    setPredictions((items) => [savedPrediction, ...items]);
    setSelectedMatch(null);
    setView("prediction-active");
  }

  const resolvePredictionResult = useCallback(async (id: string, options?: { silent?: boolean }) => {
    const prediction = predictions.find((item) => item.id === id);

    if (!prediction) return;

    if (!prediction.matchId.startsWith("api-football-")) {
      if (!options?.silent) {
        window.alert("Ce match ne vient pas de l'API, le résultat automatique est indisponible.");
      }
      return;
    }

    const fixtureId = prediction.matchId.replace("api-football-", "");
    const response = await fetch(`/api/match-result?fixtureId=${fixtureId}`);
    const payload = (await response.json()) as
      | { status: "finished"; result: MatchResult }
      | { status: "not_finished"; apiStatus?: string }
      | { status: "error"; message?: string };

    if (!response.ok || payload.status === "error") {
      if (!options?.silent) {
        window.alert(
          payload.status === "error"
            ? (payload.message ?? "Impossible de récupérer le résultat.")
            : "Impossible de récupérer le résultat.",
        );
      }
      return;
    }

    if (payload.status === "not_finished") {
      if (!options?.silent) {
        window.alert(
          "Ce match n'est pas encore terminé. Les points seront calculés après le coup de sifflet final.",
        );
      }
      return;
    }

    const scoring = calculatePredictionScore(prediction.pick, payload.result);

    if (currentUserId) {
      const saved = await finishPredictionDemoInSupabase({
        predictionId: id,
        score: scoring.total,
        scoreDetails: scoring.details,
        matchOptions: dailyMatches,
      });

      if (saved.error || !saved.data) {
        if (!options?.silent) {
          window.alert(
            saved.error?.message ?? "Impossible de terminer ce match pour le moment.",
          );
        }
        return;
      }

      const weeklyScore = await addWeeklyPoints({
        userId: currentUserId,
        pseudo: userProfile.pseudo,
        points: scoring.total,
      });

      if (weeklyScore.error && !options?.silent) {
        window.alert("Score valide, mais classement non mis a jour pour le moment.");
      }

      const weeklyPlayers = await getWeeklyLeaderboard(currentUserId);
      setLeaderboard(weeklyPlayers);
    }

    setPredictions((items) =>
      items.map((prediction) =>
        prediction.id === id
          ? {
              ...prediction,
              status: "done",
              score: scoring.total,
              scoreDetails: scoring.details,
              rank: weeklyRank,
            }
          : prediction,
      ),
    );
    setSelectedMatch(null);
    setView("prediction-done");
  }, [currentUserId, dailyMatches, predictions, userProfile.pseudo]);

  useEffect(() => {
    const pending = predictions.filter(
      (prediction) =>
        prediction.status === "active" &&
        prediction.matchId.startsWith("api-football-"),
    );

    if (!currentUserId || pending.length === 0) return;

    let cancelled = false;

    async function checkResults() {
      for (const prediction of pending) {
        if (cancelled) return;
        await resolvePredictionResult(prediction.id, { silent: true });
      }
    }

    checkResults();
    const interval = window.setInterval(checkResults, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentUserId, predictions, resolvePredictionResult]);

  function resetAfterResult() {
    window.localStorage.setItem(`panen-co-results-seen-${parisDayKey(new Date())}`, "yes");
    setResultsSeenToday(true);
    setView("home");
  }

  async function sharePredictionResults() {
    const text = `Panen&Co : ${doneDayTotal} point${doneDayTotal > 1 ? "s" : ""} récolté${doneDayTotal > 1 ? "s" : ""} aujourd'hui. Rang semaine : ${updatedWeeklyRank}.`;

    try {
      if (navigator.share) {
        await navigator.share({
          text,
          title: "Résultats Panen&Co",
        });
        return;
      }

      await navigator.clipboard.writeText(text);
      window.alert("Résultat copié, prêt à partager.");
    } catch {
      await navigator.clipboard.writeText(text);
      window.alert("Résultat copié, prêt à partager.");
    }
  }

  async function copyChallengeLink() {
    try {
      await navigator.clipboard.writeText(
        `${challengeLink} - ${challengeStake || "pour la gloire"}`,
      );
    } catch {
      // The demo still marks it copied if clipboard permissions are unavailable.
    }

    setChallengeCopied(true);
  }

  function readPickFromForm(form: HTMLFormElement): PredictionPick {
    const data = new FormData(form);

    return {
      result: String(data.get("result")),
      scorer: String(data.get("scorer")),
      exactScore: String(data.get("exactScore")),
      firstTeam: String(data.get("firstTeam")),
      lastTeam: String(data.get("lastTeam")),
      goals: String(data.get("goals")),
    };
  }

  function submitChallengePrediction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChallengePick(readPickFromForm(event.currentTarget));
    setFriendPick(null);
    setChallengeCopied(false);
    setChallengeStep("share");
  }

  function submitFriendPrediction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFriendPick(readPickFromForm(event.currentTarget));
    setChallengeStep("result");
  }

  function resetChallenge() {
    setChallengeMatch(dailyMatches[0]?.id ?? "");
    setChallengePick(null);
    setFriendPick(null);
    setChallengeStake("Un verre ce week-end");
    setChallengeCopied(false);
    setChallengeStep("setup");
  }

  async function completeOnboarding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pseudo = String(form.get("pseudo") || defaultProfile.pseudo);
    const email = String(form.get("email") || defaultProfile.email);
    const password = String(form.get("password") || defaultProfile.password);

    setAuthBusy(true);

    try {
      const availability = await checkProfileAvailability({ pseudo, email });

      if (!availability.data.pseudoAvailable) {
        window.alert("Ce pseudo est deja utilise. Choisis-en un autre.");
        return;
      }

      if (!availability.data.emailAvailable) {
        window.alert("Cette adresse email est deja utilisee. Connecte-toi plutot.");
        return;
      }

      const result = await signUpWithEmail({ pseudo, email, password });

      if (result.error) {
        window.alert(
          result.error.message.toLowerCase().includes("already")
            ? "Ce pseudo ou cet email est deja utilise."
            : result.error.message,
        );
        return;
      }

      setUserProfile({ pseudo, email, password });
      setCurrentUserId(result.data.session ? (result.data.user?.id ?? null) : null);
      const todayMatches = await getTodayMatches();
      setDailyMatches(todayMatches.data);
      setChallengeMatch(todayMatches.data[0]?.id ?? "");
      if (result.data.user && result.data.session) {
        const dailyTokens = await getOrCreateDailyTokens(result.data.user.id);
        setTokens(dailyTokens.tokens);
        const savedPredictions = await getMyPredictions(
          result.data.user.id,
          todayMatches.data,
        );
        setPredictions(savedPredictions.data);
        const weeklyPlayers = await getWeeklyLeaderboard(result.data.user.id);
        setLeaderboard(weeklyPlayers);
      } else {
        setTokens(1);
        setPredictions([]);
        const weeklyPlayers = await getWeeklyLeaderboard(null);
        setLeaderboard(weeklyPlayers);
      }
      setOnboardingStep("done");
      setView("home");
    } finally {
      setAuthBusy(false);
    }
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || defaultProfile.email);
    const password = String(form.get("password") || defaultProfile.password);

    setAuthBusy(true);

    try {
      const result = await signInWithEmail(email, password);

      if (result.error || !result.data.user) {
        window.alert(result.error?.message ?? "Connexion impossible.");
        return;
      }

      const profile = await getProfile(result.data.user.id);
      const pseudo =
        profile.data?.pseudo ??
        String(result.data.user.user_metadata?.pseudo || email.split("@")[0]);

      setUserProfile({
        pseudo,
        email: profile.data?.email ?? email,
        password,
      });
      setCurrentUserId(result.data.user.id);
      const dailyTokens = await getOrCreateDailyTokens(result.data.user.id);
      setTokens(dailyTokens.tokens);
      const todayMatches = await getTodayMatches();
      setDailyMatches(todayMatches.data);
      setChallengeMatch((current) =>
        todayMatches.data.some((match) => match.id === current)
          ? current
          : todayMatches.data[0]?.id ?? "",
      );
      const savedPredictions = await getMyPredictions(
        result.data.user.id,
        todayMatches.data,
      );
      setPredictions(savedPredictions.data);
      const weeklyPlayers = await getWeeklyLeaderboard(result.data.user.id);
      setLeaderboard(weeklyPlayers);
      setOnboardingStep("done");
      setView("home");
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    await signOut();
    setShowProfile(false);
    setCurrentUserId(null);
    setTokens(1);
    setPredictions([]);
    setLeaderboard([]);
    setOnboardingStep("login");
    setView("home");
  }

  if (showSplash) {
    return <SplashScreen />;
  }

  if (onboardingStep !== "done") {
    if (onboardingStep === "login") {
      return (
        <LoginScreen
          isBusy={authBusy}
          onLogin={login}
          onRegister={() => setOnboardingStep(2)}
        />
      );
    }

    if (onboardingStep === "conditions") {
      return <OnboardingConditions onBack={() => setOnboardingStep(2)} />;
    }

    return (
      <Onboarding
        isBusy={authBusy}
        onComplete={completeOnboarding}
        onConditions={() => setOnboardingStep("conditions")}
        onLogin={() => setOnboardingStep("login")}
        onNext={() => setOnboardingStep(2)}
        step={onboardingStep}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#eef3f8] text-[#0b0f19]">
      <div className="mx-auto min-h-screen w-full max-w-[500px] px-4 pb-12 pt-5">
        {view === "home" && (
          <section className="space-y-4">
            <header className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <h1 className="text-[2rem] font-black leading-tight tracking-tight">
                  Bonjour {userProfile.pseudo}
                </h1>
              </div>
              <button
                className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-[0_12px_30px_rgba(15,23,42,.10)]"
                onClick={() => setShowProfile(true)}
                type="button"
                aria-label="Menu"
              >
                <span className="grid gap-1.5">
                  <span className="block h-0.5 w-6 rounded-full bg-[#0b0f19]" />
                  <span className="block h-0.5 w-6 rounded-full bg-[#0b0f19]" />
                  <span className="block h-0.5 w-6 rounded-full bg-[#0b0f19]" />
                </span>
              </button>
            </header>

            <section className="rounded-2xl border border-[#d9e1ea] bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,.10)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-[#4e596b]">
                    Mes jetons
                  </p>
                  <strong className="text-4xl text-[#00baff]">{tokens}</strong>
                  <p className="mt-1 text-xs font-bold text-[#5f6b7f]">
                    1 jeton gratuit par jour · non accumulable
                  </p>
                </div>
                <button
                  className="rounded-xl bg-[#00baff] px-4 py-3 text-sm font-black text-black"
                  onClick={() => setShowTokens(true)}
                  type="button"
                >
                  + de jetons
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[#d9e1ea] pt-3">
                <span className="text-xs font-black uppercase text-[#5f6b7f]">
                  Gains
                </span>
                <b>0 &euro;</b>
                <button
                  className="rounded-full border border-[#d8e2ea] px-3 py-1 text-xs font-black"
                  type="button"
                >
                  Retirer
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-[#d9e1ea] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,.10)]">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-[#00baff] text-3xl shadow-[0_0_26px_rgba(0,186,255,.22)]">
                ⚽
              </div>
              <h1 className="text-center text-2xl font-black uppercase">
                Matchs du jour
              </h1>
              <p className="mt-2 text-center text-sm leading-6 text-[#4e596b]">
                Place tes pr&eacute;dictions en quelques clics pour monter au
                classement de la semaine.
              </p>
              <div
                className={
                  (activePredictions.length > 0
                    ? "border-[#00baff]/70 bg-[#00baff]/10 text-[#00baff]"
                    : homeDonePredictions.length > 0
                      ? "border-green-400/60 bg-green-400/10 text-green-300"
                    : "border-[#d9e1ea] bg-white text-[#4e596b]") +
                  " my-4 rounded-2xl border px-3 py-3 text-sm font-black"
                }
              >
                {activePredictions.length > 0
                  ? `${activePredictions.length} pr\u00e9diction${activePredictions.length > 1 ? "s" : ""} en cours`
                  : homeDonePredictions.length > 0
                    ? `${homeDonePredictions.length} pr\u00e9diction${homeDonePredictions.length > 1 ? "s" : ""} termin\u00e9e${homeDonePredictions.length > 1 ? "s" : ""}`
                    : mainMatch
                      ? <HomeMatchPreview match={mainMatch} matchCount={dailyMatches.length} />
                      : "Match principal bient\u00f4t disponible"}
              </div>
              <button
                className="h-13 w-full rounded-2xl bg-[#00baff] font-black uppercase text-black shadow-[0_0_26px_rgba(0,186,255,.22)]"
                onClick={openMatches}
                type="button"
              >
                Gagner des points
              </button>
              {activePredictions.length > 0 && (
                <button
                  className="mt-3 h-12 w-full rounded-2xl border border-[#00baff] font-black uppercase text-[#00baff]"
                  onClick={() => setView("prediction-active")}
                  type="button"
                >
                  Voir mes pr&eacute;dictions
                </button>
              )}
              {activePredictions.length === 0 && homeDonePredictions.length > 0 && (
                <button
                  className="mt-3 h-12 w-full rounded-2xl border border-green-400 font-black uppercase text-green-300"
                  onClick={() => setView("prediction-done")}
                  type="button"
                >
                  Voir mes r&eacute;sultats
                </button>
              )}
            </section>

            <Top50 players={leaderboard} />

            <section className="rounded-3xl border border-[#d9e1ea] bg-white p-5 text-center">
              <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-3xl border border-[#00baff] bg-[#eefaff] shadow-[0_0_26px_rgba(0,186,255,.16)]">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
                  <span className="h-3 w-3 rounded-full bg-[#00baff]" />
                  <span className="text-sm font-black text-[#0b0f19]">VS</span>
                  <span className="h-3 w-3 rounded-full bg-[#0b0f19]" />
                </div>
              </div>
              <h2 className="text-xl font-black uppercase">D&eacute;fier un ami</h2>
              <p className="mt-2 text-sm text-[#4e596b]">
                Montre que c&apos;est toi le plus grand connaisseur de football.
              </p>
              <div
                className={
                  (challengeStep === "result"
                    ? "border-green-400/60 bg-green-400/10 text-green-700"
                    : challengeStep === "setup"
                      ? "border-[#d9e1ea] bg-[#eef3f8] text-[#4e596b]"
                      : "border-[#00baff]/70 bg-[#00baff]/10 text-[#00baff]") +
                  " mt-4 rounded-2xl border px-3 py-3 text-sm font-black"
                }
              >
                {challengeStep === "result"
                  ? "D\u00e9fi termin\u00e9"
                  : challengeStep === "setup"
                    ? mainMatch
                      ? <HomeMatchPreview match={mainMatch} matchCount={dailyMatches.length} />
                      : "Match principal bient\u00f4t disponible"
                    : "D\u00e9fi en cours"}
              </div>
              <button
                className="mt-4 h-12 w-full rounded-2xl border border-[#00baff] font-black uppercase text-[#00baff]"
                onClick={() => setView("challenge")}
                type="button"
              >
                {challengeStep === "result"
                  ? "Voir le d\u00e9fi termin\u00e9"
                  : challengeStep !== "setup"
                    ? "Voir le d\u00e9fi en cours"
                    : "Lancer un d\u00e9fi"}
              </button>
            </section>
          </section>
        )}

        {view === "matches" && (
          <section className="space-y-4">
            <Header
              title="Matchs du jour"
              subtitle="1 match = 1 jeton"
              right={`${tokens} jeton${tokens > 1 ? "s" : ""}`}
              onBack={() => setView("home")}
            />

            {!selectedMatch && (
              <section className="rounded-3xl border border-[#d9e1ea] bg-white p-4">
                <h1 className="text-2xl font-black">Choisis un match.</h1>
                <p className="mt-2 text-sm leading-6 text-[#4e596b]">
                  Tu peux pr&eacute;dire plusieurs matchs du jour si tu as assez
                  de jetons. Le jeton est utilis&eacute; uniquement quand tu
                  valides ta grille.
                </p>
                {dailyMatches.length > 0 ? (
                  <div className="mt-4 grid gap-2">
                    {dailyMatches.map((match) => {
                      const used = usedMatchIds.includes(match.id);
                      const locked = used || match.isPredictable === false;

                      return (
                        <button
                          className={
                            (locked
                              ? "cursor-not-allowed border-[#d9e1ea] bg-[#f7f9fc] opacity-40 grayscale"
                              : "border-[#d9e1ea] bg-white") +
                            " grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border p-3 text-left"
                          }
                          disabled={locked}
                          key={match.id}
                          onClick={() => setSelectedMatch(match.id)}
                          type="button"
                        >
                          <MatchLogos match={match} />
                          <span>
                            <strong className="block">{match.label}</strong>
                            <small className="text-[#5f6b7f]">{match.time}</small>
                          </span>
                          <b className="max-w-[136px] text-right text-xs leading-4 text-[#00baff] sm:max-w-[180px]">
                            {used
                              ? "Prédictions déjà effectuées."
                              : match.isPredictable === false
                                ? "Prédictions clôturées, le match est en cours ou terminé"
                                : "1 jeton"}
                          </b>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-[#d9e1ea] bg-[#f6f8fb] p-4 text-sm font-bold leading-6 text-[#4e596b]">
                    Aucun match API disponible pour le moment. Recharge dans
                    quelques minutes ou reviens plus tard dans la journ&eacute;e.
                  </div>
                )}
              </section>
            )}

            {selectedMatch && (
              <section className="rounded-3xl border border-[#d9e1ea] bg-white p-4">
                <button
                  className="mb-3 rounded-xl border border-[#00baff]/50 px-3 py-2 text-sm font-black text-[#00baff]"
                  onClick={changeMatch}
                  type="button"
                >
                  &larr; Changer de match
                </button>
                <p className="text-xs font-black uppercase text-[#00baff]">
                  Match s&eacute;lectionn&eacute;
                </p>
                <h2 className="mt-1 text-xl font-black">{selected?.label}</h2>
                <p className="mt-1 text-sm text-[#5f6b7f]">
                  {selected?.time} · pr&eacute;dictions ouvertes
                </p>
                <button
                  className="mt-4 h-12 w-full rounded-2xl bg-[#00baff] font-black uppercase text-black"
                  onClick={startPrediction}
                  type="button"
                >
                  Pr&eacute;dire sur ce match
                </button>
              </section>
            )}
          </section>
        )}

        {view === "prediction-active" && (
          <section className="space-y-4">
            <Header
              title={"Pr\u00e9dictions en cours"}
              subtitle={`${activePredictions.length} match${activePredictions.length > 1 ? "s" : ""} non termin\u00e9${activePredictions.length > 1 ? "s" : ""}`}
              right={`${tokens} jeton${tokens > 1 ? "s" : ""}`}
              onBack={() => setView("home")}
            />
            {!selectedMatch && (
              <section className="rounded-3xl border border-[#00baff]/60 bg-[#00baff]/10 p-5 shadow-[0_0_34px_rgba(0,186,255,.16)]">
                <div className="mb-4 inline-flex rounded-full border border-[#00baff]/60 bg-[#eef3f8] px-4 py-2 text-xs font-black uppercase tracking-wide text-[#00baff] shadow-[0_0_20px_rgba(0,186,255,.25)]">
                  Suivi live
                </div>
                <h1 className="text-2xl font-black">
                  {activePredictions.length > 0
                    ? `${activePredictions.length} pr\u00e9diction${activePredictions.length > 1 ? "s" : ""} en cours`
                    : "Nouvelle pr\u00e9diction"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-[#4e596b]">
                  Tu peux revenir &agrave; l&apos;accueil, rejouer un autre match si tu
                  as des jetons, et suivre toutes tes grilles ici.
                </p>
                <button
                  className="mt-4 h-12 w-full rounded-2xl border border-[#00baff] font-black uppercase text-[#00baff]"
                  onClick={() => setView("home")}
                  type="button"
                >
                  Retour &agrave; l&apos;accueil
                </button>
              </section>
            )}

            {selectedMatch && selected ? (
              <PredictionForm
                match={selected.label}
                matchOption={selected}
                onBack={changeMatch}
                onSubmit={submitPrediction}
                players={matchPlayers}
              />
            ) : activePredictions.length > 0 ? (
              <div className="grid gap-3">
                {activePredictions.map((prediction) => (
                  <SubmittedPredictionCard
                    key={prediction.id}
                    prediction={prediction}
                  />
                ))}
                {tokens > 0 && (
                  <button
                    className="h-12 rounded-2xl bg-[#00baff] font-black uppercase text-black"
                    onClick={openMatches}
                    type="button"
                  >
                    Ajouter une pr&eacute;diction
                  </button>
                )}
              </div>
            ) : (
              <section className="rounded-3xl border border-[#d9e1ea] bg-white p-5 text-center">
                <p className="text-sm font-bold text-[#4e596b]">
                  Aucune pr&eacute;diction en cours pour le moment.
                </p>
                <button
                  className="mt-4 h-12 w-full rounded-2xl bg-[#00baff] font-black uppercase text-black"
                  onClick={openMatches}
                  type="button"
                >
                  Choisir un match
                </button>
              </section>
            )}
          </section>
        )}

        {view === "prediction-done" && (
          <section className="space-y-4">
            <Header
              title={"Pr\u00e9dictions termin\u00e9es"}
              subtitle={"Classement actualis\u00e9"}
              right={`${tokens} jeton${tokens > 1 ? "s" : ""}`}
              onBack={() => setView("home")}
            />
            <section className="rounded-3xl border border-green-400/60 bg-green-400/10 p-5 text-center shadow-[0_0_34px_rgba(74,222,128,.16)]">
              <p className="text-xs font-black uppercase text-green-300">
                R&eacute;sultats valid&eacute;s
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#d9e1ea] bg-[#eef3f8] p-4">
                  <span className="text-xs font-black uppercase text-[#5f6b7f]">
                    Total journée
                  </span>
                  <strong className="mt-2 block text-5xl font-black text-[#00baff] drop-shadow-[0_0_18px_rgba(0,186,255,.65)]">
                    {doneDayTotal}
                  </strong>
                </div>
                <div className="rounded-2xl border border-[#d9e1ea] bg-[#eef3f8] p-4">
                  <span className="text-xs font-black uppercase text-[#5f6b7f]">
                    Rang semaine
                  </span>
                  <strong className="mt-2 block text-5xl font-black text-[#00baff] drop-shadow-[0_0_18px_rgba(0,186,255,.65)]">
                    {updatedWeeklyRank}
                  </strong>
                </div>
              </div>
              <p className="mt-4 rounded-2xl border border-[#d9e1ea] bg-[#eef3f8] p-3 text-sm font-bold text-[#4e596b]">
                Tes scores sont ajout&eacute;s au classement hebdomadaire. Le
                Top 50 se relance chaque dimanche &agrave; minuit.
              </p>
            </section>

            <div className="grid gap-3">
              {visibleDonePredictions.map((prediction) => (
                <ResultPredictionCard
                  key={prediction.id}
                  prediction={prediction}
                />
              ))}
            </div>

            <button
              className="h-12 w-full rounded-2xl bg-[#00baff] font-black uppercase text-black"
              onClick={sharePredictionResults}
              type="button"
            >
              Partager
            </button>

            <button
              className="h-12 w-full rounded-2xl border border-[#d9e1ea] bg-white font-black uppercase text-[#101522]"
              onClick={resetAfterResult}
              type="button"
            >
              Retour accueil
            </button>
            <Top50 players={leaderboard} />
          </section>
        )}

        {view === "challenge" && (
          <section className="space-y-4">
            <Header
              title={"D\u00e9fi gratuit"}
              subtitle={"5 matchs du jour · sans jeton"}
              right={`${tokens} jeton${tokens > 1 ? "s" : ""}`}
              onBack={() => setView("home")}
            />

            {challengeStep === "setup" && (
              <section className="rounded-3xl border border-[#d9e1ea] bg-white p-5">
                <h2 className="text-xl font-black">Choisis le match</h2>
                <div className="mt-3 grid gap-2">
                  {dailyMatches.map((match) => (
                    <button
                      className={
                        (challengeMatch === match.id
                          ? "border-[#00baff] bg-[#00baff]/10"
                          : "border-[#d9e1ea] bg-[#eef3f8]") +
                        " grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl border p-3 text-left"
                      }
                      key={match.id}
                      onClick={() => {
                        setChallengeMatch(match.id);
                        setChallengeCopied(false);
                      }}
                      type="button"
                    >
                      <MatchLogos match={match} />
                      <span>
                        <strong className="block">{match.label}</strong>
                        <small className="font-bold text-[#5f6b7f]">
                          {match.time}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                <label className="mt-4 block">
                  <span className="text-sm font-black text-[#4e596b]">
                    Enjeu amical
                  </span>
                  <input
                    className="input mt-2"
                    maxLength={80}
                    onChange={(event) => setChallengeStake(event.target.value)}
                    placeholder="Ex : un verre ce week-end, un grec dans la semaine"
                    value={challengeStake}
                  />
                </label>
                <button
                  className="mt-4 h-12 w-full rounded-2xl bg-[#00baff] font-black uppercase text-black"
                  onClick={() => setChallengeStep("predict")}
                  type="button"
                >
                  Poser mes predictions
                </button>
              </section>
            )}

            {challengeStep === "predict" && (
              <ChallengePredictionForm
                match={selectedChallenge.label}
                matchOption={selectedChallenge}
                onBack={() => setChallengeStep("setup")}
                onSubmit={submitChallengePrediction}
                players={challengePlayers}
                submitLabel="Generer mon lien"
                title="Mes predictions"
              />
            )}

            {challengeStep === "share" && challengePick && (
              <ChallengeInProgressCard
                challengeLink={challengeLink}
                copied={challengeCopied}
                friendPick={friendPick}
                friendPseudo={challengeFriendPseudo}
                matchLabel={selectedChallenge.label}
                onCopy={copyChallengeLink}
                onOpenFriend={() => setChallengeStep("friend")}
                playerPick={challengePick}
              />
            )}

            {challengeStep === "friend" && challengePick && (
              <section className="space-y-4">
                <ChallengeInProgressCard
                  challengeLink={challengeLink}
                  copied={challengeCopied}
                  friendPick={friendPick}
                  friendPseudo={challengeFriendPseudo}
                  matchLabel={selectedChallenge.label}
                  onCopy={copyChallengeLink}
                  playerPick={challengePick}
                />
                <ChallengePredictionForm
                  match={selectedChallenge.label}
                  matchOption={selectedChallenge}
                  onBack={() => setChallengeStep("share")}
                  onSubmit={submitFriendPrediction}
                  players={challengePlayers}
                  submitLabel="Valider les predictions ami"
                  title={`Predictions de ${challengeFriendPseudo}`}
                />
              </section>
            )}

            {challengeStep === "result" && challengePick && friendPick && (
              <ChallengeResultCard
                friendPick={friendPick}
                friendPseudo={challengeFriendPseudo}
                matchLabel={selectedChallenge.label}
                onReset={resetChallenge}
                playerPick={challengePick}
                stake={challengeStake}
              />
            )}
          </section>
        )}
      </div>

      {showTokens && (
        <TokenModal
          onAd={async () => {
            if (currentUserId) {
              const dailyTokens = await addAdToken(currentUserId);
              setTokens(dailyTokens.tokens);
            } else {
              setTokens((value) => value + 1);
            }
            setShowTokens(false);
          }}
          onClose={() => setShowTokens(false)}
        />
      )}
      {showProfile && (
        <ProfileDrawer
          onClose={() => setShowProfile(false)}
          onLogout={logout}
          predictions={predictions}
          userProfile={userProfile}
        />
      )}
    </main>
  );
}

function SplashScreen() {
  return (
    <main className="flex h-screen flex-col items-center justify-center overflow-hidden bg-black px-8 text-white">
      <div className="grid flex-1 place-items-center pb-32">
        <div className="grid h-28 w-[245px] place-items-center bg-black">
          <Image
            alt="Panen&Co"
            className="h-auto w-full animate-[splash-fade_1.2s_ease-out_forwards] object-contain opacity-0"
            height={112}
            priority
            src="/panen-co-big-logo.png"
            width={245}
            unoptimized
          />
        </div>
      </div>
      <div className="mb-10 h-1.5 w-full max-w-[380px] overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-full origin-left animate-[splash-load_1.8s_ease-out_forwards] rounded-full bg-[#00baff]" />
      </div>
    </main>
  );
}

function MatchLogos({ match }: { match: MatchOption }) {
  const logos = [
    { alt: "Equipe domicile", src: match.homeLogo },
    { alt: "Equipe exterieure", src: match.awayLogo },
  ];

  return (
    <span className="flex w-14 items-center">
      {logos.map((logo, index) => (
        <span
          className={
            (index === 1 ? "-ml-2" : "") +
            " grid h-9 w-9 place-items-center overflow-hidden rounded-full border-2 border-white bg-[#eef3f8] shadow-[0_6px_16px_rgba(15,23,42,.10)]"
          }
          key={`${match.id}-${index}`}
        >
          {logo.src ? (
            <Image
              alt={logo.alt}
              className="h-7 w-7 object-contain"
              height={28}
              src={logo.src}
              unoptimized
              width={28}
            />
          ) : (
            <span className="text-xs font-black text-[#00baff]">
              {index === 0 ? "D" : "E"}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

function HomeMatchPreview({
  match,
  matchCount,
}: {
  match: MatchOption;
  matchCount: number;
}) {
  const otherMatches = Math.max(0, matchCount - 1);

  return (
    <span className="flex items-center justify-center gap-3 text-left">
      <MatchLogos match={match} />
      <span>
        <span className="block text-[#0b0f19]">{match.label}</span>
        {otherMatches > 0 && (
          <small className="mt-0.5 block text-[11px] font-black text-[#697386]">
            + {otherMatches} autres
          </small>
        )}
      </span>
    </span>
  );
}

function Onboarding({
  step,
  isBusy,
  onNext,
  onLogin,
  onConditions,
  onComplete,
}: {
  step: 1 | 2;
  isBusy: boolean;
  onNext: () => void;
  onLogin: () => void;
  onConditions: () => void;
  onComplete: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const isIntro = step === 1;

  return (
    <main
      className={
        isIntro
          ? "h-screen overflow-hidden bg-black text-white"
          : "h-screen overflow-hidden bg-[#eef3f8] text-[#0b0f19]"
      }
    >
      <div className="mx-auto flex h-full w-full max-w-[500px] flex-col gap-5 px-5 py-4">
        {step === 1 ? (
          <section className="relative flex flex-1 flex-col items-center justify-center text-center">
            <div className="pointer-events-none absolute -left-16 top-12 h-36 w-24 rotate-[-18deg] rounded-[40%] border border-white/[.06] bg-white/[.025] blur-[2px]" />
            <div className="pointer-events-none absolute -right-20 top-32 h-40 w-32 rotate-[18deg] rounded-[35%] border border-white/[.06] bg-white/[.03] blur-[2px]" />
            <div className="pointer-events-none absolute bottom-20 left-2 h-28 w-24 rotate-[22deg] rounded-[2rem] border border-[#00baff]/10 bg-[#00baff]/[.04] blur-[3px]" />

            <div className="grid justify-items-center">
              <h1 className="bg-gradient-to-r from-white via-[#dcecff] to-[#00baff] bg-clip-text text-[3rem] font-black leading-[1.02] text-transparent">
                Pr&eacute;dire. Grimper. R&eacute;colter.
              </h1>
              <p className="mt-5 max-w-[330px] text-sm font-bold leading-5 text-white">
                Rejoignez plus de 500 passionn&eacute;s chaque jour,
                int&eacute;grez le Top 100 mondial et d&eacute;bloquez les
                r&eacute;compenses de la semaine.
              </p>

              <div className="mt-7 rounded-full border border-white/10 bg-white/[.05] px-6 py-3 shadow-[0_0_32px_rgba(0,186,255,.12)]">
                <div className="flex items-center justify-center gap-1 text-xl text-[#ffc66d]">
                  <span>&#9733;</span>
                  <span>&#9733;</span>
                  <span>&#9733;</span>
                  <span>&#9733;</span>
                  <span>&#9733;</span>
                </div>
                <p className="mt-1 text-sm font-black text-white">
                  4.8/5
                </p>
              </div>
            </div>
          </section>
        ) : (
          <form className="grid flex-1 content-center gap-3" onSubmit={onComplete}>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#00baff]">
                Inscription
              </p>
              <h1 className="mt-2 text-3xl font-black leading-tight">
                Cree ton profil en quelques secondes.
              </h1>
            </div>

            <div className="grid gap-3">
              <input
                className="input"
                name="pseudo"
                placeholder="Pseudo"
                required
                type="text"
              />
              <input
                className="input"
                name="email"
                placeholder="Email"
                required
                type="email"
              />
              <input
                className="input"
                minLength={6}
                name="password"
                placeholder="Mot de passe"
                required
                type="password"
              />
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-[#d9e1ea] bg-white p-3 text-xs font-bold leading-5 text-[#4e596b]">
              <input className="mt-1 accent-[#00baff]" required type="checkbox" />
              <span>
                Je confirme avoir +18 ans et accepter les{" "}
                <button
                  className="font-black text-[#00baff]"
                  onClick={onConditions}
                  type="button"
                >
                  conditions de participation
                </button>
                .
              </span>
            </label>

            <button
              className="text-sm font-black text-[#00baff]"
              onClick={onLogin}
              type="button"
            >
              Deja inscrit ? Connecte-toi
            </button>
          </form>
        )}

        <footer className="grid gap-3 pb-3">
          {step === 1 ? (
            <>
              <button
                className="h-14 rounded-full bg-[#00baff] font-black text-black shadow-[0_0_28px_rgba(0,186,255,.35)]"
                onClick={onNext}
                type="button"
              >
                Commencer
              </button>
              <button
                className="text-sm font-black text-white/80"
                onClick={onLogin}
                type="button"
              >
                J&apos;ai deja un compte
              </button>
            </>
          ) : (
            <button
              className="h-13 rounded-2xl bg-[#00baff] font-black uppercase text-black shadow-[0_0_26px_rgba(0,186,255,.22)] disabled:opacity-50"
              disabled={isBusy}
              formNoValidate={false}
              onClick={() => {
                const form = document.querySelector("form");
                form?.requestSubmit();
              }}
              type="button"
            >
              {isBusy ? "Creation..." : "Rejoindre l'arene"}
            </button>
          )}
          <div className="mx-auto flex gap-2">
            <span
              className={
                (step === 1 ? "bg-[#00baff]" : "bg-[#cfd8e3]") +
                " h-1.5 w-8 rounded-full"
              }
            />
            <span
              className={
                (step === 2 ? "bg-[#00baff]" : "bg-white/20") +
                " h-1.5 w-8 rounded-full"
              }
            />
          </div>
        </footer>
      </div>
    </main>
  );
}

function OnboardingConditions({ onBack }: { onBack: () => void }) {
  return (
    <main className="min-h-screen bg-[#eef3f8] text-[#0b0f19]">
      <div className="mx-auto flex min-h-screen w-full max-w-[500px] flex-col px-5 py-5">
        <header className="flex items-center justify-between">
          <button
            className="h-11 rounded-2xl border border-[#d9e1ea] bg-white px-4 font-black"
            onClick={onBack}
            type="button"
          >
            &larr; Retour
          </button>
          <span className="text-xs font-black uppercase text-[#7c8799]">
            Centre d&apos;aide
          </span>
        </header>

        <section className="mt-5 grid gap-4">
          <div className="rounded-[2rem] border border-[#d9e1ea] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,.10)]">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#00baff]">
              Conditions
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight">
              Conditions de participation
            </h1>
            <p className="mt-3 text-sm font-bold leading-6 text-[#4e596b]">
              Panen&Co est une exp&eacute;rience free-to-play r&eacute;serv&eacute;e
              aux utilisateurs majeurs. Les jetons permettent de participer aux
              pr&eacute;dictions du jour et ne sont pas cumulables.
            </p>
          </div>

          <InfoBlock
            title="Regles"
            text="Chaque prediction peut rapporter jusqu'a 9 points selon le resultat, le buteur, le score exact et les evenements du match."
          />
          <InfoBlock
            title="Classement"
            text="Le classement hebdomadaire recompense les meilleurs joueurs selon les paliers annonces dans le Top 50."
          />
          <InfoBlock
            title="Aide"
            text="Pour toute demande, le centre d'aide repond sous 24h depuis l'espace profil."
          />
        </section>

      </div>
    </main>
  );
}

function LoginScreen({
  isBusy,
  onLogin,
  onRegister,
}: {
  isBusy: boolean;
  onLogin: (event: React.FormEvent<HTMLFormElement>) => void;
  onRegister: () => void;
}) {
  return (
    <main className="min-h-screen bg-[#eef3f8] text-[#05070d]">
      <div className="mx-auto flex min-h-screen w-full max-w-[500px] flex-col justify-center px-5 py-8">
        <section className="rounded-[2rem] border border-[#d9e1ea] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,.1)]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#00baff]">
            Panen&Co
          </p>
          <h1 className="mt-3 text-3xl font-black leading-tight">
            Connexion
          </h1>
          <p className="mt-2 text-sm font-bold leading-6 text-[#4e596b]">
            Retrouve tes jetons, tes predictions et ton classement.
          </p>
          <form className="mt-5 grid gap-3" onSubmit={onLogin}>
          <input
            className="input"
            name="email"
            placeholder="Email"
            required
            type="email"
          />
          <input
            className="input"
            name="password"
            placeholder="Mot de passe"
            required
            type="password"
            />
            <button
              className="mt-2 h-12 rounded-2xl bg-[#00baff] font-black uppercase text-black disabled:opacity-50"
              disabled={isBusy}
            >
              {isBusy ? "Connexion..." : "Se connecter"}
            </button>
          </form>
          <button
            className="mt-4 w-full text-sm font-black text-[#00baff]"
            onClick={onRegister}
            type="button"
          >
            Pas encore inscrit ? Creer un compte
          </button>
        </section>
      </div>
    </main>
  );
}

const fallbackScorers = [
  "Kylian Mbappé",
  "Vinícius Júnior",
  "Jude Bellingham",
  "Harry Kane",
  "Erling Haaland",
  "Aucun buteur",
];

function ScorerField({ players }: { players: PlayerOption[] }) {
  const options =
    players.length > 0
      ? [
          ...players.map((player) => player.name),
          "Aucun buteur",
          "Autre buteur",
        ]
      : fallbackScorers;
  const featuredPlayers = players.slice(0, 6);

  return (
    <Field label="Buteur" points="2 pts">
      {featuredPlayers.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {featuredPlayers.map((player) => (
            <div
              className="rounded-2xl border border-[#d9e1ea] bg-[#eef3f8] p-2 text-center"
              key={player.id}
            >
              {player.photo ? (
                <Image
                  alt={player.name}
                  className="mx-auto h-12 w-12 rounded-full object-cover"
                  height={48}
                  src={player.photo}
                  unoptimized
                  width={48}
                />
              ) : (
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-xs font-black text-[#00baff]">
                  {player.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="mt-2 block truncate text-[11px] font-black text-[#0b0f19]">
                {player.name}
              </span>
            </div>
          ))}
        </div>
      )}
      <select className="input" defaultValue={options[0]} name="scorer">
        {options.map((scorer) => (
          <option key={scorer}>{scorer}</option>
        ))}
      </select>
    </Field>
  );
}

function PredictionForm({
  match,
  matchOption,
  players,
  onBack,
  onSubmit,
}: {
  match: string;
  matchOption: MatchOption;
  players: PlayerOption[];
  onBack: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="rounded-3xl border border-[#d9e1ea] bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,.10)]">
      <button
        className="mb-3 rounded-xl border border-[#00baff]/50 px-3 py-2 text-sm font-black text-[#00baff]"
        onClick={onBack}
        type="button"
      >
        &larr; Changer de match
      </button>
      <div className="mb-4">
        <p className="text-xs font-black uppercase text-[#00baff]">
          Pr&eacute;dictions ouvertes
        </p>
        <h2 className="text-xl font-black">{match}</h2>
        <p className="mt-1 text-sm font-bold text-[#5f6b7f]">
          Grille verrouill&eacute;e apr&egrave;s validation
        </p>
      </div>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Field label="R&eacute;sultat du match" points="1 pt">
          <select className="input" name="result">
            <option>Victoire domicile</option>
            <option>Nul</option>
            <option>Victoire exterieur</option>
          </select>
        </Field>
        <ScorerField players={players} />
        <Field label="Score exact" points="3 pts">
          <select className="input" defaultValue="2-1" name="exactScore">
            {exactScoreOptions.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.scores.map((score) => (
                  <option key={score} value={score}>{exactScoreLabel(score)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Premi&egrave;re &eacute;quipe &agrave; marquer" points="1 pt">
          <select className="input" name="firstTeam">
            <option value="Domicile">{matchOption.homeTeamName ?? "Domicile"}</option>
            <option value="Exterieur">{matchOption.awayTeamName ?? "Extérieur"}</option>
            <option value="Aucun">Aucun but</option>
          </select>
        </Field>
        <Field label="Derni&egrave;re &eacute;quipe &agrave; marquer" points="1 pt">
          <select className="input" name="lastTeam">
            <option value="Exterieur">{matchOption.awayTeamName ?? "Extérieur"}</option>
            <option value="Domicile">{matchOption.homeTeamName ?? "Domicile"}</option>
            <option value="Aucun">Aucun but</option>
          </select>
        </Field>
        <Field label="Total buts" points="1 pt">
          <select className="input" name="goals">
            <option>Plus de 1.5</option>
            <option>Moins de 1.5</option>
          </select>
        </Field>
        <p className="rounded-2xl border border-[#d9e1ea] bg-[#eef3f8] p-3 text-xs font-bold leading-5 text-[#4e596b]">
          &Agrave; la validation, 1 jeton sera utilis&eacute; et tes
          pr&eacute;dictions seront verrouill&eacute;es.
        </p>
        <button className="h-12 rounded-2xl bg-[#00baff] font-black uppercase text-black">
          Valider mes pr&eacute;dictions
        </button>
      </form>
    </section>
  );
}

function SubmittedPredictionCard({
  prediction,
}: {
  prediction: PredictionRecord;
}) {
  return (
    <section className="rounded-3xl border border-[#d9e1ea] bg-white p-4">
      <div className="mb-4 rounded-2xl border border-[#00baff]/40 bg-[#00baff]/10 p-4">
        <p className="text-xs font-black uppercase text-[#00baff]">
          Grille enregistr&eacute;e
        </p>
        <h2 className="mt-1 text-xl font-black">{prediction.matchLabel}</h2>
        <p className="mt-2 inline-flex rounded-full bg-[#00baff] px-3 py-1 text-xs font-black uppercase text-black">
          En attente de r&eacute;sultat
        </p>
        <p className="mt-2 text-sm text-[#5f6b7f]">
          {prediction.matchTime}
        </p>
      </div>
      <PredictionDetails pick={prediction.pick} />
    </section>
  );
}

function ChallengePredictionForm({
  match,
  matchOption,
  players,
  title,
  submitLabel,
  onBack,
  onSubmit,
}: {
  match: string;
  matchOption: MatchOption;
  players: PlayerOption[];
  title: string;
  submitLabel: string;
  onBack: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="rounded-3xl border border-[#d9e1ea] bg-white p-4">
      <button
        className="mb-3 rounded-xl border border-[#00baff]/50 px-3 py-2 text-sm font-black text-[#00baff]"
        onClick={onBack}
        type="button"
      >
        &larr; Retour
      </button>
      <div className="mb-4">
        <p className="text-xs font-black uppercase text-[#00baff]">
          {title}
        </p>
        <h2 className="text-xl font-black">{match}</h2>
      </div>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Field label="R&eacute;sultat 1N2" points="1 pt">
          <select className="input" name="result">
            <option>Victoire domicile</option>
            <option>Nul</option>
            <option>Victoire exterieur</option>
          </select>
        </Field>
        <ScorerField players={players} />
        <Field label="Score exact" points="3 pts">
          <select className="input" defaultValue="2-1" name="exactScore">
            {exactScoreOptions.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.scores.map((score) => (
                  <option key={score} value={score}>{exactScoreLabel(score)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Premi&egrave;re &eacute;quipe &agrave; marquer" points="1 pt">
          <select className="input" name="firstTeam">
            <option value="Domicile">{matchOption.homeTeamName ?? "Domicile"}</option>
            <option value="Exterieur">{matchOption.awayTeamName ?? "Extérieur"}</option>
            <option value="Aucun">Aucun but</option>
          </select>
        </Field>
        <Field label="Derni&egrave;re &eacute;quipe &agrave; marquer" points="1 pt">
          <select className="input" name="lastTeam">
            <option value="Exterieur">{matchOption.awayTeamName ?? "Extérieur"}</option>
            <option value="Domicile">{matchOption.homeTeamName ?? "Domicile"}</option>
            <option value="Aucun">Aucun but</option>
          </select>
        </Field>
        <Field label="Total buts" points="1 pt">
          <select className="input" name="goals">
            <option>Plus de 1.5</option>
            <option>Moins de 1.5</option>
          </select>
        </Field>
        <button className="h-12 rounded-2xl bg-[#00baff] font-black uppercase text-black">
          {submitLabel}
        </button>
      </form>
    </section>
  );
}

function ChallengeInProgressCard({
  matchLabel,
  playerPick,
  friendPick,
  friendPseudo,
  challengeLink,
  copied,
  onCopy,
  onOpenFriend,
}: {
  matchLabel: string;
  playerPick: PredictionPick;
  friendPick: PredictionPick | null;
  friendPseudo: string;
  challengeLink: string;
  copied: boolean;
  onCopy: () => void;
  onOpenFriend?: () => void;
}) {
  return (
    <section className="rounded-3xl border border-[#d9e1ea] bg-white p-5">
      <p className="text-xs font-black uppercase text-[#00baff]">
        Defi en cours
      </p>
      <h2 className="mt-1 text-xl font-black">{matchLabel}</h2>
      <div className="mt-4 grid gap-3">
        <PredictionSideCard
          label="admin"
          pick={playerPick}
          status="Predictions posees"
        />
        <PredictionSideCard
          label={friendPseudo}
          pick={friendPick}
          status={friendPick ? "Predictions posees" : "En attente"}
        />
      </div>
      {!friendPick && (
        <>
          <div className="mt-4 rounded-2xl border border-[#d9e1ea] bg-[#eef3f8] p-3 text-sm font-bold text-[#4e596b]">
            {challengeLink}
          </div>
          <button
            className="mt-3 h-12 w-full rounded-2xl border border-[#00baff] font-black uppercase text-[#00baff]"
            onClick={onCopy}
            type="button"
          >
            {copied ? "Lien copie" : "Copier le lien"}
          </button>
          {onOpenFriend && (
            <button
              className="mt-3 h-12 w-full rounded-2xl bg-[#00baff] font-black uppercase text-black"
              onClick={onOpenFriend}
              type="button"
            >
              Demo : ouvrir comme mon ami
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ChallengeResultCard({
  matchLabel,
  stake,
  playerPick,
  friendPick,
  friendPseudo,
  onReset,
}: {
  matchLabel: string;
  stake: string;
  playerPick: PredictionPick;
  friendPick: PredictionPick;
  friendPseudo: string;
  onReset: () => void;
}) {
  const [resultCopied, setResultCopied] = useState(false);
  const adminScore = 7;
  const friendScore = 5;
  const stakeText = stake || "pour la gloire";
  const winnerText =
    friendScore > adminScore
      ? `admin te doit ${stakeText}.`
      : `Tu dois ${stakeText} a admin.`;
  const shareText = `${winnerText} Résultat du défi Panen&Co sur ${matchLabel} : admin ${adminScore} pts, ${friendPseudo} ${friendScore} pts.`;

  async function shareResult() {
    try {
      if (navigator.share) {
        await navigator.share({
          text: shareText,
          title: "Résultat du défi Panen&Co",
        });
      } else {
        await navigator.clipboard.writeText(shareText);
      }
    } catch {
      await navigator.clipboard.writeText(shareText);
    }

    setResultCopied(true);
  }

  return (
    <section className="space-y-4">
      <section className="rounded-3xl border border-green-400/60 bg-green-400/10 p-5 text-center shadow-[0_0_34px_rgba(74,222,128,.16)]">
        <p className="text-xs font-black uppercase text-green-700">
          Defi termine
        </p>
        <h2 className="mt-1 text-xl font-black">{matchLabel}</h2>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[#00baff] bg-white p-4">
            <span className="text-xs font-black uppercase text-[#5f6b7f]">
              admin
            </span>
            <strong className="mt-2 block text-5xl font-black text-[#00baff]">
              {adminScore}
            </strong>
            <small className="font-black text-[#4e596b]">pts</small>
          </div>
          <div className="rounded-2xl border border-[#d9e1ea] bg-white p-4">
            <span className="text-xs font-black uppercase text-[#5f6b7f]">
              {friendPseudo}
            </span>
            <strong className="mt-2 block text-5xl font-black text-[#00baff]">
              {friendScore}
            </strong>
            <small className="font-black text-[#4e596b]">pts</small>
          </div>
        </div>
        <p className="mt-4 rounded-2xl border border-[#d9e1ea] bg-white p-3 text-sm font-bold text-[#4e596b]">
          {winnerText}
        </p>
        <button
          className="mt-3 h-12 w-full rounded-2xl border border-[#00baff] bg-white font-black uppercase text-[#00baff]"
          onClick={shareResult}
          type="button"
        >
          {resultCopied ? "Résultat copié" : "Partager"}
        </button>
      </section>
      <PredictionSideCard
        label="admin"
        pick={playerPick}
        status={`${adminScore} pts`}
      />
      <PredictionSideCard
        label={friendPseudo}
        pick={friendPick}
        status={`${friendScore} pts`}
      />
      <button
        className="h-12 w-full rounded-2xl bg-[#00baff] font-black uppercase text-black"
        onClick={onReset}
        type="button"
      >
        Refaire un defi
      </button>
    </section>
  );
}

function PredictionSideCard({
  label,
  pick,
  status,
}: {
  label: string;
  pick: PredictionPick | null;
  status: string;
}) {
  return (
    <section className="rounded-2xl border border-[#d9e1ea] bg-[#eef3f8] p-4">
      <div className="flex items-center justify-between gap-3">
        <strong>{label}</strong>
        <span
          className={
            (pick ? "bg-[#00baff] text-black" : "bg-white text-[#5f6b7f]") +
            " rounded-full px-3 py-1 text-xs font-black"
          }
        >
          {status}
        </span>
      </div>
      {pick ? (
        <PredictionDetails pick={pick} />
      ) : (
        <p className="mt-3 text-sm font-bold text-[#4e596b]">
          Les predictions de ton ami apparaitront ici apres validation.
        </p>
      )}
    </section>
  );
}

function ResultPredictionCard({ prediction }: { prediction: PredictionRecord }) {
  return (
    <section className="rounded-3xl border border-green-400/50 bg-green-400/10 p-4">
      <div className="mb-4 grid grid-cols-[1fr_auto] gap-3">
        <div>
          <p className="text-xs font-black uppercase text-green-300">
            Match termin&eacute;
          </p>
          <h2 className="mt-1 text-xl font-black">{prediction.matchLabel}</h2>
          <p className="mt-1 text-sm text-[#5f6b7f]">{prediction.matchTime}</p>
        </div>
        <div className="rounded-2xl bg-[#00baff] px-3 py-2 text-center text-black">
          <b className="block text-2xl">{prediction.score}</b>
          <small className="font-black">pts</small>
        </div>
      </div>
      <PredictionDetails pick={prediction.pick} />
      {prediction.scoreDetails && prediction.scoreDetails.length > 0 && (
        <ScoreDetails details={prediction.scoreDetails} />
      )}
      {(!prediction.scoreDetails || prediction.scoreDetails.length === 0) && (
        <p className="mt-4 rounded-2xl border border-[#d9e1ea] bg-[#f6f8fb] p-3 text-sm font-bold text-[#5f6b7f]">
          Le détail des points sera disponible pour les prochains résultats
          calculés automatiquement.
        </p>
      )}
    </section>
  );
}

function ScoreDetails({
  details,
}: {
  details: NonNullable<PredictionRecord["scoreDetails"]>;
}) {
  return (
    <div className="mt-4 grid gap-2 rounded-2xl border border-[#d9e1ea] bg-[#f6f8fb] p-3">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#00baff]">
        Détail des points
      </p>
      {details.map((detail) => (
        <div
          className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-white px-3 py-2"
          key={detail.label}
        >
          <span className="text-sm font-black text-[#4e596b]">
            {detail.label}
          </span>
          <b
            className={
              detail.won
                ? "rounded-full bg-[#00baff]/15 px-2 py-1 text-[#00baff]"
                : "rounded-full bg-[#eef3f8] px-2 py-1 text-[#8b95a5]"
            }
          >
            {detail.won ? "+" : ""}
            {detail.points}/{detail.maxPoints}
          </b>
        </div>
      ))}
    </div>
  );
}

function PredictionDetails({ pick }: { pick: PredictionPick }) {
  const details = [
    ["Résultat", pick.result],
    ["Buteur", pick.scorer],
    ["Score exact", pick.exactScore],
    ["Première équipe à marquer", pick.firstTeam],
    ["Dernière équipe à marquer", pick.lastTeam],
    ["Total buts", pick.goals],
  ];

  return (
    <div className="mt-4 grid gap-2 text-left">
      {details.map(([label, value]) => (
        <div
          className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-[#d9e1ea] bg-[#eef3f8] p-3"
          key={label}
        >
          <span className="text-sm font-black text-[#5f6b7f]">{label}</span>
          <b className="text-right text-sm text-[#0b0f19]">{value}</b>
        </div>
      ))}
    </div>
  );
}

function TokenModal({
  onClose,
  onAd,
}: {
  onClose: () => void;
  onAd: () => void | Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-5 backdrop-blur-lg">
      <section className="w-full max-w-[430px] rounded-3xl border border-[#d9e1ea] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,.10)]">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-2xl font-black">Plus de jetons</h2>
          <span className="text-xs font-black uppercase text-[#697386]">
            Participation
          </span>
        </div>
        <div className="grid gap-3">
          <button
            className="rounded-2xl border border-[#00baff]/40 bg-[#00baff]/10 p-4 text-left"
            onClick={() => alert("Paiement non active dans cette demo.")}
            type="button"
          >
            <strong className="block text-[#00baff]">Abonnement</strong>
            <span className="text-sm text-[#4e596b]">
              9,99 &euro;/mois · 5 jetons par jour
            </span>
          </button>
          <button
            className="rounded-2xl border border-[#00baff]/40 bg-[#00baff]/10 p-4 text-left"
            onClick={onAd}
            type="button"
          >
            <strong className="block text-[#00baff]">Regarder une pub</strong>
            <span className="text-sm text-[#4e596b]">
              Quelques secondes · +1 jeton valable aujourd&apos;hui
            </span>
          </button>
        </div>
        <button
          className="mt-4 h-12 w-full rounded-2xl border border-[#00baff] font-black uppercase text-[#00baff]"
          onClick={onClose}
          type="button"
        >
          Fermer
        </button>
      </section>
    </div>
  );
}

function ProfileDrawer({
  onClose,
  onLogout,
  predictions,
  userProfile,
}: {
  onClose: () => void;
  onLogout: () => void;
  predictions: PredictionRecord[];
  userProfile: UserProfile;
}) {
  const [section, setSection] = useState<
    "history" | "subscription" | "security" | "about" | "help"
  >("history");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const historyItems = predictions.map((prediction) => ({
    ...prediction,
    date: prediction.createdAt
      ? new Intl.DateTimeFormat("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(prediction.createdAt))
      : prediction.matchTime,
  }));

  const menu = [
    { id: "history", label: "Historique" },
    { id: "subscription", label: "Abonnement" },
    { id: "security", label: "Securite" },
    { id: "about", label: "A propos" },
    { id: "help", label: "Centre aide" },
  ] as const;

  return (
    <aside className="fixed inset-0 z-50 bg-black/25 backdrop-blur-lg">
      <section className="ml-auto flex h-full w-[92%] max-w-[430px] flex-col border-l border-[#d9e1ea] bg-white p-5 shadow-[-18px_0_45px_rgba(15,23,42,.12)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-black">Profil</h2>
          <button
            className="grid h-10 w-10 place-items-center rounded-full border border-[#d9e1ea] text-lg font-black"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>

        <div className="rounded-3xl border border-[#d9e1ea] bg-[#f6f8fb] p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#00baff]">
            Compte connecte
          </p>
          <strong className="mt-1 block text-2xl font-black">
            {userProfile.pseudo}
          </strong>
          <span className="block text-sm font-bold text-[#4e596b]">
            {userProfile.email}
          </span>
        </div>

        <div className="mt-3 rounded-3xl border border-[#d9e1ea] bg-[#f6f8fb] p-2">
          <button
            aria-label="Notifications"
            aria-pressed={notificationsEnabled}
            className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3"
            onClick={() => setNotificationsEnabled((value) => !value)}
            type="button"
          >
            <span className="text-xs font-black uppercase tracking-[0.18em] text-[#4e596b]">
              Notifications
            </span>
            <span
              className={
                (notificationsEnabled ? "bg-[#00baff]" : "bg-[#d9e1ea]") +
                " flex h-8 w-14 items-center rounded-full p-1 transition"
              }
            >
              <span
                className={
                  (notificationsEnabled ? "translate-x-6" : "translate-x-0") +
                  " h-6 w-6 rounded-full bg-white shadow transition"
                }
              />
            </span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {menu.map((item) => (
            <button
              className={
                (section === item.id
                  ? "border-[#00baff] bg-[#00baff] text-black"
                  : "border-[#d9e1ea] bg-white text-[#111827]") +
                " h-11 rounded-2xl border px-3 text-left text-sm font-black"
              }
              key={item.id}
              onClick={() => setSection(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-auto pr-1">
          {section === "subscription" && (
            <ProfilePanel title="Abonnement">
              <div className="rounded-2xl border border-[#d9e1ea] bg-[#f6f8fb] p-4">
                <p className="text-sm font-black text-[#4e596b]">Statut</p>
                <strong className="mt-1 block text-2xl">
                  {isSubscribed ? "Abonnement en cours" : "Pas d'abonnement"}
                </strong>
                <p className="mt-2 text-sm font-bold leading-6 text-[#4e596b]">
                  Sans engagement et r&eacute;siliable &agrave; tout moment, notre
                  abonnement &agrave; 9,99 &euro;/mois vous d&eacute;livre
                  directement 5 jetons quotidiens pour maximiser vos pronostics
                  et multiplier vos chances d&apos;atteindre le sommet du
                  classement.
                </p>
              </div>
              {isSubscribed ? (
                <button
                  className="h-12 rounded-2xl border border-red-200 bg-red-50 font-black uppercase text-red-600"
                  onClick={() => setIsSubscribed(false)}
                  type="button"
                >
                  Resilier
                </button>
              ) : (
                <button
                  className="h-12 rounded-2xl bg-[#00baff] font-black uppercase text-black"
                  onClick={() => setIsSubscribed(true)}
                  type="button"
                >
                  Passer &agrave; 5 jetons/jour
                </button>
              )}
            </ProfilePanel>
          )}

          {section === "history" && (
            <ProfilePanel title="Historique">
              {historyItems.length > 0 ? (
                historyItems.map((item) => (
                  <div
                    className="rounded-2xl border border-[#d9e1ea] bg-white p-4"
                    key={item.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <strong className="block">{item.matchLabel}</strong>
                        <span className="text-sm font-bold text-[#4e596b]">
                          {item.date}
                        </span>
                      </div>
                      <b
                        className={
                          (item.status === "done"
                            ? "bg-[#00baff] text-black"
                            : "bg-[#eef3f8] text-[#4e596b]") +
                          " rounded-xl px-3 py-2 text-sm"
                        }
                      >
                        {item.status === "done"
                          ? `${item.score ?? 0} pts`
                          : "En cours"}
                      </b>
                    </div>
                    <details className="mt-3 rounded-2xl border border-[#d9e1ea] bg-[#f6f8fb] p-3">
                      <summary className="cursor-pointer text-sm font-black text-[#00baff]">
                        Voir ma grille
                      </summary>
                      <PredictionDetails pick={item.pick} />
                    </details>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-[#d9e1ea] bg-white p-4 text-sm font-bold text-[#4e596b]">
                  Aucune pr&eacute;diction pour le moment. D&egrave;s que tu valides
                  une grille, elle appara&icirc;t ici.
                </div>
              )}
            </ProfilePanel>
          )}

          {section === "security" && (
            <ProfilePanel title="Securite">
              <input className="input" placeholder="Mot de passe actuel" type="password" />
              <input className="input" placeholder="Nouveau mot de passe" type="password" />
              <input className="input" placeholder="Confirmer le mot de passe" type="password" />
              <button className="h-12 rounded-2xl bg-[#00baff] font-black uppercase text-black">
                Changer le mot de passe
              </button>
            </ProfilePanel>
          )}

          {section === "about" && (
            <ProfilePanel title="A propos">
              <AboutContent />
            </ProfilePanel>
          )}

          {section === "help" && (
            <ProfilePanel title="Centre aide">
              <input className="input" placeholder="Sujet" />
              <textarea
                className="min-h-28 rounded-2xl border border-[#d9e1ea] bg-white p-3 font-bold outline-none focus:border-[#00baff] focus:ring-4 focus:ring-[#00baff]/15"
                placeholder="À ton écoute"
              />
              <button className="h-12 rounded-2xl bg-[#00baff] font-black uppercase text-black">
                Envoyer ma demande
              </button>
              <p className="text-sm font-bold text-[#4e596b]">
                Reponse assuree sous 24h.
              </p>
            </ProfilePanel>
          )}
        </div>

        <button
          className="mt-4 h-12 rounded-2xl border border-[#d9e1ea] bg-white font-black uppercase text-[#111827]"
          onClick={onLogout}
          type="button"
        >
          Deconnexion
        </button>
      </section>
    </aside>
  );
}

function AboutContent() {
  return (
    <div className="grid gap-4 text-sm font-bold leading-6 text-[#4e596b]">
      <section className="rounded-2xl border border-[#d9e1ea] bg-white p-4">
        <h3 className="text-xl font-black text-[#0b0f19]">
          A propos de Panen&amp;Co
        </h3>
        <h4 className="mt-4 font-black text-[#00baff]">Le Concept</h4>
        <p className="mt-2">
          Panen&amp;Co est l&apos;arene de pronostics footballistiques ultime
          concue pour elire le plus grand connaisseur de football. Notre
          application est 100 % gratuite, ouverte a tous et financee par la
          publicite et les abonnements optionnels. Aucun depot d&apos;argent pour
          parier n&apos;est requis ni autorise. Ici, seule votre sagacite sportive
          vous permet de grimper au sommet des classements et de remporter les
          prix mis en jeu par la plateforme.
        </p>
      </section>

      <InfoBlock
        title="Mode Championnat (Multi)"
        text="Pronostiquez jusqu'a 5 matchs de football au choix par jour. Chaque prediction peut vous rapporter un maximum de 9 points. 1 match predit = 1 jeton, avec 5 jetons maximum par jour."
      />
      <InfoBlock
        title="Jetons"
        text="1 jeton gratuit est offert automatiquement chaque jour. Regardez une video publicitaire de 20 secondes pour debloquer +1 jeton. L'abonnement Premium a 9,99 euro / mois debloque les 5 jetons quotidiens sans publicite."
      />
      <InfoBlock
        title="Classement Hebdomadaire"
        text="Les points s'accumulent tout au long de la semaine. Le classement general est reinitialise chaque dimanche a minuit."
      />

      <section className="rounded-2xl border border-[#d9e1ea] bg-white p-4">
        <h4 className="font-black text-[#0b0f19]">Grille des Prix</h4>
        <ul className="mt-3 grid gap-2">
          <li>Top 1 : 150 euro</li>
          <li>Top 2 a 3 : 100 euro</li>
          <li>Top 4 a 10 : 50 euro</li>
          <li>Top 11 a 30 : 30 euro</li>
          <li>Top 31 a 50 : 10 euro</li>
        </ul>
      </section>

      <InfoBlock
        title="Defier un ami"
        text="Un duel pur et gratuit sur les memes 5 matchs du jour. Aucun jeton requis, ce mode est totalement illimite. Choisissez votre match, generez un lien unique et envoyez-le a un ami pour comparer vos pronostics sur 9 points possibles."
      />

      <section className="rounded-2xl border border-[#d9e1ea] bg-white p-4">
        <h4 className="font-black text-[#0b0f19]">
          Conditions Generales d&apos;Utilisation
        </h4>
        <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-[#697386]">
          Version en vigueur au 7 juillet 2026
        </p>
        <div className="mt-4 grid gap-3">
          <InfoBlock
            title="1. Objet du Service"
            text="Panen&Co est un jeu-concours gratuit de pronostics sportifs base sur les connaissances des utilisateurs. Panen&Co n'est ni un site de paris sportifs, ni un operateur de jeux d'argent. L'application ne propose aucune fonctionnalite de mise financiere de la part des utilisateurs."
          />
          <InfoBlock
            title="2. Eligibilite & Inscription"
            text="L'acces aux classements dotes implique d'etre une personne physique agee de 18 ans ou plus et de posseder un compte unique associe a une adresse email et un pseudonyme valide. Le multicompte entraine un bannissement immediat et definitif."
          />
          <InfoBlock
            title="3. Gains & Abonnements"
            text="Les dotations sont offertes par Panen&Co et financees par la publicite et les abonnements Premium. Les abonnements a 9,99 euro / mois sont sans engagement, factures mensuellement et resiliables a tout moment. Un solde minimal de 20 euro est requis pour demander un versement, soumis a verification d'identite et de majorite."
          />
          <InfoBlock
            title="4. Anti-Triche et Fair-Play"
            text="Panen&Co se reserve le droit de suspendre, sans preavis ni indemnite, tout compte suspecte de triche, d'automatisation de pronostics, de manipulation des flux publicitaires ou de comportements frauduleux."
          />
        </div>
      </section>
    </div>
  );
}

function ProfilePanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <h3 className="text-xl font-black">{title}</h3>
      {children}
    </section>
  );
}

function InfoBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[#d9e1ea] bg-[#f6f8fb] p-4">
      <strong>{title}</strong>
      <p className="mt-1 text-sm font-bold leading-6 text-[#4e596b]">{text}</p>
    </div>
  );
}





