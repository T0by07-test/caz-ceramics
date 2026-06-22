import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, isStaff, type Role } from "@/lib/auth";

type Props = {
  children: ReactNode;
  requireRole?: Role | Role[];
  requireStaff?: boolean; // admin OR instructora
  requireAdmin?: boolean; // admin only
};

function isAllowed(
  role: Role | null,
  { requireRole, requireStaff, requireAdmin }: Omit<Props, "children">,
): boolean {
  if (requireAdmin) return role === "admin";
  if (requireStaff) return isStaff(role);
  if (requireRole) {
    return Array.isArray(requireRole)
      ? requireRole.includes(role as Role)
      : role === requireRole;
  }
  return true;
}

export function RouteGuard({
  children,
  requireRole,
  requireStaff,
  requireAdmin,
}: Props) {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    if (!isAllowed(role, { requireRole, requireStaff, requireAdmin })) {
      navigate({ to: isStaff(role) ? "/admin" : "/app" });
    }
  }, [session, role, loading, requireRole, requireStaff, requireAdmin, navigate]);

  if (
    loading ||
    !session ||
    !isAllowed(role, { requireRole, requireStaff, requireAdmin })
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }

  return <>{children}</>;
}
