// Phase 6: notification dispatcher.
// Pulls queued notification rows, renders Spanish templates, dispatches via
// Lovable Email (email) and Twilio (whatsapp). When a channel is not yet
// configured, the row is marked 'sent' with a skip marker so the queue does
// not endlessly retry — admins still see it in the log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Channel = "email" | "whatsapp";

interface QueueRow {
  id: string;
  student_id: string;
  type: string;
  channel: Channel;
  payload: Record<string, unknown>;
  retry_count: number;
}

interface Profile {
  email: string | null;
  whatsapp: string | null;
  name: string | null;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_API_KEY_SID = Deno.env.get("TWILIO_API_KEY_SID");
const TWILIO_API_KEY_SECRET = Deno.env.get("TWILIO_API_KEY_SECRET");
const TWILIO_WHATSAPP_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM");
// Resend (real email send, A1.2)
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Cazu Ceramics <noreply@cazuceramics.com>";
// Cron hardening (A2.3) — see shared contract: header "x-cron-secret".
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------- Spanish templates ----------
function fmtTime(t?: string): string {
  if (!t) return "";
  return t.slice(0, 5);
}
function fmtDate(d?: string): string {
  if (!d) return "";
  // Render YYYY-MM-DD as Spanish long date
  try {
    const date = new Date(`${d}T12:00:00`);
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(date);
  } catch {
    return d;
  }
}

interface Rendered {
  subject: string;
  text: string;
  html: string;
}

function render(type: string, payload: Record<string, unknown>, profile: Profile): Rendered {
  const name = profile.name?.trim() || "alumna";
  const date = fmtDate(payload.date as string | undefined);
  const start = fmtTime(payload.start_time as string | undefined);
  const end = fmtTime(payload.end_time as string | undefined);

  switch (type) {
    case "reservation_confirmed":
      return wrap(
        "Reserva confirmada",
        `Hola ${name}, tu reserva está confirmada. Te esperamos en el estudio. Si necesitas cancelar, recuerda hacerlo con más de 3 horas de antelación para recuperar el crédito.`,
      );
    case "plan_purchased":
      return wrap(
        "Plan activado",
        `Hola ${name}, tu plan está activo y tus créditos del mes están listos. Reserva tus clases desde la app cuando quieras.`,
      );
    case "reminder_24h":
      return wrap(
        "Recordatorio de tu clase mañana",
        `Hola ${name}, te recordamos tu clase ${date} de ${start} a ${end}. Si no puedes venir, cancela con más de 3 horas de antelación.`,
      );
    case "class_cancelled":
      return wrap(
        "Clase cancelada",
        `Hola ${name}, hemos tenido que cancelar una clase próxima. Te hemos añadido una recuperación válida hasta fin de mes para que reserves otro día.`,
      );
    case "makeup_available":
      return wrap(
        "Recuperación disponible",
        `Hola ${name}, tienes una clase de recuperación disponible. Recuerda usarla antes de fin de mes desde la sección Recuperaciones.`,
      );
    case "waitlist_promoted": {
      const requiresPayment = Boolean(payload.requires_payment);
      return wrap(
        "Tienes plaza en clase",
        requiresPayment
          ? `Hola ${name}, se ha liberado una plaza y te la hemos asignado. Para confirmarla, completa el pago desde tu reserva en los próximos 30 minutos.`
          : `Hola ${name}, se ha liberado una plaza y te la hemos asignado con tu plan. ¡Te esperamos!`,
      );
    }
    case "monthly_summary": {
      const used = Number(payload.credits_used ?? 0);
      const total = Number(payload.credits_total ?? 0);
      const remaining = Number(payload.credits_remaining ?? 0);
      const makeups = Number(payload.makeups_pending ?? 0);
      return wrap(
        "Resumen del mes",
        `Hola ${name}, este mes has usado ${used} de ${total} créditos (te quedan ${remaining}). Recuperaciones pendientes: ${makeups}. Recuerda que los créditos no se acumulan al mes siguiente.`,
      );
    }
    case "payment_reminder": {
      const planName = (payload.plan_name as string | undefined)?.trim() || "tu plan";
      const paymentUrl = (payload.payment_url as string | undefined) ?? "";
      const amount = fmtAmount(payload.amount_cents);
      const body =
        `Hola ${name}, te recordamos que tienes pendiente el pago de ${planName}` +
        (amount ? ` (${amount})` : "") +
        `. Puedes completarlo de forma segura desde este enlace: ${paymentUrl}`;
      return wrapWithCta("Recordatorio de pago", body, "Pagar ahora", paymentUrl);
    }
    default:
      return wrap("Aviso de Cerámica Studio", `Hola ${name}, tienes una novedad en tu cuenta.`);
  }
}

function wrap(subject: string, body: string): Rendered {
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#FAF5EE;font-family:Inter,Arial,sans-serif;color:#2E2419">
  <div style="max-width:520px;margin:24px auto;background:#FFFDF8;border:1px solid #E8DFD2;border-radius:12px;padding:28px">
    <div style="height:4px;width:48px;background:#C96F4A;border-radius:2px;margin-bottom:20px"></div>
    <h1 style="font-size:22px;margin:0 0 12px;font-weight:600;color:#2E2419">${escapeHtml(subject)}</h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 20px;color:#2E2419">${escapeHtml(body)}</p>
    <p style="font-size:12px;color:#8A7B6B;margin:24px 0 0">Cerámica Studio</p>
  </div>
  </body></html>`;
  return { subject, text: body, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Format amount_cents (number or numeric string) as EUR, e.g. "45,00 €".
// Returns "" when the amount is missing so callers can omit it.
function fmtAmount(cents?: unknown): string {
  if (cents === undefined || cents === null || cents === "") return "";
  const n = Number(cents);
  if (!Number.isFinite(n)) return "";
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n / 100);
  } catch {
    return `${(n / 100).toFixed(2)} €`;
  }
}

// Like wrap(), but renders a clickable call-to-action button (used for emails
// that carry a link, e.g. the payment reminder). The link is also kept in the
// plain-text body for clients without HTML / for WhatsApp fallbacks.
function wrapWithCta(subject: string, body: string, ctaLabel: string, ctaUrl: string): Rendered {
  const safeUrl = escapeHtml(ctaUrl);
  const ctaBlock = ctaUrl
    ? `<p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#C96F4A;color:#FFFDF8;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px">${escapeHtml(ctaLabel)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#FAF5EE;font-family:Inter,Arial,sans-serif;color:#2E2419">
  <div style="max-width:520px;margin:24px auto;background:#FFFDF8;border:1px solid #E8DFD2;border-radius:12px;padding:28px">
    <div style="height:4px;width:48px;background:#C96F4A;border-radius:2px;margin-bottom:20px"></div>
    <h1 style="font-size:22px;margin:0 0 12px;font-weight:600;color:#2E2419">${escapeHtml(subject)}</h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 20px;color:#2E2419">${escapeHtml(body)}</p>
    ${ctaBlock}
    <p style="font-size:12px;color:#8A7B6B;margin:24px 0 0">Cerámica Studio</p>
  </div>
  </body></html>`;
  return { subject, text: body, html };
}

// ---------- WhatsApp Content templates (A1.1) ----------
// Resolve notification.type -> Twilio ContentSid via TWILIO_TEMPLATE_* env vars
// (one ContentSid per template). For 'waitlist_promoted' the variant depends on
// whether the promoted reservation still requires payment.
function resolveContentSid(type: string, payload: Record<string, unknown>): string | undefined {
  switch (type) {
    case "reservation_confirmed":
      return Deno.env.get("TWILIO_TEMPLATE_RESERVATION_CONFIRMED");
    case "plan_purchased":
      return Deno.env.get("TWILIO_TEMPLATE_PLAN_PURCHASED");
    case "reminder_24h":
      return Deno.env.get("TWILIO_TEMPLATE_REMINDER_24H");
    case "class_cancelled":
      return Deno.env.get("TWILIO_TEMPLATE_CLASS_CANCELLED");
    case "makeup_available":
      return Deno.env.get("TWILIO_TEMPLATE_MAKEUP_AVAILABLE");
    case "waitlist_promoted":
      return payload.requires_payment
        ? Deno.env.get("TWILIO_TEMPLATE_WAITLIST_PROMOTED_PAY")
        : Deno.env.get("TWILIO_TEMPLATE_WAITLIST_PROMOTED_PLAN");
    case "monthly_summary":
      return Deno.env.get("TWILIO_TEMPLATE_MONTHLY_SUMMARY");
    case "payment_reminder":
      return Deno.env.get("TWILIO_TEMPLATE_PAYMENT_REMINDER");
    default:
      return undefined;
  }
}

// Build the numbered {{n}} ContentVariables for a given type, reusing the same
// values render()/fmtDate()/fmtTime() compute. Returns a map keyed by string
// index (Twilio's ContentVariables format), JSON-stringified by the caller.
function buildContentVariables(
  type: string,
  payload: Record<string, unknown>,
  profile: Profile,
): Record<string, string> {
  const name = profile.name?.trim() || "alumna";
  const date = fmtDate(payload.date as string | undefined);
  const start = fmtTime(payload.start_time as string | undefined);
  const end = fmtTime(payload.end_time as string | undefined);

  switch (type) {
    case "reservation_confirmed":
    case "plan_purchased":
    case "class_cancelled":
    case "makeup_available":
    case "waitlist_promoted":
      return { "1": name };
    case "reminder_24h":
      return { "1": name, "2": date, "3": start, "4": end };
    case "monthly_summary": {
      const used = Number(payload.credits_used ?? 0);
      const total = Number(payload.credits_total ?? 0);
      const remaining = Number(payload.credits_remaining ?? 0);
      const makeups = Number(payload.makeups_pending ?? 0);
      return {
        "1": name,
        "2": String(used),
        "3": String(total),
        "4": String(remaining),
        "5": String(makeups),
      };
    }
    case "payment_reminder":
      return {
        "1": name,
        "2": fmtAmount(payload.amount_cents),
        "3": (payload.payment_url as string | undefined) ?? "",
      };
    default:
      return { "1": name };
  }
}

// ---------- Senders ----------
async function sendEmail(
  to: string,
  rendered: Rendered,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  // Safe before configuration: skip (but mark sent) until the API key is set.
  if (!RESEND_API_KEY) return { ok: true, skipped: true, error: "channel_not_configured: resend" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to,
        subject: rendered.subject,
        html: rendered.html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `resend ${res.status}: ${txt.slice(0, 240)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function sendWhatsApp(
  to: string,
  type: string,
  payload: Record<string, unknown>,
  profile: Profile,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  if (
    !TWILIO_ACCOUNT_SID ||
    !TWILIO_API_KEY_SID ||
    !TWILIO_API_KEY_SECRET ||
    !TWILIO_WHATSAPP_FROM
  ) {
    return { ok: true, skipped: true, error: "channel_not_configured: twilio" };
  }
  // Creds are present but the template for this type is not configured -> fail
  // loudly (not a silent skip) so it surfaces in the log for fixing.
  const contentSid = resolveContentSid(type, payload);
  if (!contentSid) {
    return { ok: false, error: `template_not_configured:${type}` };
  }
  try {
    const auth = btoa(`${TWILIO_API_KEY_SID}:${TWILIO_API_KEY_SECRET}`);
    const contentVariables = JSON.stringify(buildContentVariables(type, payload, profile));
    const body = new URLSearchParams({
      To: `whatsapp:${to}`,
      From: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
      ContentSid: contentSid,
      ContentVariables: contentVariables,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `twilio ${res.status}: ${txt.slice(0, 240)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function processOne(row: QueueRow): Promise<void> {
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("email, whatsapp, name")
    .eq("id", row.student_id)
    .maybeSingle();

  if (pErr || !profile) {
    await supabase.rpc("mark_notification_failed", {
      p_id: row.id,
      p_error: `profile_not_found: ${pErr?.message ?? ""}`,
    });
    return;
  }

  const rendered = render(row.type, row.payload ?? {}, profile as Profile);

  let result: { ok: boolean; error?: string; skipped?: boolean };
  if (row.channel === "email") {
    if (!profile.email) {
      result = { ok: false, error: "missing_email" };
    } else {
      result = await sendEmail(profile.email, rendered);
    }
  } else if (row.channel === "whatsapp") {
    if (!profile.whatsapp) {
      result = { ok: false, error: "missing_whatsapp" };
    } else {
      result = await sendWhatsApp(
        profile.whatsapp,
        row.type,
        row.payload ?? {},
        profile as Profile,
      );
    }
  } else {
    result = { ok: false, error: `unknown_channel:${row.channel}` };
  }

  if (result.ok) {
    await supabase.rpc("mark_notification_sent", { p_id: row.id });
    if (result.skipped) {
      // Stamp the skip reason for audit visibility.
      await supabase
        .from("notifications")
        .update({ last_error: result.error ?? "skipped" })
        .eq("id", row.id);
    }
  } else {
    await supabase.rpc("mark_notification_failed", {
      p_id: row.id,
      p_error: result.error ?? "unknown_error",
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // Endpoint hardening (A2.3, shared contract #1): when CRON_SECRET is set,
  // require a matching "x-cron-secret" header. Before the secret is configured
  // we allow the request (progressive hardening) so the queue keeps draining.
  if (CRON_SECRET) {
    if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("CRON_SECRET not set — process-notifications endpoint is unauthenticated.");
  }
  try {
    const { data: rows, error } = await supabase.rpc("claim_notifications", { p_limit: 100 });
    if (error) throw error;
    const list = (rows ?? []) as QueueRow[];
    await Promise.all(list.map((row) => processOne(row)));
    return new Response(JSON.stringify({ ok: true, processed: list.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
