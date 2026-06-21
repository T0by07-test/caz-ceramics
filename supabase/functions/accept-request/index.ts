// Block C — accept an enrollment request (admin only).
// Verifies the caller is an admin, calls accept_enrollment_request (which marks
// the request accepted, sets granted flags, and creates the invite + invite_classes),
// builds the invite URL, and sends the invite email via Resend.
// Returns { invite_url, token } so the admin UI can also offer a copy-link button.
import { createClient } from "npm:@supabase/supabase-js@2";

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

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Cazu Ceramics <noreply@cazuceramics.com>";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Spanish invite email (ES draft; Cande approves final copy).
function renderInviteEmail(name: string, inviteUrl: string): { subject: string; html: string } {
  const safeName = escapeHtml(name?.trim() || "alumna");
  const safeUrl = escapeHtml(inviteUrl);
  const subject = "Tu plaza está confirmada — crea tu cuenta";
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#FAF5EE;font-family:Inter,Arial,sans-serif;color:#2E2419">
  <div style="max-width:520px;margin:24px auto;background:#FFFDF8;border:1px solid #E8DFD2;border-radius:12px;padding:28px">
    <div style="height:4px;width:48px;background:#C96F4A;border-radius:2px;margin-bottom:20px"></div>
    <h1 style="font-size:22px;margin:0 0 12px;font-weight:600;color:#2E2419">¡Hola ${safeName}!</h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 20px;color:#2E2419">Tu solicitud ha sido aceptada y ya tienes plaza en las clases seleccionadas. Para terminar, crea tu cuenta desde el siguiente enlace y quedarás inscrita automáticamente.</p>
    <p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#C96F4A;color:#FFFDF8;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px">Crear mi cuenta</a></p>
    <p style="font-size:13px;line-height:1.5;margin:0 0 20px;color:#8A7B6B">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><span style="color:#C96F4A">${safeUrl}</span></p>
    <p style="font-size:12px;color:#8A7B6B;margin:24px 0 0">Cazu Ceramics</p>
  </div>
  </body></html>`;
  return { subject, html };
}

async function sendInviteEmail(
  to: string,
  name: string,
  inviteUrl: string,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  // Resend not configured yet: skip the email but let the caller still return
  // the invite_url so the copy-link path keeps working.
  if (!RESEND_API_KEY) return { ok: true, skipped: true, error: "channel_not_configured: resend" };
  try {
    const { subject, html } = renderInviteEmail(name, inviteUrl);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
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
    // Service-role client to run the privileged RPC + read profile data.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) return jsonResponse({ error: "Authentication required" }, 401);
    const user = userData.user;

    // Verify the caller is an admin (role = 'admin' on their profile).
    const { data: callerProfile, error: roleErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (roleErr) return jsonResponse({ error: "Failed to verify admin" }, 500);
    if (!callerProfile || callerProfile.role !== "admin") {
      return jsonResponse({ error: "Admin access required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { request_id, granted_class_ids } = body as {
      request_id?: string;
      granted_class_ids?: string[];
    };

    if (!request_id || !UUID_RE.test(request_id)) {
      return jsonResponse({ error: "Invalid request_id" }, 400);
    }
    if (
      !Array.isArray(granted_class_ids) ||
      granted_class_ids.length === 0 ||
      !granted_class_ids.every((id) => typeof id === "string" && UUID_RE.test(id))
    ) {
      return jsonResponse({ error: "granted_class_ids must be a non-empty array of class ids" }, 400);
    }

    // Run the privileged RPC via the service-role client. The RPC marks the
    // request accepted, sets granted flags, creates the invite + invite_classes,
    // and returns the invite token. (comp-only — no payment_mode.)
    const { data: token, error: rpcError } = await admin.rpc("accept_enrollment_request", {
      p_request_id: request_id,
      p_granted_class_ids: granted_class_ids,
    });
    if (rpcError) return jsonResponse({ error: rpcError.message }, 400);
    if (!token || typeof token !== "string") {
      return jsonResponse({ error: "Failed to create invite" }, 500);
    }

    // Build the invite URL. APP_BASE_URL is preferred; fall back to the request origin.
    const appBase = Deno.env.get("APP_BASE_URL") ?? new URL(req.url).origin;
    const baseTrimmed = appBase.replace(/\/+$/, "");
    const inviteUrl = `${baseTrimmed}/unirse/${token}`;

    // Load the request's contact info for the email recipient + greeting name.
    const { data: request } = await admin
      .from("enrollment_requests")
      .select("name, email")
      .eq("id", request_id)
      .maybeSingle();

    let emailResult: { ok: boolean; skipped?: boolean; error?: string } = {
      ok: true,
      skipped: true,
      error: "no_recipient",
    };
    if (request?.email) {
      emailResult = await sendInviteEmail(request.email, request.name ?? "", inviteUrl);
    }
    if (!emailResult.ok) {
      // Email failed but the invite exists — surface a warning, still return the link.
      console.error("accept-request: invite email failed:", emailResult.error);
    }

    return jsonResponse({
      invite_url: inviteUrl,
      token,
      email_sent: emailResult.ok && !emailResult.skipped,
    });
  } catch (e) {
    console.error("accept-request error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
