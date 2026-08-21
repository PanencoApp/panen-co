const mangopayClientId = process.env.MANGOPAY_CLIENT_ID ?? "";
const mangopayApiKey = process.env.MANGOPAY_API_KEY ?? "";
const mangopayEnvironment = process.env.MANGOPAY_ENVIRONMENT ?? "sandbox";

const mangopayBaseUrl =
  mangopayEnvironment === "production"
    ? "https://api.mangopay.com"
    : "https://api.sandbox.mangopay.com";

type MangopayOAuthResponse = {
  access_token?: string;
  AccessToken?: string;
  token_type?: string;
};

export type MangopayPayout = {
  Id: string;
  Status?: "CREATED" | "SUCCEEDED" | "FAILED";
  ResultCode?: string;
  ResultMessage?: string;
};

export const isMangopayConfigured = Boolean(mangopayClientId && mangopayApiKey);

async function getMangopayAccessToken() {
  if (!isMangopayConfigured) {
    throw new Error("Configuration Mangopay incomplète.");
  }

  const credentials = Buffer.from(
    `${mangopayClientId}:${mangopayApiKey}`,
  ).toString("base64");
  const response = await fetch(`${mangopayBaseUrl}/v2.01/oauth/token`, {
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as
    | MangopayOAuthResponse
    | null;
  const token = payload?.access_token ?? payload?.AccessToken;

  if (!response.ok || !token) {
    throw new Error("Impossible d'authentifier Mangopay.");
  }

  return token;
}

export async function getMangopayPayout(payoutId: string) {
  const token = await getMangopayAccessToken();
  const response = await fetch(
    `${mangopayBaseUrl}/v2.01/${mangopayClientId}/payouts/${payoutId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | MangopayPayout
    | null;

  if (!response.ok || !payload) {
    throw new Error("Impossible de lire le retrait Mangopay.");
  }

  return payload;
}
