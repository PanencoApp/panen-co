export const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";
export const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

export const stripeMonthlyPriceId =
  process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID ??
  "price_1U9ilhFON9sMTBN6gOTtBWeb";

export const stripeAnnualPriceId =
  process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID ??
  "price_1U9imYFON9sMTBN6l1MLzWOx";

export const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://panen-co.vercel.app";

export const isStripeConfigured = Boolean(
  stripeSecretKey && stripeMonthlyPriceId && stripeAnnualPriceId,
);
