type PushTarget =
  | {
      externalUserIds: string[];
      includedSegments?: never;
    }
  | {
      externalUserIds?: never;
      includedSegments: string[];
    };

type SendPushInput = {
  body: string;
  idempotencyKey?: string;
  sendAfter?: string;
  target: PushTarget;
  title: string;
  url?: string;
};

const oneSignalAppId =
  process.env.ONESIGNAL_APP_ID ??
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ??
  "";
const oneSignalRestApiKey = process.env.ONESIGNAL_REST_API_KEY ?? "";

export const isOneSignalConfigured = Boolean(
  oneSignalAppId && oneSignalRestApiKey,
);

export async function sendPushNotification({
  body,
  idempotencyKey,
  sendAfter,
  target,
  title,
  url = "/",
}: SendPushInput) {
  if (!isOneSignalConfigured) {
    return {
      data: null,
      error: new Error("Configuration OneSignal incomplète."),
    };
  }

  const payload = {
    app_id: oneSignalAppId,
    contents: {
      en: body,
      fr: body,
    },
    headings: {
      en: title,
      fr: title,
    },
    idempotency_key: idempotencyKey,
    send_after: sendAfter,
    target_channel: "push",
    url,
    ...(target.externalUserIds
      ? {
          include_aliases: {
            external_id: target.externalUserIds,
          },
        }
      : {
          included_segments: target.includedSegments,
        }),
  };

  const response = await fetch("https://api.onesignal.com/notifications?c=push", {
    body: JSON.stringify(payload),
    headers: {
      Authorization: `Key ${oneSignalRestApiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const data = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    return {
      data,
      error: new Error("Notification OneSignal non envoyée."),
    };
  }

  return {
    data,
    error: null,
  };
}

export function sendPushToUsers({
  body,
  idempotencyKey,
  title,
  url,
  userIds,
}: {
  body: string;
  idempotencyKey?: string;
  title: string;
  url?: string;
  userIds: string[];
}) {
  const uniqueUserIds = Array.from(new Set(userIds)).filter(Boolean);

  if (uniqueUserIds.length === 0) {
    return Promise.resolve({ data: null, error: null });
  }

  return sendPushNotification({
    body,
    idempotencyKey,
    target: {
      externalUserIds: uniqueUserIds,
    },
    title,
    url,
  });
}

export function sendPushToEveryone({
  body,
  idempotencyKey,
  sendAfter,
  title,
  url,
}: {
  body: string;
  idempotencyKey?: string;
  sendAfter?: string;
  title: string;
  url?: string;
}) {
  return sendPushNotification({
    body,
    idempotencyKey,
    sendAfter,
    target: {
      includedSegments: ["Subscribed Users"],
    },
    title,
    url,
  });
}

