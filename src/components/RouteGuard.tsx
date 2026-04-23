import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, type Role } from "@/lib/auth";

type Props = {
  children: ReactNode;
  requireRole?: Role;
};

export function RouteGuard({ children, requireRole }: Props) {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    if (requireRole && role && role !== requireRole) {
      navigate({ to: role === "admin" ? "/admin" : "/app" });
    }
  }, [session, role, loading, requireRole, navigate]);

  if (loading || !session || (requireRole && role !== requireRole)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }

  return <>{children}</>;
}