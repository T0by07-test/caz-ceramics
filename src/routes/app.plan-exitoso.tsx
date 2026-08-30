import { createFileRoute, redirect } from "@tanstack/react-router";

// Plan checkout no longer exists, so nothing links here anymore. Kept as a
// redirect rather than deleted, in case an old Stripe confirmation email
// still points at this URL.
export const Route = createFileRoute("/app/plan-exitoso")({
  beforeLoad: () => {
    throw redirect({ to: "/app" });
  },
});
