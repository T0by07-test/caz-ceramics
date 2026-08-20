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

const TRIAL_PRICE_LOOKUP_KEY = "trial_class_single";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const rawBody = await req.json();

    // Public (no account) hosted Checkout for a single trial class booked from the landing page.
    if (rawBody?.purpose === "public_trial") {
      const { classId, email, name, environment, returnUrl } = rawBody as {
        classId?: string;
        email?: string;
        name?: string;
        environment?: StripeEnv;
        returnUrl?: string;
      };
      if (environment !== "sandbox" && environment !== "live") {
        return jsonResponse({ error: "Invalid environment" }, 400);
      }
      if (typeof returnUrl !== "string" || !returnUrl.startsWith("http")) {
        return jsonResponse({ error: "Invalid returnUrl" }, 400);
      }
      if (!classId || !/^[0-9a-f-]{36}$/i.test(classId)) {
        return jsonResponse({ error: "Invalid classId" }, 400);
      }
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return jsonResponse({ error: "Invalid email" }, 400);
      }

      const adminPublic = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: klass, error: cErr } = await adminPublic
        .from("classes")
        .select("id, date, start_time, status, capacity_max")
        .eq("id", classId)
        .single();
      if (cErr || !klass || klass.status !== "scheduled") {
        return jsonResponse({ error: "Class not available" }, 404);
      }

      // Don't sell a trial seat for a class that is already full.
      const { count: bookedCount } = await adminPublic
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("class_id", classId)
        .in("status", ["reserved", "confirmed", "attended"]);
      if ((bookedCount ?? 0) >= (klass.capacity_max ?? 7)) {
        return jsonResponse({ error: "Class full" }, 409);
      }

      const publicStripe = createStripeClient(environment);
      const trialPrices = await publicStripe.prices.list({
        lookup_keys: [TRIAL_PRICE_LOOKUP_KEY],
        limit: 1,
      });
      if (!trialPrices.data.length) {
        return jsonResponse({ error: `Price ${TRIAL_PRICE_LOOKUP_KEY} not found in Stripe` }, 500);
      }
      const publicSession = await publicStripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: trialPrices.data[0].id, quantity: 1 }],
        customer_email: email,
        success_url: `${returnUrl}?pago=ok`,
        cancel_url: `${returnUrl}?pago=cancelado`,
        payment_intent_data: { description: "Clase de prueba de cerámica (2 h)" },
        metadata: {
          purpose: "public_trial",
          classId,
          email,
          name: name ?? "",
          classDate: String(klass.date),
          classTime: String(klass.start_time).slice(0, 5),
        },
      });
      return jsonResponse({ url: publicSession.url, sessionId: publicSession.id });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Authentication required" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) return jsonResponse({ error: "Authentication required" }, 401);
    const user = userData.user;

    const body = rawBody;
    const { purpose, environment, returnUrl, paymentMethod, month } = body as {
      purpose: "drop_in" | "plan";
      environment: StripeEnv;
      returnUrl: string;
      paymentMethod?: "card" | "bizum";
      month?: string;
    };
    if (environment !== "sandbox" && environment !== "live") {
      return jsonResponse({ error: "Invalid environment" }, 400);
    }
    if (typeof returnUrl !== "string" || !returnUrl.startsWith("http")) {
      return jsonResponse({ error: "Invalid returnUrl" }, 400);
    }
    // Optional explicit payment method. When absent we keep Stripe's default behavior.
    // NOTE: Bizum must be enabled in the Stripe account, and inside embedded Checkout it
    // may behave as a redirect-based method.
    if (paymentMethod !== undefined && paymentMethod !== "card" && paymentMethod !== "bizum") {
      return jsonResponse({ error: "Invalid paymentMethod" }, 400);
    }
    // Optional target month for a plan purchase ("YYYY-MM-01"). The database
    // enforces which months are actually allowed (current, or next from day 20).
    if (month !== undefined && !/^\d{4}-\d{2}-01$/.test(month)) {
      return jsonResponse({ error: "Invalid month" }, 400);
    }

    const stripe = createStripeClient(environment);
    let priceId: string;
    const metadata: Record<string, string> = {
      userId: user.id,
      purpose,
    };

    if (purpose === "drop_in") {
      const bookingId = body.bookingId as string | undefined;
      if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
        return jsonResponse({ error: "Invalid bookingId" }, 400);
      }
      // Verify the booking belongs to this user and is reserved drop-in
      const { data: booking, error: bErr } = await admin
        .from("bookings")
        .select("id, student_id, source, status")
        .eq("id", bookingId)
        .single();
      if (bErr || !booking) return jsonResponse({ error: "Booking not found" }, 404);
      if (booking.student_id !== user.id) return jsonResponse({ error: "Not your booking" }, 403);
      if (booking.source !== "drop_in" || booking.status !== "reserved") {
        return jsonResponse({ error: "Booking is not pending payment" }, 400);
      }
      priceId = "drop_in_class_single";
      metadata.bookingId = bookingId;
    } else if (purpose === "plan") {
      const planId = body.planId as string | undefined;
      if (!planId || !/^[0-9a-f-]{36}$/i.test(planId)) {
        return jsonResponse({ error: "Invalid planId" }, 400);
      }
      const { data: plan, error: pErr } = await admin
        .from("plans")
        .select("id, stripe_price_id, active")
        .eq("id", planId)
        .single();
      if (pErr || !plan || !plan.active) return jsonResponse({ error: "Plan not available" }, 404);
      priceId = plan.stripe_price_id;
      metadata.planId = planId;
      if (month) metadata.month = month;
    } else {
      return jsonResponse({ error: "Invalid purpose" }, 400);
    }

    // Resolve human-readable price id via lookup_keys
    const prices = await stripe.prices.list({ lookup_keys: [priceId], limit: 1 });
    if (!prices.data.length) return jsonResponse({ error: `Price ${priceId} not found in Stripe` }, 500);
    const stripePrice = prices.data[0];

    const sessionParams: Record<string, unknown> = {
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: "payment",
      ui_mode: "embedded",
      return_url: returnUrl,
      customer_email: user.email ?? undefined,
      metadata,
    };
    if (paymentMethod) {
      sessionParams.payment_method_types = [paymentMethod];
    }
    const session = await stripe.checkout.sessions.create(sessionParams);

    // Insert pending payment row (idempotency on stripe_session_id)
    const paymentRow: Record<string, unknown> = {
      student_id: user.id,
      amount_cents: stripePrice.unit_amount ?? 0,
      status: "pending",
      stripe_session_id: session.id,
    };
    if (paymentMethod) paymentRow.method = paymentMethod;
    if (purpose === "drop_in") paymentRow.booking_id = metadata.bookingId;
    await admin.from("payments").insert(paymentRow);

    return jsonResponse({ clientSecret: session.client_secret, sessionId: session.id });
  } catch (e) {
    console.error("create-checkout error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});