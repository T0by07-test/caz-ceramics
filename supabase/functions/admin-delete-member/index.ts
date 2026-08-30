// Admin-only: permanently delete a member account — meant for cleaning up
// test/junk profiles (e.g. "Cande Test fianl"), not for real members.
// Deletes the auth.users row, which cascades (profiles.id references
// auth.users(id) on delete cascade) down through bookings, payments, tags,
// subscriptions, recurring_slots, and makeups.
//
// Refuses to run if the target has any payment with amount_cents > 0 (a
// real charge, confirmed or not) — the $0 placeholder rows book_class()
// inserts for every drop-in reservation attempt don't count, or this would
// block deleting exactly the test accounts it's meant for. Also refuses for
// any role other than 'user', so an admin/instructor account can't be wiped
// by mistake.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
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
    if (authError || !userData?.user)
      return jsonResponse({ error: "Authentication required" }, 401);
    const caller = userData.user;

    const { data: callerProfile, error: roleErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();
    if (roleErr) return jsonResponse({ error: "Failed to verify admin" }, 500);
    if (!callerProfile || callerProfile.role !== "admin") {
      return jsonResponse({ error: "Admin access required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { studentId } = body as { studentId?: string };
    if (!studentId || !UUID_RE.test(studentId)) {
      return jsonResponse({ error: "Invalid studentId" }, 400);
    }

    const { data: target, error: targetErr } = await admin
      .from("profiles")
      .select("id, role, name, surname, email")
      .eq("id", studentId)
      .maybeSingle();
    if (targetErr) return jsonResponse({ error: "Failed to load member" }, 500);
    if (!target) return jsonResponse({ error: "Member not found" }, 404);
    if (target.role !== "user") {
      return jsonResponse({ error: "Solo se pueden eliminar cuentas con rol Miembro" }, 400);
    }

    const { count: realPaymentCount, error: paymentErr } = await admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .gt("amount_cents", 0);
    if (paymentErr) return jsonResponse({ error: "Failed to check payment history" }, 500);
    if ((realPaymentCount ?? 0) > 0) {
      return jsonResponse(
        { error: "Este miembro tiene pagos registrados y no se puede eliminar." },
        400,
      );
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(studentId);
    if (deleteErr) return jsonResponse({ error: deleteErr.message }, 500);

    return jsonResponse({ deleted: true });
  } catch (e) {
    console.error("admin-delete-member error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
