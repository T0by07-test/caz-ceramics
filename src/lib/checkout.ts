import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";

type PaymentMethod = "card" | "bizum";

type CreateDropInArgs = {
  bookingId: string;
  returnUrl: string;
  paymentMethod?: PaymentMethod;
};
type CreatePlanArgs = {
  planId: string;
  returnUrl: string;
  paymentMethod?: PaymentMethod;
  /** First day of the target month, "YYYY-MM-01". Defaults to the current month. */
  month?: string;
};

export async function createDropInCheckout({
  bookingId,
  returnUrl,
  paymentMethod,
}: CreateDropInArgs) {
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      purpose: "drop_in",
      bookingId,
      returnUrl,
      ...(paymentMethod ? { paymentMethod } : {}),
      environment: getStripeEnvironment(),
    },
  });
  if (error) throw new Error(error.message);
  if (!data?.clientSecret) throw new Error(data?.error ?? "No clientSecret returned");
  return data as { clientSecret: string; sessionId: string };
}

export async function createPlanCheckout({ planId, returnUrl, paymentMethod, month }: CreatePlanArgs) {
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      purpose: "plan",
      planId,
      returnUrl,
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(month ? { month } : {}),
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