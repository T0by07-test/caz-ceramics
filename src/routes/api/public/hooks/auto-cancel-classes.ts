import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/auto-cancel-classes")({
  server: {
    handlers: {
      POST: async () => {
        const { data, error } = await supabaseAdmin.rpc("auto_cancel_low_attendance");
        if (error) {
          console.error("auto_cancel_low_attendance failed:", error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        const cancelled = Array.isArray(data) ? data.length : 0;
        console.log(`auto_cancel_low_attendance: cancelled ${cancelled} class(es)`);
        return new Response(
          JSON.stringify({ success: true, cancelled, results: data }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});