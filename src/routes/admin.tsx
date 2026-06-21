import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Bell,
  Wallet,
  Inbox,
  MessageCircle,
  NotebookPen,
  PiggyBank,
  Receipt,
} from "lucide-react";
import { RouteGuard } from "@/components/RouteGuard";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Administración — Cerámica Studio" }],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <RouteGuard requireRole="admin">
      <AppShell
        brand="Cerámica Studio · Admin"
        items={[
          { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
          { to: "/admin/solicitudes", label: "Solicitudes", icon: Inbox },
          { to: "/admin/clases", label: "Clases", icon: CalendarDays },
          { to: "/admin/alumnas", label: "Alumnas", icon: Users },
          { to: "/admin/mensajes", label: "Mensajes", icon: MessageCircle },
          { to: "/admin/pagos", label: "Pagos", icon: Wallet },
          { to: "/admin/finanzas", label: "Finanzas", icon: PiggyBank },
          { to: "/admin/registro", label: "Ingresos", icon: NotebookPen },
          { to: "/admin/gastos", label: "Gastos", icon: Receipt },
          { to: "/admin/notificaciones", label: "Notificaciones", icon: Bell },
        ]}
      />
    </RouteGuard>
  );
}
