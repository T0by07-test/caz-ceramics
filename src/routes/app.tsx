import { createFileRoute } from "@tanstack/react-router";
import { AppShell, studentNavItems } from "@/components/layout/AppShell";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [{ title: "Mi área — Cerámica Studio" }],
  }),
  component: AppLayout,
});

function AppLayout() {
  return <AppShell brand="Cerámica Studio" items={studentNavItems} />;
}
