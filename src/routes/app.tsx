import { createFileRoute } from "@tanstack/react-router";
import { AppShell, studentNavItems } from "@/components/layout/AppShell";
import { RouteGuard } from "@/components/RouteGuard";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [{ title: "Mi área — Cerámica Studio" }],
  }),
  component: AppLayout,
});

function AppLayout() {
  return (
    <RouteGuard requireRole="student">
      <>
        <PaymentTestModeBanner />
        <AppShell brand="Cerámica Studio" items={studentNavItems} />
      </>
    </RouteGuard>
  );
}
