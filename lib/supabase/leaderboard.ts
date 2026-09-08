import type { TopPlayer } from "@/types";
import { supabase } from "@/lib/supabase/client";

type WeeklyScoreRow = {
  user_id: string;
  pseudo: string | null;
  points: number;
};

export type RankableWeeklyPlayer = {
  userId?: string;
  pseudo: string;
  points: number;
  isCurrentUser?: boolean;
  isVirtual?: boolean;
};

export type RankedWeeklyPlayer = TopPlayer & {
  userId?: string;
};

const virtualPseudos = [
  "Lucas Martin",
  "Hugo Bernard",
  "Thomas Petit",
  "Enzo Robert",
  "Mathieu Laurent",
  "Romain Dubois",
  "Bastien Moreau",
  "Quentin Roux",
  "Damien Bertrand",
  "Florian Girard",
  "Adrien Bonnet",
  "Nicolas Lambert",
  "Julien Morin",
  "Alexis Robin",
  "Vincent Leclerc",
  "Clement Ferry",
  "Jeremy Collin",
  "Thibault Vidal",
  "Guillaume Brunet",
  "Valentin Mercier",
  "Antoine Marchand",
  "Arthur Meunier",
  "Louis Bertin",
  "Paul Legros",
  "Adam Maillard",
  "Gabin Roussel",
  "Nathan Denis",
  "Mathis Perrin",
  "Noah Boucher",
  "Ryan Schmitt",
  "Yanis Breton",
  "Sofiane Dumas",
  "Amine Colas",
  "Mehdi Renaud",
  "Sami Courtin",
  "Anis Carlier",
  "Idris Maillet",
  "Nabil Henry",
  "Walid Pichon",
  "Selim Rolland",
  "Hakim Moret",
  "Adel Dumont",
  "Mounir Cordier",
  "Lucas_94",
  "Antoine.8",
  "Max_98",
  "Thomas_69",
  "Julien_FC",
  "Clement_OM",
  "Tom_AC",
  "Mathieu_R",
  "Alex_db",
  "Pierre.m",
  "Nico_75",
  "Hugo.lnt",
  "Yanis_92",
  "Alex_PSG",
  "Theo_31",
  "Romain_OL",
  "Enzo_rc",
  "Samy_93",
  "Kelyan_b",
  "Mathis_13",
  "Valentin_rcs",
  "Leo_29",
  "Quentin_db",
  "Maxime_v",
  "Arthur_59",
  "Simon_fc",
  "Gabin_76",
  "Paul.b",
  "Dylan_91",
  "Adrien_rc",
  "Nathan_83",
  "Axel.p",
  "Florian_62",
  "Kevin_OM",
  "Guillaume_78",
  "Bastien_OL",
  "Jeremy_38",
  "Maxence_l",
  "Alexis_44",
  "Corentin_b",
  "Baptiste_51",
  "Jordan_95",
  "Tristan_fc",
  "Loic_22",
  "Anthony_84",
  "Thibault_m",
  "Killian_35",
  "Benjamin_77",
  "Damien_fc",
  "Cedric_33",
  "Mika_94",
  "Robin_OL",
  "Yohan_60",
  "Seb_75",
  "Xavier_b",
  "Louis_86",
  "Jonas_rc",
  "Remi_42",
  "Alan_29",
  "Victor.d",
  "Samuel_74",
  "Matteo_OM",
  "Fabien_57",
  "Theo_lmt",
  "Jules_21",
  "Arnaud_92",
  "Vincent_87",
  "Florent_34",
  "Nolan_56",
  "Tony_93",
  "Cyril.p",
  "Rayan_91",
  "Christopher_62",
  "Dorian_81",
  "Mael_22",
  "Kilian_fc",
  "Gabriel_75",
  "Ludovic_59",
  "Alexandre_r",
  "Stephane_69",
  "Morgan_29",
  "Tanguy_35",
  "falso_nueve",
  "trequartista_fr",
  "demi_espace_gauche",
  "pressing_tout_terrain",
  "sentinelle_solitaire",
  "le_onze_type",
  "foot_romantique",
  "nostalgie_90s",
  "le_piston_gauche",
  "data_and_grinta",
  "carton_rouge_direct",
  "xg_merchant_fc",
  "un_zero_suffira",
  "prono_chirurgical",
  "analyste_de_canape",
  "petit_pont_volontaire",
  "frappe_en_roule",
  "gardien_volant_vrai",
  "tactique_et_merguez",
  "le_banc_de_touche",
  "supersub_de_luxe",
  "double_contact_fluide",
  "crochet_interieur",
  "hors_jeu_passif",
  "lucarne_nettoyee",
  "arret_sur_la_ligne",
  "la_main_de_dieu",
  "tacle_glisse_maitrise",
  "le_mur_de_briques",
  "le_petit_bielsa",
  "la_grinta_dans_les_veines",
  "virage_nord_mentalite",
  "kop_passion_foot",
  "buteur_du_dimanche_soir",
  "le_poulpe_des_pronos",
  "madame_irma_fc",
  "prediction_millimetre",
  "le_devin_du_ballon",
  "ticket_valide_extremis",
  "le_pro_de_la_cote",
  "prono_safe_uniquement",
  "le_combine_du_weekend",
  "la_surprise_du_chef",
  "hold_up_derniere_minute",
  "le_specialiste_du_derby",
  "passion_tactique_football",
  "le_cerveau_du_milieu",
  "defenseur_a_l_ancienne",
  "libero_nostalgique",
  "renard_des_surfaces_vrai",
  "gardien_du_temple_fc",
  "tactique_gagnante_fc",
  "mercato_addict_fr",
  "rumeur_de_couloir",
  "detecteur_de_talents",
  "football_champagne_fc",
  "tiki_taka_addict",
  "appel_contre_appel",
  "defense_en_zone_fermee",
  "arbitre_assistant_video",
  "le_podcasteur_du_foot",
  "debat_sans_fin_fc",
  "passion_retro_football",
  "la_legende_du_club",
  "histoire_de_derby",
  "soir_de_match_ambiance",
  "le_chant_des_supporters",
  "le_fumi_du_virage",
  "generation_ultra_football",
  "chasseur_de_stades",
  "ambiance_de_folie_fc",
  "le_chaudron_en_feu",
  "le_match_de_ma_vie",
  "le_but_anthologique",
  "le_scenario_fou",
  "le_sacre_champion",
  "la_coupe_a_la_maison",
  "la_fidelite_au_blason",
  "le_supporter_inconditionnel",
  "le_socio_du_football",
  "le_passionne_du_ballon",
  "le_roi_du_classement",
  "le_leader_du_championnat",
  "la_remontada_historique",
  "le_braquage_parfait",
  "la_cote_improbable",
  "le_pronostiqueur_fou",
  "le_genie_des_predictions",
  "oracle_du_football",
  "le_guide_des_pronos",
  "la_minute_tactique",
  "loeil_du_coach",
  "la_palette_tactique",
  "le_tableau_noir_fc",
  "la_discipline_tactique",
  "la_force_du_collectif",
  "la_defense_de_fer",
  "lattaque_de_feu",
  "le_duo_magique",
  "le_milieu_a_trois",
  "le_gardien_libero",
  "flo.62",
  "val_tct",
  "dimitri_ol",
  "soso_bdt",
  "mika.bzh",
  "remi_rcsa",
  "nico_parigo",
  "juju.fcgb",
  "yanis.vfc",
  "jojo_du_91",
  "alex.m2",
  "theo_le_sang",
  "dylan_om_13",
  "hugo_r9",
  "momo_941",
  "clem.mhsc",
  "maxou.bdt",
  "sacha.dz",
  "guigui_38",
  "titou_asse",
  "doudou_om",
  "lucas_la_grinta",
  "enzo_la_frappe",
  "leo_le_buteur",
  "yo_la_lucarne",
  "loic_le_tacleur",
  "cyril_om_le_boss",
  "gabi_la_panenka",
  "zizoudu31",
  "pronoking",
  "oliveettom",
  "kimpembefan",
  "letacticien",
  "neymarinho",
  "cornersortant",
  "buteurfou",
  "lafrappe",
  "goalvolant",
  "samprono",
  "lapelouse",
  "lagrinta",
  "poteaurantant",
  "le12emehomme",
  "clean_sheet",
  "joga_bonito99",
  "remontada_fc",
  "plat_du_pied_sec",
  "mercato_live",
  "buvette_fc",
  "tacle_glisse",
  "numero10",
  "super_sub",
  "mur_de_brique",
  "sifflet_final",
  "telefoot_nostalgie",
  "football_manager_addict",
  "madame_irma",
  "le_devin",
  "prono_safe",
  "le_ticket_gagnant",
  "la_cote_a_10",
  "le_combine_fou",
  "statman",
  "le_data_foot",
  "algorithme_fc",
  "la_gagne",
  "capitaine_courage",
  "le_taulier",
  "la_sentinelle",
  "le_piston",
  "le_meneur",
  "le_finisseur",
  "le_canonnier",
  "MaxDuFoot",
  "NinoFC",
  "Lucarne7",
  "MaloGoal",
  "TikiThomas",
  "AyaTactique",
  "DerbyKing",
  "SofiaBall",
  "Kariim10",
  "CapitaineL",
  "NinaGoal",
  "PanenMax",
  "LucaProno",
  "MisterVAR",
  "Zone14",
  "MatheoFC",
  "NoaCorner",
  "RayanFoot",
  "CamilleXG",
  "LeoSurface",
  "Amine9",
  "SachaGoal",
  "TheoPressing",
  "IlyesFC",
  "HugoDerby",
  "MilaFoot",
  "SamTiki",
  "AlexLucarne",
  "Eliott10",
  "NassimBall",
  "ChloeLiga",
  "RyanButeur",
  "TomProno",
  "EnzoVAR",
  "YanFootix",
  "NoeFinale",
  "LinaGoal",
  "OscarFC",
  "MehdiFoot",
  "JulesCorner",
  "AdamDerby",
  "NoraTacle",
  "IsaacSport",
  "EdenProno",
  "IlanBut",
  "MaelFoot",
  "LennyZone",
  "AminataFC",
  "NaelScore",
  "YanisTop",
  "RaphProno",
  "LolaCorner",
  "IbraTiki",
  "NicoVAR",
  "SarahFoot",
  "DylanZone",
  "MayaButeur",
  "BilalDerby",
  "EmaSurface",
  "NoamPress",
  "TessGoal",
  "YuriScore",
  "LiamTacle",
  "ZoeProno",
  "SamiLiga",
  "MonaFC",
  "AxelBut",
  "InesFinale",
  "EvanXG",
  "NeliaFoot",
  "RomyVAR",
  "KylianZone",
  "LorisGoal",
  "AlyaCorner",
  "MarinProno",
  "YounesFC",
  "LoukaFoot",
  "EvaLucarne",
  "NolanDerby",
  "ArielScore",
  "James Carter",
  "Oliver Bennett",
  "Mason Taylor",
  "Noah Wilson",
  "Ethan Walker",
  "Liam Cooper",
  "Jack Harrison",
  "Leo Turner",
  "Harry Collins",
  "Charlie Brooks",
  "Carlos Ramirez",
  "Diego Torres",
  "Santiago Vega",
  "Mateo Alvarez",
  "Luis Herrera",
  "Javier Moreno",
  "Pablo Castillo",
  "Nico Fernandez",
  "Tomas Navarro",
  "Andres Molina",
  "the_final_whistle",
  "box_to_box_ben",
  "clean_sheet_jack",
  "last_minute_goal",
  "away_day_ollie",
  "corner_taken_quick",
  "el_mago_del_gol",
  "la_banda_del_var",
  "gol_de_oro_fc",
  "pase_filtrado",
  "nueve_clasico",
  "cancha_caliente",
];

