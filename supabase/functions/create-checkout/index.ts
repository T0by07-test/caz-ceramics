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

      const adminPublic = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) return jsonResponse({ error: "Authentication required" }, 401);
    const user = userData.user;

    const body = rawBody;
    const { purpose, environment, returnUrl, paymentMethod, month, hosted } = body as {
      purpose: "drop_in" | "plan";
      environment: StripeEnv;
      returnUrl: string;
      paymentMethod?: "card" | "bizum";
      month?: string;
      hosted?: boolean;
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
    let dropInCount = 0;

    const metadata: Record<string, string> = {
      userId: user.id,
      purpose,
    };

    let bookingIds: string[] = [];
    if (purpose === "drop_in") {
      const rawIds = body.bookingIds as string[] | undefined;
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        return jsonResponse({ error: "Invalid bookingIds" }, 400);
      }
      bookingIds = Array.from(new Set(rawIds));
      if (bookingIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
        return jsonResponse({ error: "Invalid bookingIds" }, 400);
      }
      // Verify every booking belongs to this user and is a reserved drop-in
      const { data: bookings, error: bErr } = await admin
        .from("bookings")
        .select("id, student_id, source, status, class_id")
        .in("id", bookingIds);
      if (bErr || !bookings || bookings.length !== bookingIds.length) {
        return jsonResponse({ error: "Booking not found" }, 404);
      }
      for (const booking of bookings) {
        if (booking.student_id !== user.id) return jsonResponse({ error: "Not your booking" }, 403);
        if (booking.source !== "drop_in" || booking.status !== "reserved") {
          return jsonResponse({ error: "Booking is not pending payment" }, 400);
        }
      }
      // Fetch each class's audience so kids classes are priced individually.
      const classIds = Array.from(new Set(bookings.map((b) => b.class_id)));
      const { data: classes } = await admin
        .from("classes")
        .select("id, audience")
        .in("id", classIds);
      const audienceByClass = new Map((classes ?? []).map((c) => [c.id, c.audience]));
      const kidsCount = bookings.filter((b) => audienceByClass.get(b.class_id) === "kids").length;
      const adultCount = bookings.length - kidsCount;
      dropInCount = bookings.length;
      metadata.bookingIds = bookingIds.join(",");
      metadata.classCount = String(bookingIds.length);
      metadata.adultCount = String(adultCount);
      metadata.kidsCount = String(kidsCount);
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

    // Resolve a Stripe price from its human-readable lookup key.
    const resolvePrice = async (lookupKey: string) => {
      const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
      if (!prices.data.length) throw new Error(`Price ${lookupKey} not found in Stripe`);
      return prices.data[0];
    };

    // Tiered monthly pricing for a selection of classes:
    // 1 -> 30 €, 2 -> 55 €, 3 -> 70 €, 4 -> 85 €; every extra class 20 €.
    const lineItems: { price: string; quantity: number }[] = [];
    let totalCents = 0;
    if (purpose === "drop_in") {
      const tier = Math.min(dropInCount, 4);
      const tierPrice = await resolvePrice(`plan_${tier}_class_month`);
      lineItems.push({ price: tierPrice.id, quantity: 1 });
      totalCents += tierPrice.unit_amount ?? 0;
      const extras = dropInCount - tier;
      if (extras > 0) {
        const extraPrice = await resolvePrice("drop_in_class_single");
        lineItems.push({ price: extraPrice.id, quantity: extras });
        totalCents += (extraPrice.unit_amount ?? 0) * extras;
      }
    } else {
      const planPrice = await resolvePrice(priceId);
      lineItems.push({ price: planPrice.id, quantity: 1 });
      totalCents += planPrice.unit_amount ?? 0;
    }

    const sessionParams: Record<string, unknown> = {
      line_items: lineItems,

      mode: "payment",
      customer_email: user.email ?? undefined,
      metadata,
    };
    if (hosted === true) {
      // Embedded Checkout cannot run inside an iFrame (Lovable editor/preview),
      // so the client can ask for a top-level hosted Checkout URL instead.
      const sep = returnUrl.includes("?") ? "&" : "?";
      sessionParams.success_url = returnUrl;
      sessionParams.cancel_url = `${returnUrl.split("?")[0]}${sep}pago=cancelado`;
    } else {
      sessionParams.ui_mode = "embedded";
      sessionParams.return_url = returnUrl;
    }
    if (paymentMethod) {
      sessionParams.payment_method_types = [paymentMethod];
    }
    const session = await stripe.checkout.sessions.create(sessionParams);

    // Insert pending payment row(s). Idempotency on (stripe_session_id, booking_id).
    // A drop-in checkout gets one row per booked class so per-class amounts and
    // attendance/refund records stay granular even though it's a single Stripe charge.
    const basePaymentRow: Record<string, unknown> = {
      student_id: user.id,
      amount_cents:
        purpose === "drop_in" && dropInCount > 0
          ? Math.round(totalCents / dropInCount)
          : totalCents,

      status: "pending",
      stripe_session_id: session.id,
    };
    if (paymentMethod) basePaymentRow.method = paymentMethod;
    if (purpose === "drop_in") {
      await admin
        .from("payments")
        .insert(bookingIds.map((bookingId) => ({ ...basePaymentRow, booking_id: bookingId })));
    } else {
      await admin.from("payments").insert(basePaymentRow);
    }

    return jsonResponse({
      clientSecret: session.client_secret,
      url: session.url,
      sessionId: session.id,
    });
  } catch (e) {
    console.error("create-checkout error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
