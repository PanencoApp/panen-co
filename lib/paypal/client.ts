const paypalClientId = process.env.PAYPAL_CLIENT_ID ?? "";
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET ?? "";
const paypalEnvironment = process.env.PAYPAL_ENVIRONMENT ?? "sandbox";

const paypalBaseUrl =
  paypalEnvironment === "production"
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
        sender_batch_id: withdrawalId,
      },
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
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
