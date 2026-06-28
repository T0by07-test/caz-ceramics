import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteGuard } from "@/components/RouteGuard";
import { Check, Copy, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatLongDate, formatTimeRange } from "@/lib/calendar";
import { acceptRequest, copyToClipboard, rejectRequest } from "@/lib/admin-tools";

export const Route = createFileRoute("/admin/solicitudes")({
  head: () => ({ meta: [{ title: "Solicitudes — Admin" }] }),
  component: AdminRequestsRoute,
});

type RequestStatus = "pending" | "accepted" | "rejected" | "cancelled";
type StatusFilter = "pending" | "all";

type RequestClass = {
  class_id: string;
  granted: boolean;
  class: { id: string; date: string; start_time: string; end_time: string } | null;
};

type EnrollmentRequest = {
  id: string;
  name: string | null;
  surname: string | null;
  email: string | null;
  whatsapp: string | null;
  message: string | null;
  status: RequestStatus;
  created_at: string;
  enrollment_request_classes: RequestClass[];
};

function fullName(r: { name: string | null; surname: string | null; email: string | null }) {
  return [r.name, r.surname].filter(Boolean).join(" ").trim() || r.email || "—";
}

const STATUS_BADGE: Record<
  RequestStatus,
  { label: string; variant: "secondary" | "outline" | "destructive" }
> = {
  pending: { label: "Pendiente", variant: "outline" },
  accepted: { label: "Aceptada", variant: "secondary" },
  rejected: { label: "Rechazada", variant: "destructive" },
  cancelled: { label: "Cancelada", variant: "destructive" },
};

