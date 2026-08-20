import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _admin: ReturnType<typeof createClient<Database>> | null = null;
function admin() {
  if (!_admin) {
    _admin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _admin;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** Mirrors a confirmed Stripe payment into the admin income ledger (/admin/registro). */
async function recordLedgerIncome(params: {
  studentName: string;
  item: string;
  category: string;
  amountCents: number;
  notes?: string;
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
    method: "T",
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
      surname: rest.join(" ") || "-",
      email: email ?? "",
      message: `Clase de prueba pagada (${(amount / 100).toFixed(2)} €) · ${md.classDate ?? ""} ${md.classTime ?? ""}`.trim(),
      status: "pending",
    })
    .select("id")
    .single();
  if (reqError || !request) {
    console.error("Failed to create trial enrollment request", reqError);
    return;
  }
  const requestId = (request as { id: string }).id;
  if (md.classId) {
    const { error: linkError } = await admin()
      .from("enrollment_request_classes")
      .insert({ request_id: requestId, class_id: md.classId, granted: false });
    if (linkError) console.error("Failed to link trial class", linkError);
  }
  // Paid online → no manual review needed: accept the request and create the invite.
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

async function handleSessionCompleted(session: any) {
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

  const amountForLedger = (session.amount_total as number | null) ?? 0;
  if (md.userId) {
    const { data: profile } = await admin()
      .from("profiles")
      .select("name, surname")
      .eq("id", md.userId)
      .maybeSingle();
    const p = profile as { name?: string; surname?: string } | null;
    const studentName =
      [p?.name, p?.surname].filter(Boolean).join(" ") ||
      session.customer_details?.email ||
      "Alumna";
    await recordLedgerIncome({
      studentName,
      item: purpose === "plan" ? "Plan mensual" : "Clase suelta",
      category: purpose === "plan" ? "Clases" : "Suelta",
      amountCents: amountForLedger,
      stripeSessionId: sessionId,
    });
  }

  const amountTotal = session.amount_total as number | null | undefined;
  if (amountTotal != null) {
    const { error: amountError } = await admin()
      .from("payments")
      .update({ amount_cents: amountTotal })
      .eq("stripe_session_id", sessionId);
    if (amountError) console.error("Failed to record payment amount", { sessionId, amountError });
  }
}

async function handle(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleSessionCompleted(event.data.object);
      break;
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      await admin().rpc("fail_payment", { p_session_id: event.data.object.id });
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handle(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});