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

// ---------- Senders ----------
async function sendEmail(to: string, rendered: Rendered): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  if (!LOVABLE_API_KEY) return { ok: true, skipped: true, error: "channel_not_configured: lovable email" };
  // Lovable Email send via Lovable AI Gateway is not yet wired in this project.
  // We mark as skipped until the email domain is configured. Once configured,
  // replace this stub with the actual Lovable Email send call.
  return { ok: true, skipped: true, error: "channel_not_configured: email domain pending" };
}

async function sendWhatsApp(to: string, rendered: Rendered): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET || !TWILIO_WHATSAPP_FROM) {
    return { ok: true, skipped: true, error: "channel_not_configured: twilio" };
  }
  try {
    const auth = btoa(`${TWILIO_API_KEY_SID}:${TWILIO_API_KEY_SECRET}`);
    const body = new URLSearchParams({
      To: `whatsapp:${to}`,
      From: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
      Body: rendered.text,
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
      result = await sendWhatsApp(profile.whatsapp, rendered);
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
  try {
    const { data: rows, error } = await supabase.rpc("claim_notifications", { p_limit: 100 });
    if (error) throw error;
    const list = (rows ?? []) as QueueRow[];
    await Promise.all(list.map((row) => processOne(row)));
    return new Response(
      JSON.stringify({ ok: true, processed: list.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});