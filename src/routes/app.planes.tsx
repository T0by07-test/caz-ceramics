import { createFileRoute, redirect } from "@tanstack/react-router";

// Plan purchases are gone (redundant with the calendar's own multi-class
// booking, which already offers the same volume pricing). Existing paid
// subscribers still spend their plan via the calendar; nobody can buy a new
// one. Keep this route as a redirect rather than deleting it outright, in
// case a bookmark or an old email link still points here.
export const Route = createFileRoute("/app/planes")({
  beforeLoad: () => {
    throw redirect({ to: "/app" });
  },
});