const recurringContenders = [
  "Lucas Martin",
  "Hugo Bernard",
  "Carlos Ramirez",
  "James Carter",
  "Mateo Alvarez",
  "MisterVAR",
  "MaxDuFoot",
  "Lucarne7",
  "letacticien",
  "statman",
  "pronoking",
  "the_final_whistle",
  "el_mago_del_gol",
  "le_poulpe_des_pronos",
];

function parisDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
    hour: Number(parts.find((part) => part.type === "hour")?.value),
    minute: Number(parts.find((part) => part.type === "minute")?.value),
  };
}

export function currentWeekStart() {
  const { year, month, day } = parisDateParts();
  const parisNoon = new Date(Date.UTC(year, month - 1, day, 12));
  const currentDay = parisNoon.getUTCDay() === 0 ? 7 : parisNoon.getUTCDay();

  parisNoon.setUTCDate(parisNoon.getUTCDate() - currentDay + 1);

  return parisNoon.toISOString().slice(0, 10);
}

function stableNumber(value: string) {
  return [...value].reduce(
    (sum, character, index) => sum + character.charCodeAt(0) * (index + 1),
    0,
  );
}

function hoursSinceWeekStart() {
  const { year, month, day, hour, minute } = parisDateParts();
  const parisNow = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const currentDay = parisNow.getUTCDay() === 0 ? 7 : parisNow.getUTCDay();

  return (currentDay - 1) * 24 + hour + minute / 60;
}

