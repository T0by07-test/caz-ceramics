// Block B3 — payment reminder (admin only).
// Verifies the caller is an admin, creates a Stripe *hosted* Checkout link for a
// plan (reusing the create-checkout 'plan' logic + _shared/stripe), and enqueues
// a 'payment_reminder' notification for the student via enqueue_notification.
// Returns { ok: true }.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Authentication required" }, 401);

    // Caller-scoped client (uses the user's JWT) to identify who is calling.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    // Service-role client for privileged reads + the enqueue RPC.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) return jsonResponse({ error: "Authentication required" }, 401);
    const user = userData.user;

    // Verify the caller is an admin.
    const { data: callerProfile, error: roleErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (roleErr) return jsonResponse({ error: "Failed to verify admin" }, 500);
    if (!callerProfile || callerProfile.role !== "admin") {
      return jsonResponse({ error: "Admin access required" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as {
      student_id?: string;
      plan_id?: string;
      environment?: StripeEnv;
    };
    const { student_id, plan_id } = body;
    // Environment: accept an explicit value from the caller (frontend passes
    // getStripeEnvironment()), default to "live".
    const environment: StripeEnv = body.environment === "sandbox" ? "sandbox" : "live";

    if (!student_id || !UUID_RE.test(student_id)) {
      return jsonResponse({ error: "Invalid student_id" }, 400);
    }
    if (!plan_id || !UUID_RE.test(plan_id)) {
      return jsonResponse({ error: "Invalid plan_id" }, 400);
    }

    // Load the target student (name for the message, email for the Stripe session).
    const { data: student, error: sErr } = await admin
      .from("profiles")
      .select("id, name, email")
      .eq("id", student_id)
      .maybeSingle();
    if (sErr || !student) return jsonResponse({ error: "Student not found" }, 404);

    // Load the plan + its Stripe price lookup key (same as create-checkout 'plan').
    const { data: plan, error: pErr } = await admin
      .from("plans")
      .select("id, name, stripe_price_id, active")
      .eq("id", plan_id)
      .maybeSingle();
    if (pErr || !plan || !plan.active) return jsonResponse({ error: "Plan not available" }, 404);

    const stripe = createStripeClient(environment);

    // Resolve the human-readable price id via lookup_keys (same pattern as create-checkout).
    const prices = await stripe.prices.list({ lookup_keys: [plan.stripe_price_id], limit: 1 });
    if (!prices.data.length) {
      return jsonResponse({ error: `Price ${plan.stripe_price_id} not found in Stripe` }, 500);
    }
    const stripePrice = prices.data[0];
    const amountCents = stripePrice.unit_amount ?? 0;

    // Hosted Checkout link the student can open straight from the reminder.
    const appBase = Deno.env.get("APP_BASE_URL") ?? new URL(req.url).origin;
    const baseTrimmed = appBase.replace(/\/+$/, "");
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: "payment",
      ui_mode: "hosted",
      success_url: `${baseTrimmed}/app?payment=success`,
      cancel_url: `${baseTrimmed}/app?payment=cancelled`,
      customer_email: student.email ?? undefined,
      metadata: {
        userId: student.id,
        purpose: "plan",
        planId: plan.id,
      },
    });

    const paymentUrl = session.url;
    if (!paymentUrl) return jsonResponse({ error: "Stripe did not return a checkout URL" }, 500);

    // Record a pending payment row (idempotent on stripe_session_id), mirroring create-checkout.
    await admin.from("payments").insert({
      student_id: student.id,
      amount_cents: amountCents,
      status: "pending",
      stripe_session_id: session.id,
    });

    // Enqueue the reminder notification. enqueue_notification fans out per-channel
    // based on the student's preference and dedups on (student|type|channel|suffix).
    // Use the session id as the dedup suffix so each new reminder enqueues fresh.
    const { error: enqErr } = await admin.rpc("enqueue_notification", {
      p_student_id: student.id,
      p_type: "payment_reminder",
      p_payload: {
        payment_url: paymentUrl,
        plan_name: plan.name,
        amount_cents: amountCents,
      },
      p_dedup_suffix: session.id,
    });
    if (enqErr) return jsonResponse({ error: enqErr.message }, 500);

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("send-payment-reminder error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
