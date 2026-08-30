import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";

type PaymentMethod = "card" | "bizum";

/**
 * supabase-js's FunctionsHttpError.message is always the generic
 * "Edge Function returned a non-2xx status code", discarding the JSON body
 * our edge functions actually return (e.g. { error: "Authentication required" }).
 * Pull the real reason out of error.context (the raw Response) when present.
 */
async function functionErrorMessage(error: { message: string; context?: Response }) {
  if (error.context instanceof Response) {
    try {
      const body = await error.context.clone().json();
      if (typeof body?.error === "string") return body.error;
    } catch {
      // Body wasn't JSON (or already consumed) — fall through to the generic message.
    }
  }
  return error.message;
}

type CreateDropInArgs = {
  bookingIds: string[];
  returnUrl: string;
  paymentMethod?: PaymentMethod;
  /** Ask for a top-level hosted Checkout URL instead of an embedded clientSecret. */
  hosted?: boolean;
};

export async function createDropInCheckout({
  bookingIds,
  returnUrl,
  paymentMethod,
  hosted,
}: CreateDropInArgs) {
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      purpose: "drop_in",
      bookingIds,
      returnUrl,
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(hosted ? { hosted: true } : {}),
      environment: getStripeEnvironment(),
    },
  });
  if (error) throw new Error(await functionErrorMessage(error));
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
  if (error) throw new Error(await functionErrorMessage(error));
  if (!data?.url) throw new Error(data?.error ?? "No checkout URL returned");
  return data as { url: string; sessionId: string };
}
