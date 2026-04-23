import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, UserPlus, ArrowLeftRight, Gift } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatLongDate, formatTimeRange, toIsoDate } from "@/lib/calendar";

export const Route = createFileRoute("/admin/alumnas")({
  head: () => ({ meta: [{ title: "Alumnas — Admin" }] }),
  component: AdminStudentsPage,
});

type StudentRow = {
  id: string;
  name: string | null;
  surname: string | null;
  email: string | null;
  whatsapp: string | null;
  plan_name: string | null;
  credits_remaining: number | null;
  pending_makeups: number;
};

function fullName(p: { name: string | null; surname: string | null; email: string | null }) {
  return [p.name, p.surname].filter(Boolean).join(" ").trim() || p.email || "—";
}

function AdminStudentsPage() {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantStudent, setGrantStudent] = useState<StudentRow | null>(null);

  const load = async () => {
    setLoading(true);
    const monthStart = toIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, surname, email, whatsapp")
      .eq("role", "student")
      .order("created_at", { ascending: false });
    const ids = (profiles ?? []).map((p) => p.id);
    const [{ data: subs }, { data: makeups }, { data: plans }] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("student_id, plan_id, credits_remaining")
        .eq("month", monthStart),
      supabase
        .from("makeups")
        .select("student_id")
        .is("used_booking_id", null)
        .gt("expires_at", new Date().toISOString()),
      supabase.from("plans").select("id, name"),
    ]);
    const planNameById = new Map((plans ?? []).map((p) => [p.id, p.name]));
    const subByStudent = new Map(
      (subs ?? []).map((s) => [
        s.student_id,
        { plan_name: planNameById.get(s.plan_id) ?? null, credits_remaining: s.credits_remaining },
      ]),
    );
    const makeupCount = new Map<string, number>();
    for (const m of makeups ?? [])
      makeupCount.set(m.student_id, (makeupCount.get(m.student_id) ?? 0) + 1);

    const result: StudentRow[] = (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      surname: p.surname,
      email: p.email,
      whatsapp: p.whatsapp,
      plan_name: subByStudent.get(p.id)?.plan_name ?? null,
      credits_remaining: subByStudent.get(p.id)?.credits_remaining ?? null,
      pending_makeups: makeupCount.get(p.id) ?? 0,
    }));
    setRows(result);
    setLoading(false);
    void ids;
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.surname, r.email, r.whatsapp].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-label uppercase">Personas</span>
          <h1 className="text-h1 mt-1">Alumnas</h1>
          <p className="text-body mt-2 text-muted-foreground">
            Busca, consulta su plan activo y revisa su historial.
          </p>
        </div>
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email…"
            aria-label="Buscar alumnas"
            className="pl-9"
          />
        </div>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<UserPlus className="h-5 w-5" />}
                title={rows.length === 0 ? "Aún no hay alumnas" : "Sin resultados"}
                description={
                  rows.length === 0
                    ? "Las alumnas aparecerán aquí cuando se registren."
                    : "Prueba con otro término de búsqueda."
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alumna</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden lg:table-cell">WhatsApp</TableHead>
                  <TableHead>Plan del mes</TableHead>
                  <TableHead className="text-center">Créditos</TableHead>
                  <TableHead className="text-center">Recup.</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell className="font-medium">{fullName(r)}</TableCell>
                    <TableCell className="hidden truncate text-muted-foreground md:table-cell">
                      {r.email ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {r.whatsapp ?? "—"}
                    </TableCell>
                    <TableCell>
                      {r.plan_name ? (
                        <Badge variant="secondary">{r.plan_name}</Badge>
                      ) : (
                        <span className="text-muted-foreground">Sin plan</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.credits_remaining ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.pending_makeups > 0 ? (
                        <Badge variant="outline">{r.pending_makeups}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setGrantStudent(r);
                          setGrantOpen(true);
                        }}
                        aria-label="Conceder recuperación"
                      >
                        <Gift className="mr-1 h-4 w-4" /> Recuperación
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <StudentDetailSheet
        student={selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onChanged={() => void load()}
      />

      <GrantMakeupDialog
        open={grantOpen}
        onOpenChange={(o) => {
          setGrantOpen(o);
          if (!o) setGrantStudent(null);
        }}
        student={grantStudent}
        onGranted={() => void load()}
      />
    </div>
  );
}

type Booking = {
  id: string;
  status: string;
  source: string;
  created_at: string;
  cancelled_at: string | null;
  class: { id: string; date: string; start_time: string; end_time: string; status: string } | null;
};

type Payment = {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  stripe_session_id: string | null;
};

type Notif = {
  id: string;
  type: string;
  channel: string;
  status: string;
  created_at: string;
};

function StudentDetailSheet({
  student,
  onOpenChange,
  onChanged,
}: {
  student: StudentRow | null;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}) {
  const open = student !== null;
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const [moveBooking, setMoveBooking] = useState<Booking | null>(null);

  useEffect(() => {
    if (!student) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [{ data: bs }, { data: ps }, { data: ns }] = await Promise.all([
        supabase
          .from("bookings")
          .select(
            "id, status, source, created_at, cancelled_at, class:classes(id, date, start_time, end_time, status)",
          )
          .eq("student_id", student.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("payments")
          .select("id, amount_cents, status, created_at, stripe_session_id")
          .eq("student_id", student.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("notifications")
          .select("id, type, channel, status, created_at")
          .eq("student_id", student.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (cancelled) return;
      setBookings((bs ?? []) as unknown as Booking[]);
      setPayments(ps ?? []);
      setNotifs(ns ?? []);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [student]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {student ? (
            <>
              <SheetHeader>
                <SheetTitle>{fullName(student)}</SheetTitle>
                <SheetDescription>
                  {student.email ?? "—"}
                  {student.whatsapp ? ` · ${student.whatsapp}` : null}
                </SheetDescription>
              </SheetHeader>

              <section className="mt-6 space-y-2">
                <h3 className="text-h3">Reservas</h3>
                {loading ? (
                  <Skeleton className="h-24 w-full" />
                ) : bookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aún sin reservas.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {bookings.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0 text-sm">
                          <div className="truncate font-medium capitalize">
                            {b.class ? formatLongDate(b.class.date) : "Clase eliminada"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {b.class
                              ? formatTimeRange(b.class.start_time, b.class.end_time)
                              : ""}{" "}
                            · {bookingStatusLabel(b.status)}
                          </div>
                        </div>
                        {["reserved", "confirmed"].includes(b.status) && b.class ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setMoveBooking(b)}
                            aria-label="Mover de clase"
                          >
                            <ArrowLeftRight className="mr-1 h-3.5 w-3.5" /> Mover
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="mt-6 space-y-2">
                <h3 className="text-h3">Pagos</h3>
                {loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin pagos registrados.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span>
                          {new Date(p.created_at).toLocaleDateString("es-ES")} ·{" "}
                          <span className="text-muted-foreground">{p.status}</span>
                        </span>
                        <span className="font-medium">
                          {new Intl.NumberFormat("es-ES", {
                            style: "currency",
                            currency: "EUR",
                          }).format(p.amount_cents / 100)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="mt-6 space-y-2">
                <h3 className="text-h3">Notificaciones recientes</h3>
                {loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : notifs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin notificaciones.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                    {notifs.map((n) => (
                      <li key={n.id} className="flex items-center justify-between px-3 py-2">
                        <span className="truncate">{n.type}</span>
                        <span className="text-xs text-muted-foreground">
                          {n.channel} · {n.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <MoveBookingDialog
        booking={moveBooking}
        onOpenChange={(o) => !o && setMoveBooking(null)}
        onMoved={() => {
          setMoveBooking(null);
          onChanged();
        }}
      />
    </>
  );
}

function bookingStatusLabel(s: string) {
  switch (s) {
    case "reserved":
      return "Reservada";
    case "confirmed":
      return "Confirmada";
    case "attended":
      return "Asistida";
    case "cancelled_recoverable":
      return "Cancelada (recuperable)";
    case "cancelled_lost":
      return "Cancelada (perdida)";
    default:
      return s;
  }
}

function MoveBookingDialog({
  booking,
  onOpenChange,
  onMoved,
}: {
  booking: Booking | null;
  onOpenChange: (o: boolean) => void;
  onMoved: () => void;
}) {
  const open = booking !== null;
  const [classes, setClasses] = useState<
    { id: string; date: string; start_time: string; end_time: string }[]
  >([]);
  const [target, setTarget] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!booking) return;
    setTarget("");
    setReason("");
    const load = async () => {
      const today = toIsoDate(new Date());
      const { data } = await supabase
        .from("classes")
        .select("id, date, start_time, end_time")
        .eq("status", "scheduled")
        .gte("date", today)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(60);
      setClasses((data ?? []).filter((c) => c.id !== booking.class?.id));
    };
    void load();
  }, [booking]);

  const submit = async () => {
    if (!booking || !target || !reason.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("admin_move_booking", {
      p_booking_id: booking.id,
      p_target_class_id: target,
      p_reason: reason.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(`No se pudo mover: ${error.message}`);
      return;
    }
    toast.success("Reserva movida correctamente.");
    onMoved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover reserva</DialogTitle>
          <DialogDescription>
            Elige la clase de destino y deja una nota explicando el motivo. Quedará
            registrado en la auditoría.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="target-class">Clase destino</Label>
            <select
              id="target-class"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Selecciona —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatLongDate(c.date)} · {formatTimeRange(c.start_time, c.end_time)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Motivo</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. La alumna no podía asistir y pidió el cambio."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!target || !reason.trim() || submitting}>
            {submitting ? "Moviendo…" : "Mover reserva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GrantMakeupDialog({
  open,
  onOpenChange,
  student,
  onGranted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: StudentRow | null;
  onGranted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const submit = async () => {
    if (!student || !reason.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("admin_grant_makeup", {
      p_student_id: student.id,
      p_reason: reason.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(`No se pudo conceder: ${error.message}`);
      return;
    }
    toast.success("Recuperación concedida.");
    onOpenChange(false);
    onGranted();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conceder recuperación</DialogTitle>
          <DialogDescription>
            {student ? `Para ${fullName(student)}.` : ""} Indica el motivo (queda registrado).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="grant-reason">Motivo</Label>
          <Textarea
            id="grant-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. Compensación por incidencia en el estudio."
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!reason.trim() || submitting}>
            {submitting ? "Concediendo…" : "Conceder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}