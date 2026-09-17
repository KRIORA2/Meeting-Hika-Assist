import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { requireAuth } from "../lib/auth";
import {
  applyFreePlan,
  applyProSubscription,
  ensureUserAccount,
  getUserAccount,
  grantCredits,
  PLAN_CREDITS,
  PLAN_PRICES,
  SESSION_PACK_CREDITS,
} from "../lib/store";
import { logger } from "../lib/logger";

const router = Router();

const WEB_APP_URL = process.env.HIKA_WEB_APP_URL || process.env.VITE_WEB_APP_URL || "http://localhost:5173";

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

function billingConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY
    && (process.env.STRIPE_PRICE_PRO_MONTHLY || process.env.STRIPE_PRICE_PRO_YEARLY || process.env.STRIPE_PRICE_SESSION),
  );
}

router.get("/billing/plans", (_req, res) => {
  res.json({
    configured: billingConfigured(),
    plans: [
      {
        id: "free",
        name: "Free",
        priceMonthly: 0,
        credits: PLAN_CREDITS.free,
        features: ["Sign in and dashboard", "50 credits each month", "Live transcript", "On-screen answers"],
      },
      {
        id: "session",
        name: "Per session",
        priceInr: PLAN_PRICES.sessionInr,
        credits: SESSION_PACK_CREDITS,
        features: [
          "Pay only when you meet",
          `${SESSION_PACK_CREDITS} credits for one session`,
          "GPT-4.1 answers on screen",
          "Resume and JD are read as text",
        ],
      },
      {
        id: "pro",
        name: "Pro",
        priceMonthly: PLAN_PRICES.proMonthlyUsd,
        priceYearly: PLAN_PRICES.proYearlyUsd,
        credits: PLAN_CREDITS.pro,
        features: [
          "Desktop overlay during real meetings",
          "500 credits each month",
          "GPT-4.1 on-screen answers",
          "Resume and JD persona",
          "Documents and history",
        ],
      },
    ],
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const account = await ensureUserAccount(req.authUser!.id, req.authUser!.email, req.authUser!.provider);
  res.json({
    email: req.authUser!.email,
    plan: account.plan,
    credits: account.credits,
    creditsResetAt: account.creditsResetAt,
    billingConfigured: billingConfigured(),
  });
});

router.post("/billing/checkout", requireAuth, async (req, res) => {
  const stripe = stripeClient();
  const product = req.body?.plan === "session" ? "session" : "pro";
  const interval = req.body?.interval === "year" ? "year" : "month";
  const priceId = product === "session"
    ? process.env.STRIPE_PRICE_SESSION
    : interval === "year"
      ? process.env.STRIPE_PRICE_PRO_YEARLY
      : process.env.STRIPE_PRICE_PRO_MONTHLY;

  if (!stripe || !priceId) {
    res.status(503).json({
      error: "Checkout is not live yet. Add Stripe keys to enable payments.",
      configured: false,
    });
    return;
  }

  try {
    const account = await getUserAccount(req.authUser!.id);
    const session = await stripe.checkout.sessions.create({
      mode: product === "session" ? "payment" : "subscription",
      customer: account.stripeCustomerId || undefined,
      customer_email: account.stripeCustomerId ? undefined : req.authUser!.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${WEB_APP_URL}/pricing?success=1`,
      cancel_url: `${WEB_APP_URL}/pricing?canceled=1`,
      metadata: { userId: req.authUser!.id, product },
      ...(product === "pro" ? { subscription_data: { metadata: { userId: req.authUser!.id, product: "pro" } } } : {}),
    });
    res.json({ checkoutUrl: session.url, configured: true });
  } catch (error) {
    logger.error({ err: error }, "Stripe checkout failed");
    res.status(502).json({ error: "Could not start checkout. Try again in a moment." });
  }
});

router.post("/billing/portal", requireAuth, async (req, res) => {
  const stripe = stripeClient();
  const account = await getUserAccount(req.authUser!.id);
  if (!stripe || !account.stripeCustomerId) {
    res.status(503).json({ error: "Billing portal is available after a Pro purchase." });
    return;
  }
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: `${WEB_APP_URL}/settings`,
    });
    res.json({ portalUrl: portal.url });
  } catch (error) {
    logger.error({ err: error }, "Stripe portal failed");
    res.status(502).json({ error: "Could not open billing portal." });
  }
});

export async function stripeWebhook(req: Request, res: Response) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    res.status(503).json({ error: "Webhook is not configured." });
    return;
  }
  const signature = req.header("stripe-signature");
  if (!signature) {
    res.status(400).json({ error: "Missing Stripe signature." });
    return;
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, secret);
  } catch (error) {
    logger.error({ err: error }, "Stripe webhook signature failed");
    res.status(400).json({ error: "Invalid Stripe signature." });
    return;
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const product = session.metadata?.product;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
      if (userId && product === "session") {
        await grantCredits(userId, SESSION_PACK_CREDITS);
      } else if (userId && customerId && subscriptionId) {
        await applyProSubscription(userId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        });
      }
    } else if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | { id?: string; metadata?: Record<string, string> };
        subscription_details?: { metadata?: Record<string, string> };
      };
      const userId = invoice.subscription_details?.metadata?.userId
        || (typeof invoice.subscription === "object" ? invoice.subscription?.metadata?.userId : undefined);
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      const subscriptionId = typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;
      if (userId && customerId && subscriptionId) {
        await applyProSubscription(userId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        });
      }
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId;
      if (userId) await applyFreePlan(userId);
    }
  } catch (error) {
    logger.error({ err: error, type: event.type }, "Stripe webhook handling failed");
    res.status(500).json({ error: "Webhook handling failed." });
    return;
  }

  res.json({ received: true });
}

export default router;
