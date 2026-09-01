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

function parisHour(date = new Date()) {
  const hour = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Europe/Paris",
  }).format(date);

  return Number(hour);
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

  const dayKey = parisDayKey();
  const hour = parisHour();
  const dailyMatches = notificationMessages.dailyMatches;
  const dailyReminder = notificationMessages.dailyMatchesReminder;
  const notificationReports = [];

  if (hour === 0) {
    const dailyMatchesPush = await sendPushToEveryone({
      body: dailyMatches.body,
      idempotencyKey: `daily-matches-${dayKey}`,
      title: dailyMatches.title,
      url: "/",
    });

    notificationReports.push({
      name: "daily-matches",
      ok: !dailyMatchesPush.error,
      error: dailyMatchesPush.error?.message,
    });
  }

  if (hour === 9) {
    const dailyReminderPush = await sendPushToEveryone({
      body: dailyReminder.body,
      idempotencyKey: `daily-matches-reminder-${dayKey}`,
      title: dailyReminder.title,
      url: "/",
    });

    notificationReports.push({
      name: "daily-matches-reminder",
      ok: !dailyReminderPush.error,
      error: dailyReminderPush.error?.message,
    });
  }

  if (parisParts().day === 5 && hour === 9) {
    const fifthDayTokens = notificationMessages.fifthDayTokens;
    const fifthDayTokensPush = await sendPushToEveryone({
      body: fifthDayTokens.body,
      idempotencyKey: `fifth-day-tokens-${dayKey}`,
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
    hour,
    notifications: notificationReports,
  });
}