function weeklyProgress() {
  const hours = hoursSinceWeekStart();

  if (hours < 10) return 0;

  const playableHours = 168 - 10;
  const rawProgress = Math.min(1, Math.max(0, (hours - 10) / playableHours));

  return Math.pow(rawProgress, 0.72);
}

function weekMomentKey() {
  const { year, month, day, hour } = parisDateParts();
  const period = Math.floor(hour / 6);

  return `${year}-${month}-${day}-${period}`;
}

export function estimateGlobalRank(points: number, seedKey = "") {
  if (points <= 0) {
    return 1200 + (stableNumber(`${seedKey}-${currentWeekStart()}`) % 700);
  }

  const anchors = [
    { points: 250, rank: 1 },
    { points: 90, rank: 50 },
    { points: 65, rank: 100 },
    { points: 50, rank: 250 },
    { points: 32, rank: 500 },
    { points: 15, rank: 700 },
    { points: 2, rank: 999 },
    { points: 0, rank: 1000 },
  ];

  if (points >= anchors[0].points) return 1;

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const high = anchors[index];
    const low = anchors[index + 1];

    if (points <= high.points && points >= low.points) {
      const progress = (high.points - points) / (high.points - low.points);
      return Math.round(high.rank + progress * (low.rank - high.rank));
    }
  }

  return 1000;
}

