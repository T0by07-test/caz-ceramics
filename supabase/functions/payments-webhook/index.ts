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

function monthKey(date: string): string {
  return date.slice(0, 7);
}

// Mirrors a confirmed Stripe payment into the admin income ledger (/admin/registro).
async function recordLedgerIncome(params: {
  studentName: string;
  item: string;
  category: string;
  amountCents: number;
  method?: string;
  notes?: string;
  /** Idempotency key so Stripe retries don't duplicate the income row. */
  stripeSessionId?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const row = {
    entry_date: today,
    month: monthKey(today),
    student_name: params.studentName,
    item: params.item,
    category: params.category,
    amount_cents: params.amountCents,
    method: params.method ?? "T",
    status: "Pagado",
    notes: params.notes ?? "Cobro automático con Stripe",
    stripe_session_id: params.stripeSessionId ?? null,
  };
  const { error } = params.stripeSessionId
    ? await admin()
        .from("ledger_entries")
        .upsert(row, { onConflict: "stripe_session_id", ignoreDuplicates: true })
    : await admin().from("ledger_entries").insert(row);
  if (error) console.error("Failed to record ledger income", error);
}

// Public trial class paid from the landing page (buyer has no account yet):
// register it as a pending enrollment request linked to the chosen class so the
// studio owner can review it and send the invite.
async function handlePublicTrial(session: any) {
  const md = (session.metadata ?? {}) as Record<string, string>;
  const email = md.email ?? session.customer_details?.email ?? null;
  const fullName = (md.name ?? "").trim();
  const [name, ...rest] = fullName.split(/\s+/);
  const amount = (session.amount_total as number | null) ?? 0;

  const { data: request, error: reqError } = await admin()
    .from("enrollment_requests")
    .insert({
      name: name || "Sin nombre",
      surname: rest.join(" ") || null,
      email,
      message: `Clase de prueba pagada (${(amount / 100).toFixed(2)} €) · ${md.classDate ?? ""} ${md.classTime ?? ""}`.trim(),
      status: "pending",
    })
    .select("id")
    .single();
  if (reqError || !request) {
    console.error("Failed to create trial enrollment request", reqError);
    return;
  }
  const requestId = request.id as string;
  if (md.classId) {
    const { error: linkError } = await admin()
      .from("enrollment_request_classes")
      .insert({ request_id: requestId, class_id: md.classId, granted: false });
    if (linkError) console.error("Failed to link trial class", linkError);
  }
  // Paid online → accept automatically and create the invite.
  const { error: acceptError } = await admin().rpc("accept_paid_enrollment_request", {
    p_request_id: requestId,
  });
  if (acceptError) console.error("Failed to auto-accept paid trial request", acceptError);
  await recordLedgerIncome({
    studentName: fullName || email || "Clase de prueba",
    item: "Clase de prueba",
    category: "Suelta",
    amountCents: amount,
    notes: `Clase de prueba pagada online · ${md.classDate ?? ""} ${md.classTime ?? ""}`.trim(),
    stripeSessionId: session.id as string,
  });
}

async function handleSessionCompleted(session: any, _env: StripeEnv) {
  const md = (session.metadata ?? {}) as Record<string, string>;
  const sessionId = session.id as string;
  const purpose = md.purpose;

  // Delayed-notification methods (e.g. SEPA) settle later; wait for the async event.
  if (session.payment_status === "unpaid") {
    console.log("Session not paid yet, waiting for settlement", { sessionId });
    return;
  }

  if (purpose === "public_trial") {
    await handlePublicTrial(session);
    return;
  }

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
      p_month: md.month ?? null,
    });
  } else {
    console.warn("Unknown purpose in metadata", { sessionId, purpose });
    return;
  }

  // Mirror the income into the admin ledger with the student's name.
  const amountForLedger = (session.amount_total as number | null) ?? 0;
  const classCount = Number(md.classCount ?? "1") || 1;
  if (md.userId) {
    const { data: profile } = await admin()
      .from("profiles")
      .select("name, surname")
      .eq("id", md.userId)
      .maybeSingle();
    const studentName = [profile?.name, profile?.surname].filter(Boolean).join(" ")
      || session.customer_details?.email
      || "Alumna";
    await recordLedgerIncome({
      studentName,
      item: purpose === "plan"
        ? "Plan mensual"
        : classCount > 1 ? `${classCount} clases sueltas` : "Clase suelta",
      category: purpose === "plan" ? "Clases" : "Suelta",
      amountCents: amountForLedger,
      stripeSessionId: sessionId,
    });
  }

  // Record the real paid amount on the plan's payment row (grant_plan_subscription
  // leaves amount_cents at 0 for that single row). Drop-in checkouts already carry
  // the correct per-class amount from creation time (one row per booked class), so
  // overwriting them here with the full session total would double-count a
  // multi-class purchase across its rows.
  if (purpose === "plan") {
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
