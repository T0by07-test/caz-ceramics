import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";

type PaymentMethod = "card" | "bizum";

type CreateDropInArgs = { bookingId: string; returnUrl: string };
type CreatePlanArgs = { planId: string; returnUrl: string; paymentMethod?: PaymentMethod };

export async function createDropInCheckout({ bookingId, returnUrl }: CreateDropInArgs) {
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      purpose: "drop_in",
      bookingId,
      returnUrl,
      environment: getStripeEnvironment(),
    },
  });
  if (error) throw new Error(error.message);
  if (!data?.clientSecret) throw new Error(data?.error ?? "No clientSecret returned");
  return data as { clientSecret: string; sessionId: string };
}

export async function createPlanCheckout({ planId, returnUrl, paymentMethod }: CreatePlanArgs) {
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      purpose: "plan",
      planId,
      returnUrl,
      ...(paymentMethod ? { paymentMethod } : {}),
      environment: getStripeEnvironment(),
    },
  });
  if (error) throw new Error(error.message);
  if (!data?.clientSecret) throw new Error(data?.error ?? "No clientSecret returned");
  return data as { clientSecret: string; sessionId: string };
}

type CreateTrialArgs = { classId: string; email: string; name?: string; returnUrl: string };

/** Public (no account needed) hosted Stripe Checkout for a single trial class. */
export async function createTrialCheckout({ classId, email, name, returnUrl }: CreateTrialArgs) {
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      purpose: "public_trial",
      classId,
      email,
      name,
      returnUrl,
      environment: getStripeEnvironment(),
    },
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error(data?.error ?? "No checkout URL returned");
  return data as { url: string; sessionId: string };
}