function weeklyTopVirtualScore() {
  const finalTopScore = 218 + (stableNumber(`top-${currentWeekStart()}`) % 39);
  const progress = weeklyProgress();

  if (progress <= 0) return 0;

  const liveNoise = stableNumber(`top-live-${currentWeekStart()}-${weekMomentKey()}`) % 8;

  return Math.max(3, Math.round(finalTopScore * progress) + liveNoise);
}

function virtualScore(rank: number) {
  const topScore = weeklyTopVirtualScore();

  if (topScore <= 0) return 0;
  if (rank === 1) return topScore;
  if (rank <= 3) return Math.max(1, topScore - 3 - rank * 2 - ((rank * 5) % 3));
  if (rank <= 10) return Math.max(1, topScore - 9 - rank * 3 - ((rank * 3) % 5));
  if (rank <= 30) return Math.max(1, topScore - 30 - rank * 2 - ((rank * 5) % 7));
  return Math.max(1, topScore - 58 - rank - ((rank * 7) % 6));
}

function pseudoStylePenalty(pseudo: string) {
  let penalty = 0;

  if (pseudo.includes("_")) penalty += 7000;
  if (pseudo.toLowerCase().includes("_fc")) penalty += 1200;
  if (/^[a-z0-9_.-]+$/.test(pseudo)) penalty += 900;
  if (pseudo.includes(" ")) penalty -= 1200;
  if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(pseudo)) penalty -= 1800;
  if (/^[A-Z][a-z]+[A-Z][a-z0-9]+$/.test(pseudo)) penalty -= 700;

  return penalty;
}

