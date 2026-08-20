import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";

type PaymentMethod = "card" | "bizum";

type CreateDropInArgs = {
  bookingId: string;
  returnUrl: string;
  paymentMethod?: PaymentMethod;
  /** Ask for a top-level hosted Checkout URL instead of an embedded clientSecret. */
  hosted?: boolean;
};
type CreatePlanArgs = {
  planId: string;
  returnUrl: string;
  paymentMethod?: PaymentMethod;
  /** First day of the target month, "YYYY-MM-01". Defaults to the current month. */
  month?: string;
  hosted?: boolean;
};

export async function createDropInCheckout({
  bookingId,
  returnUrl,
  paymentMethod,
  hosted,
}: CreateDropInArgs) {
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      purpose: "drop_in",
      bookingId,
      returnUrl,
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(hosted ? { hosted: true } : {}),
      environment: getStripeEnvironment(),
    },
  });
  if (error) throw new Error(error.message);
  if (hosted) {
    if (!data?.url) throw new Error(data?.error ?? "No checkout URL returned");
  } else if (!data?.clientSecret) {
    throw new Error(data?.error ?? "No clientSecret returned");
  }
  return data as { clientSecret: string; url: string; sessionId: string };
}

export async function createPlanCheckout({
  planId,
  returnUrl,
  paymentMethod,
  month,
  hosted,
}: CreatePlanArgs) {
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      purpose: "plan",
      planId,
      returnUrl,
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(month ? { month } : {}),
      ...(hosted ? { hosted: true } : {}),
      environment: getStripeEnvironment(),
    },
  });
  if (error) throw new Error(error.message);
  if (hosted) {
    if (!data?.url) throw new Error(data?.error ?? "No checkout URL returned");
  } else if (!data?.clientSecret) {
    throw new Error(data?.error ?? "No clientSecret returned");
  }
  return data as { clientSecret: string; url: string; sessionId: string };
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