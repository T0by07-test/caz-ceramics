import { createFileRoute } from "@tanstack/react-router";
import { AppShell, studentNavItems } from "@/components/layout/AppShell";
import { RouteGuard } from "@/components/RouteGuard";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [{ title: "Mi área — Cerámica Studio" }],
  }),
  component: AppLayout,
});

function AppLayout() {
  return (
    <RouteGuard requireRole="student">
      <AppShell brand="Cerámica Studio" items={studentNavItems} />
    </RouteGuard>
  );
}
