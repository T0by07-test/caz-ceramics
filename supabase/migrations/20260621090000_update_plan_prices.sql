-- Update monthly plan prices (display values in plans.price_cents).
-- Plan 1 clase/mes stays 35 €. New: 2->50 €, 3->65 €, 4->80 €.
-- NOTE: this only changes the DISPLAYED price. The amount actually charged comes
-- from the Stripe Price behind each plan's lookup key (plan_N_class_month). The
-- matching Stripe Prices MUST be updated in the Stripe dashboard to 50/65/80 €
-- so the charge matches the display.

UPDATE public.plans SET price_cents = 5000 WHERE classes_per_month = 2;
UPDATE public.plans SET price_cents = 6500 WHERE classes_per_month = 3;
UPDATE public.plans SET price_cents = 8000 WHERE classes_per_month = 4;
