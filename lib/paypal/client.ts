const paypalClientId = process.env.PAYPAL_CLIENT_ID ?? "";
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET ?? "";
const paypalEnvironment = (
  process.env.PAYPAL_ENVIRONMENT ??
  process.env.PAYPAL_MODE ??
  "sandbox"
).toLowerCase();
const paypalWebhookId = process.env.PAYPAL_WEBHOOK_ID ?? "";

const paypalBaseUrl =
  paypalEnvironment === "production" || paypalEnvironment === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

type PayPalOAuthResponse = {
  access_token?: string;
};

type PayPalPayoutResponse = {
  batch_header?: {
    payout_batch_id?: string;
    batch_status?: string;
  };
};

export const isPayPalConfigured = Boolean(paypalClientId && paypalClientSecret);
export const isPayPalLive = paypalBaseUrl === "https://api-m.paypal.com";
export const isPayPalWebhookConfigured = Boolean(paypalWebhookId);

async function getPayPalAccessToken() {
  if (!isPayPalConfigured) {
    throw new Error("Configuration PayPal incomplète.");
  }

  const credentials = Buffer.from(
    `${paypalClientId}:${paypalClientSecret}`,
  ).toString("base64");
  const response = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as
    | PayPalOAuthResponse
    | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error("Impossible d'authentifier PayPal.");
  }

  return payload.access_token;
}

export async function createPayPalPayout({
  amount,
  receiverEmail,
  withdrawalId,
}: {
  amount: number;
  receiverEmail: string;
  withdrawalId: string;
}) {
  const token = await getPayPalAccessToken();
  const senderBatchId = `panenco-withdrawal-${withdrawalId}`;
  const response = await fetch(`${paypalBaseUrl}/v1/payments/payouts`, {
    body: JSON.stringify({
      items: [
        {
          amount: {
            currency: "EUR",
            value: amount.toFixed(2),
          },
          note: "Retrait Panen&Co",
          receiver: receiverEmail,
          recipient_type: "EMAIL",
          recipient_wallet: "PAYPAL",
          sender_item_id: withdrawalId,
        },
      ],
      sender_batch_header: {
        email_message:
          "Ton retrait Panen&Co est en cours de traitement via PayPal.",
        email_subject: "Retrait Panen&Co",
        recipient_type: "EMAIL",
        sender_batch_id: senderBatchId,
      },
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": senderBatchId,
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as
    | PayPalPayoutResponse
    | null;

  if (!response.ok) {
    throw new Error("Impossible de créer le payout PayPal.");
  }

  return {
    batchId: payload?.batch_header?.payout_batch_id ?? "",
    status: payload?.batch_header?.batch_status ?? "PROCESSING",
  };
}

export async function verifyPayPalWebhook({
  authAlgo,
  certUrl,
  rawBody,
  transmissionId,
  transmissionSig,
  transmissionTime,
}: {
  authAlgo: string;
  certUrl: string;
  rawBody: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
}) {
  if (!isPayPalConfigured || !paypalWebhookId) {
    throw new Error("Configuration webhook PayPal incomplète.");
  }

  const token = await getPayPalAccessToken();
  const webhookEvent = JSON.parse(rawBody) as unknown;
  const response = await fetch(
    `${paypalBaseUrl}/v1/notifications/verify-webhook-signature`,
    {
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_event: webhookEvent,
        webhook_id: paypalWebhookId,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | { verification_status?: string }
    | null;

  return response.ok && payload?.verification_status === "SUCCESS";
}
