import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/auto-cancel-classes")({
  server: {
    handlers: {
      // NOTE: The scheduled cron path calls the SQL function `auto_cancel_low_attendance`
      // directly (via pg_cron) and does NOT hit this route. This HTTP endpoint exists for
      // manual / out-of-band triggering, so it is hardened with the shared CRON_SECRET check.
      POST: async ({ request }) => {
        // Fail-closed: require CRON_SECRET to be configured AND the caller to present
        // a matching "x-cron-secret" header. Never allow unauthenticated callers to
        // trigger state-mutating cancellations.
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
          if (!cronSecret) {
            console.error("auto-cancel-classes: CRON_SECRET is not configured; rejecting request.");
          }
          return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data, error } = await supabaseAdmin.rpc("auto_cancel_low_attendance");
        if (error) {
          console.error("auto_cancel_low_attendance failed:", error);
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const cancelled = Array.isArray(data) ? data.length : 0;
        console.log(`auto_cancel_low_attendance: cancelled ${cancelled} class(es)`);
        return new Response(JSON.stringify({ success: true, cancelled, results: data }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
