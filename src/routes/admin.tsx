import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Bell,
  Inbox,
  MessageCircle,
  NotebookPen,
  PiggyBank,
  Receipt,
} from "lucide-react";
import { RouteGuard } from "@/components/RouteGuard";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Administración — Cerámica Studio" }],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const { role } = useAuth();
  const dashboard = { to: "/admin", label: "Dashboard", icon: LayoutDashboard };
  const solicitudes = { to: "/admin/solicitudes", label: "Solicitudes", icon: Inbox };
  const clases = { to: "/admin/clases", label: "Clases", icon: CalendarDays };
  const miembros = { to: "/admin/alumnas", label: "Miembros", icon: Users };
  const mensajes = { to: "/admin/mensajes", label: "Mensajes", icon: MessageCircle };
  const finanzas = { to: "/admin/finanzas", label: "Finanzas", icon: PiggyBank };
  const ingresos = { to: "/admin/registro", label: "Ingresos", icon: NotebookPen };
  const gastos = { to: "/admin/gastos", label: "Gastos", icon: Receipt };
  const notificaciones = { to: "/admin/notificaciones", label: "Notificaciones", icon: Bell };

  const items =
    role === "admin"
      ? [dashboard, solicitudes, clases, miembros, mensajes, finanzas, ingresos, gastos, notificaciones]
      : [clases, miembros, mensajes]; // instructora: Clases, Miembros, Mensajes only

  return (
    <RouteGuard requireStaff>
      <AppShell brand="Cerámica Studio · Admin" items={items} />
    </RouteGuard>
  );
}
