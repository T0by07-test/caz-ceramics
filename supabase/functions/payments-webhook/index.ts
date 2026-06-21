import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, verifyWebhook } from "../_shared/stripe.ts";

let _admin: ReturnType<typeof createClient> | null = null;
function admin() {
  if (!_admin) {
    _admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _admin;
}

async function handleSessionCompleted(session: any, _env: StripeEnv) {
  const md = (session.metadata ?? {}) as Record<string, string>;
  const sessionId = session.id as string;
  const purpose = md.purpose;

  if (purpose === "drop_in") {
    await admin().rpc("confirm_drop_in_booking", { p_session_id: sessionId });
  } else if (purpose === "plan") {
    const studentId = md.userId;
    const planId = md.planId;
    if (!studentId || !planId) {
      console.error("Missing metadata for plan checkout", { sessionId });
      return;
    }
    await admin().rpc("grant_plan_subscription", {
      p_session_id: sessionId,
      p_student_id: studentId,
      p_plan_id: planId,
    });
  } else {
    console.warn("Unknown purpose in metadata", { sessionId, purpose });
    return;
  }

  // Record the real paid amount on the payment row (the confirming RPCs above
  // leave amount_cents at 0). amount_total is in cents; guard against null.
  const amountTotal = session.amount_total as number | null | undefined;
  if (amountTotal != null) {
    const { error: amountError } = await admin()
      .from("payments")
      .update({ amount_cents: amountTotal })
      .eq("stripe_session_id", sessionId);
    if (amountError) {
      console.error("Failed to record payment amount", { sessionId, amountError });
    }
  } else {
    console.warn("Stripe session has no amount_total to record", { sessionId });
  }
}

async function handleSessionFailed(session: any, _env: StripeEnv) {
  await admin().rpc("fail_payment", { p_session_id: session.id });
}

async function handle(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "checkout.session.completed":
      await handleSessionCompleted(event.data.object, env);
      break;
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      await handleSessionFailed(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    return new Response(JSON.stringify({ received: true, ignored: "invalid env" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    await handle(req, rawEnv as StripeEnv);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});
