-- Block A · A3.2 — Stripe plans lookup-key reconcile
--
-- The create-checkout Edge Function reads plans.stripe_price_id straight from
-- the DB and passes it to Stripe as a `lookup_key`
-- (stripe.prices.list({ lookup_keys: [priceId] })). So the value stored here
-- IS the Stripe lookup key that must exist on a real Price in the Stripe
-- dashboard.
--
-- Shared contract #3 / spec A3.1 fix the expected keys as:
--   plan_1_class_month, plan_2_class_month, plan_3_class_month, plan_4_class_month
-- (all singular "class"). An earlier reconcile migration accidentally stored
-- the 2/3/4-class tiers with a plural "classes" segment
-- (plan_2_classes_month, ...), which would never match the Stripe lookup key
-- the owner creates per the runbook. This migration normalises the active plan
-- rows to the contract values.
--
-- PRICES: amounts (price_cents) are intentionally LEFT AS-IS. The current
-- values (3500 / 6500 / 9000 / 11000 = 35 / 65 / 90 / 110 EUR) are placeholders
-- still to be CONFIRMED WITH THE OWNER (Cande) — see spec §6 Q1. The real
-- amounts live on the Stripe Price objects anyway; this table's price_cents is
-- display/seed only. The drop-in lookup key ('drop_in_class_single') is
-- hardcoded in create-checkout and is not stored here.
--
-- We do NOT invent real Stripe `price_…` IDs here: lookup keys are stable,
-- human-readable handles and are the correct contract surface.

-- Normalise the active plan tier rows to the canonical singular lookup keys.
UPDATE public.plans
   SET stripe_price_id = 'plan_' || classes_per_month || '_class_month'
 WHERE active = true
   AND classes_per_month BETWEEN 1 AND 4
   AND stripe_price_id IS DISTINCT FROM ('plan_' || classes_per_month || '_class_month');
