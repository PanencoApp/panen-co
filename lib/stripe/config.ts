export const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";
export const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

export const stripeMonthlyPriceId =
  process.env.STRIPE_PRICE_MONTHLY_ID ??
  "price_1U9je7FON9sMTBN6AUloFZ7x";

export const stripeAnnualPriceId =
  process.env.STRIPE_PRICE_YEARLY_ID ??
  "price_1U9jfeFON9sMTBN6MJZYTjt5";

export const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://panen-co.vercel.app";

export const isStripeConfigured = Boolean(
  stripeSecretKey && stripeMonthlyPriceId && stripeAnnualPriceId,
);