function weeklyPseudoPool() {
  const weekKey = currentWeekStart();
  const momentKey = weekMomentKey();
  const seed = stableNumber(`${weekKey}-${momentKey}`);
  const contenderCount = 4 + (stableNumber(`contenders-${weekKey}`) % 3);
  const recurring = [...recurringContenders]
    .sort((left, right) => {
      const leftScore = stableNumber(`${left}-${weekKey}`) % 1009;
      const rightScore = stableNumber(`${right}-${weekKey}`) % 1009;

      return leftScore - rightScore;
    })
    .slice(0, contenderCount);
  const uniquePseudos = [...new Set(virtualPseudos)];
  const allPseudos = uniquePseudos.filter((pseudo) => !recurring.includes(pseudo));

  const weeklyPseudos = allPseudos.sort((left, right) => {
    const leftScore =
      (stableNumber(`${left}-${weekKey}-${seed}`) % 10007) + pseudoStylePenalty(left);
    const rightScore =
      (stableNumber(`${right}-${weekKey}-${seed}`) % 10007) + pseudoStylePenalty(right);

    return leftScore - rightScore;
  });

  const earlyRotation = weeklyPseudos.slice(0, 38);
  const topContenders = recurring.slice(0, 3);
  const regularContenders = recurring.slice(3);
  const rest = weeklyPseudos.slice(38);

  return [...topContenders, ...earlyRotation, ...regularContenders, ...rest];
}

export function rankWeeklyPlayers(players: RankableWeeklyPlayer[]): RankedWeeklyPlayer[] {
  const usedPseudos = new Set(players.map((player) => player.pseudo));
  const realPlayers: RankedWeeklyPlayer[] = players.map((player, index) => ({
    rank: index + 1,
    userId: player.userId,
    pseudo: player.pseudo,
    points: player.points,
    isCurrentUser: Boolean(player.isCurrentUser),
    isVirtual: Boolean(player.isVirtual),
  }));
  const virtualPlayers: RankedWeeklyPlayer[] = [];

  for (const pseudo of weeklyPseudoPool()) {
    if (virtualPlayers.length >= 50) break;
    if (usedPseudos.has(pseudo)) continue;

    const virtualRank = virtualPlayers.length + 1;

    virtualPlayers.push({
      rank: virtualRank,
      pseudo,
      points: virtualScore(virtualRank),
      isCurrentUser: false,
      isVirtual: true,
    });
  }

  return [...realPlayers, ...virtualPlayers]
    .sort((left, right) => {
      if (right.points !== left.points) return right.points - left.points;
      if (left.isVirtual === right.isVirtual) return left.pseudo.localeCompare(right.pseudo);
      return left.isVirtual ? 1 : -1;
    })
    .slice(0, 50)
    .map((player, index) => ({
      ...player,
      rank: index + 1,
      isCurrentUser: player.isCurrentUser,
    }));
}

function fillWithVirtualPlayers(players: RankableWeeklyPlayer[]) {
  return rankWeeklyPlayers(players);
}

export async function getWeeklyLeaderboard(currentUserId?: string | null) {
  if (!supabase) return fillWithVirtualPlayers([]);

  const result = await supabase
    .from("weekly_scores")
    .select("user_id, pseudo, points")
    .eq("week_start", currentWeekStart())
    .order("points", { ascending: false })
    .limit(50);

  if (result.error) return fillWithVirtualPlayers([]);

  const realPlayers = ((result.data ?? []) as WeeklyScoreRow[]).map((row, index) => {
    const rank = index + 1;

    return {
      userId: row.user_id,
      pseudo: row.pseudo ?? `Joueur ${rank}`,
      points: row.points,
      isCurrentUser: row.user_id === currentUserId,
    } satisfies RankableWeeklyPlayer;
  });

  return fillWithVirtualPlayers(realPlayers);
}

export async function getMyWeeklyPoints(userId: string) {
  if (!supabase) return 0;

  const result = await supabase
    .from("weekly_scores")
    .select("points")
    .eq("user_id", userId)
    .eq("week_start", currentWeekStart())
    .maybeSingle();

  if (result.error) return 0;

  return result.data?.points ?? 0;
}

export async function addWeeklyPoints({
  userId,
  pseudo,
  points,
}: {
  userId: string;
  pseudo: string;
  points: number;
}) {
  if (!supabase) return { error: new Error("Supabase n'est pas encore configure.") };

  const weekStart = currentWeekStart();
  const existing = await supabase
    .from("weekly_scores")
    .select("id, points")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existing.error) return { error: existing.error };

  const nextPoints = (existing.data?.points ?? 0) + points;
  const payload = {
    user_id: userId,
    pseudo,
    week_start: weekStart,
    points: nextPoints,
    updated_at: new Date().toISOString(),
  };

  if (existing.data?.id) {
    return supabase
      .from("weekly_scores")
      .update(payload)
      .eq("id", existing.data.id);
  }

  return supabase.from("weekly_scores").insert(payload);
}
