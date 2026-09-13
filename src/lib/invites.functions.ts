import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APP_BASE_URL = "https://reservas.cazuceramics.com";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function describeClass(c: {
  date: string;
  start_time: string;
  end_time: string;
  teacher: string | null;
}): string {
  const [y, m, d] = c.date.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d);
  const day = `${WEEKDAYS[dt.getDay()]}, ${d} de ${MONTHS[(m ?? 1) - 1]}`;
  const time = `${c.start_time.slice(0, 5)}–${c.end_time.slice(0, 5)}`;
  return c.teacher ? `${day} · ${time} (${c.teacher})` : `${day} · ${time}`;
}

/**
 * Sends (or re-sends) the enrollment invite email for an accepted request.
 * Admin only. The invite itself is created by `accept_enrollment_request`.
 */
export const sendEnrollmentInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    if (profile?.role !== "admin") throw new Error("Solo un admin puede enviar invitaciones.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error } = await supabaseAdmin
      .from("invites")
      .select("id, token, email, name, status, request_id")
      .eq("request_id", data.requestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Esta solicitud aún no tiene invitación.");
    if (invite.status !== "pending") throw new Error("Esta invitación ya fue utilizada.");
    if (!invite.email) throw new Error("La solicitud no tiene email.");

    const { data: rows } = await supabaseAdmin
      .from("invite_classes")
      .select("class:classes(date, start_time, end_time, teacher)")
      .eq("invite_id", invite.id);

    const classes = (rows ?? [])
      .map((r) => (r as { class: typeof describeClass extends never ? never : any }).class)
      .filter(Boolean)
      .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date))
      .map(describeClass);

    const inviteUrl = `${APP_BASE_URL}/unirse/${invite.token}`;

    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const result = await sendTemplateEmail("enrollment-invite", invite.email, {
      templateData: { name: invite.name ?? "", inviteUrl, classes },
      idempotencyKey: `enrollment-invite-${invite.id}-${Date.now()}`,
    });

    return { inviteUrl, sent: result.sent, email: invite.email };
  });