// The enrollment_requests table / joins may not yet be in the generated types;
// cast keeps the query shape exact while still type-checking today.
type RequestsQuery = {
  from: (table: "enrollment_requests") => {
    select: (cols: string) => {
      order: (
        col: string,
        opts: { ascending: boolean },
      ) => {
        eq: (
          col: string,
          val: string,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      } & Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
};

function AdminRequestsRoute() {
  return (
    <RouteGuard requireAdmin>
      <AdminRequestsPage />
    </RouteGuard>
  );
}

function AdminRequestsPage() {
  const [rows, setRows] = useState<EnrollmentRequest[] | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [selected, setSelected] = useState<EnrollmentRequest | null>(null);

  const load = useCallback(async () => {
    const base = (supabase as unknown as RequestsQuery)
      .from("enrollment_requests")
      .select(
        "id, name, surname, email, whatsapp, message, status, created_at, enrollment_request_classes(class_id, granted, class:classes(id, date, start_time, end_time))",
      )
      .order("created_at", { ascending: false });
    const { data, error } = filter === "pending" ? await base.eq("status", "pending") : await base;
    if (error) {
      toast.error("No se pudieron cargar las solicitudes", { description: error.message });
      setRows([]);
      return;
    }
    setRows((data ?? []) as unknown as EnrollmentRequest[]);
  }, [filter]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("admin-enrollment-requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "enrollment_requests" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load]);

  // Keep the open detail sheet in sync with refreshed data.
  useEffect(() => {
    if (!selected || !rows) return;
    const fresh = rows.find((r) => r.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [rows, selected]);

  const counts = useMemo(() => {
    const c = { pending: 0, total: 0 };
    for (const r of rows ?? []) {
      c.total++;
      if (r.status === "pending") c.pending++;
    }
    return c;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="text-label uppercase">Admisiones</span>
          <h1 className="text-h1 mt-1">Solicitudes</h1>
          <p className="text-body mt-2 text-muted-foreground">
            Revisa las solicitudes de inscripción, aprueba las clases y envía la invitación.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <Badge variant="outline" className="shrink-0">Pendientes: {counts.pending}</Badge>
          <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0 overflow-x-auto">
          {rows === null ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Inbox className="h-5 w-5" />}
                title={
                  filter === "pending" ? "Sin solicitudes pendientes" : "Aún no hay solicitudes"
                }
                description={
                  filter === "pending"
                    ? "Las nuevas solicitudes aparecerán aquí para que las revises."
                    : "Cuando alguien complete el formulario de inscripción, aparecerá aquí."
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead className="hidden md:table-cell">Contacto</TableHead>
                  <TableHead className="text-center">Clases</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden lg:table-cell">Recibida</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                    <TableCell className="font-medium">{fullName(r)}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {r.email ?? "—"}
                      {r.whatsapp ? ` · ${r.whatsapp}` : ""}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.enrollment_request_classes?.length ?? 0}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[r.status].variant}>
                        {STATUS_BADGE[r.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {new Date(r.created_at).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RequestDetailSheet
        request={selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onChanged={() => void load()}
      />
    </div>
  );
}

function RequestDetailSheet({
  request,
  onOpenChange,
  onChanged,
}: {
  request: EnrollmentRequest | null;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}) {
  const open = request !== null;
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // Pre-select all requested classes when the request changes.
  useEffect(() => {
    if (!request) return;
    setInviteUrl(null);
    setGranted(new Set((request.enrollment_request_classes ?? []).map((c) => c.class_id)));
  }, [request]);

  const toggle = (classId: string, checked: boolean) => {
    setGranted((prev) => {
      const next = new Set(prev);
      if (checked) next.add(classId);
      else next.delete(classId);
      return next;
    });
  };

  const handleAccept = async () => {
    if (!request) return;
    if (granted.size === 0) {
      toast.error("Selecciona al menos una clase para aprobar.");
      return;
    }
    setSubmitting(true);
    try {
      const { invite_url } = await acceptRequest(request.id, Array.from(granted));
      setInviteUrl(invite_url);
      toast.success("Solicitud aceptada. Invitación enviada por email.");
      onChanged();
    } catch (e) {
      toast.error("No se pudo aceptar la solicitud", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!request) return;
    setRejecting(true);
    try {
      await rejectRequest(request.id);
      toast.success("Solicitud rechazada.");
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error("No se pudo rechazar", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setRejecting(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    const ok = await copyToClipboard(inviteUrl);
    if (ok) toast.success("Enlace copiado al portapapeles.");
    else toast.error("No se pudo copiar el enlace.");
  };

  const requestedClasses = request?.enrollment_request_classes ?? [];
  const isPending = request?.status === "pending";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        {request ? (
          <>
            <SheetHeader>
              <SheetTitle>{fullName(request)}</SheetTitle>
              <SheetDescription>
                {request.email ?? "—"}
                {request.whatsapp ? ` · ${request.whatsapp}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 flex-1 space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_BADGE[request.status].variant}>
                  {STATUS_BADGE[request.status].label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Recibida el{" "}
                  {new Date(request.created_at).toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>

              {request.message ? (
                <section className="space-y-1.5">
                  <h3 className="text-label uppercase">Mensaje</h3>
                  <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">
                    {request.message}
                  </p>
                </section>
              ) : null}

              <section className="space-y-2">
                <h3 className="text-label uppercase">
                  Clases solicitadas {isPending ? "— marca las que apruebas" : ""}
                </h3>
                {requestedClasses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin clases asociadas.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {requestedClasses.map((rc) => {
                      const checkboxId = `grant-${rc.class_id}`;
                      const checked = granted.has(rc.class_id);
                      return (
                        <li key={rc.class_id} className="flex items-center gap-3 px-3 py-2.5">
                          {isPending ? (
                            <Checkbox
                              id={checkboxId}
                              checked={checked}
                              onCheckedChange={(v) => toggle(rc.class_id, v === true)}
                              aria-label="Aprobar esta clase"
                            />
                          ) : rc.granted ? (
                            <Check className="h-4 w-4 text-muted-foreground" aria-hidden />
                          ) : (
                            <span className="inline-block h-4 w-4" aria-hidden />
                          )}
                          <label
                            htmlFor={isPending ? checkboxId : undefined}
                            className="min-w-0 flex-1 cursor-pointer text-sm"
                          >
                            <span className="block truncate font-medium capitalize">
                              {rc.class ? formatLongDate(rc.class.date) : "Clase eliminada"}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {rc.class
                                ? formatTimeRange(rc.class.start_time, rc.class.end_time)
                                : ""}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {inviteUrl ? (
                <section className="space-y-2 rounded-lg border border-border bg-surface p-3">
                  <h3 className="text-label uppercase">Enlace de invitación</h3>
                  <p className="text-xs text-muted-foreground">
                    Se envió por email. También puedes copiarlo y compartirlo por WhatsApp.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded border border-border bg-background px-2 py-1.5 text-xs">
                      {inviteUrl}
                    </code>
                    <Button size="sm" variant="secondary" onClick={handleCopy}>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
                    </Button>
                  </div>
                </section>
              ) : null}
            </div>

            {isPending ? (
              <SheetFooter className="mt-6 flex-col gap-2 sm:flex-row">
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={handleReject}
                  disabled={rejecting || submitting}
                >
                  <X className="mr-1 h-4 w-4" /> {rejecting ? "Rechazando…" : "Rechazar"}
                </Button>
                <Button onClick={handleAccept} disabled={submitting || granted.size === 0}>
                  <Check className="mr-1 h-4 w-4" />
                  {submitting ? "Aceptando…" : `Aceptar (${granted.size})`}
                </Button>
              </SheetFooter>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
