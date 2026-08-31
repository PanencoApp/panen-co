import { NextRequest, NextResponse } from "next/server";
import { notificationMessages } from "@/lib/notifications/messages";
import { sendPushToEveryone } from "@/lib/onesignal/server";

export const dynamic = "force-dynamic";

function parisParts(date = new Date()) {
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

function parisOffsetMinutes(date: Date) {
  const timeZoneName =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Paris",
      timeZoneName: "shortOffset",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT+1";
  const match = timeZoneName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);

  if (!match) return 60;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);

  return sign * (hours * 60 + minutes);
}

function nextParisHour(hour: number) {
  const now = new Date();
  const parts = parisParts(now);
  const firstGuess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, hour),
  );
  const offset = parisOffsetMinutes(firstGuess);
  let target = new Date(firstGuess.getTime() - offset * 60 * 1000);

  if (target.getTime() <= now.getTime()) {
    target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
  }

  return target;
}

function parisDayKey(date = new Date()) {
  const parts = parisParts(date);

  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const userAgent = request.headers.get("user-agent") ?? "";

  if (secret && authorization === `Bearer ${secret}`) return true;
  if (userAgent.includes("vercel-cron/1.0")) return true;
  return process.env.NODE_ENV !== "production";
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nextMidnight = nextParisHour(0);
  const nextMorning = nextParisHour(9);
  const nextMidnightKey = parisDayKey(nextMidnight);
  const nextMorningKey = parisDayKey(nextMorning);
  const dailyMatches = notificationMessages.dailyMatches;
  const dailyReminder = notificationMessages.dailyMatchesReminder;
  const notificationReports = [];

  const dailyMatchesPush = await sendPushToEveryone({
    body: dailyMatches.body,
    idempotencyKey: `daily-matches-${nextMidnightKey}`,
    sendAfter: nextMidnight.toISOString(),
    title: dailyMatches.title,
    url: "/",
  });

  notificationReports.push({
    name: "daily-matches",
    ok: !dailyMatchesPush.error,
    error: dailyMatchesPush.error?.message,
    sendAfter: nextMidnight.toISOString(),
  });

  const dailyReminderPush = await sendPushToEveryone({
    body: dailyReminder.body,
    idempotencyKey: `daily-matches-reminder-${nextMorningKey}`,
    sendAfter: nextMorning.toISOString(),
    title: dailyReminder.title,
    url: "/",
  });

  notificationReports.push({
    name: "daily-matches-reminder",
    ok: !dailyReminderPush.error,
    error: dailyReminderPush.error?.message,
    sendAfter: nextMorning.toISOString(),
  });

  if (parisParts().day === 5) {
    const fifthDayTokens = notificationMessages.fifthDayTokens;
    const fifthDayTokensPush = await sendPushToEveryone({
      body: fifthDayTokens.body,
      idempotencyKey: `fifth-day-tokens-${parisDayKey()}`,
      title: fifthDayTokens.title,
      url: "/",
    });

    notificationReports.push({
      name: "fifth-day-tokens",
      ok: !fifthDayTokensPush.error,
      error: fifthDayTokensPush.error?.message,
    });
  }

  return NextResponse.json({
    notifications: notificationReports,
  });
}
