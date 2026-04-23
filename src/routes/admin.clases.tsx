import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { addMonths, formatLongDate, formatTimeRange, toIsoDate } from "@/lib/calendar";
import { useMonthClasses, type ClassWithCount } from "@/hooks/useMonthClasses";
import { MonthHeader } from "@/components/calendar/MonthHeader";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { MobileWeekList } from "@/components/calendar/MobileWeekList";

export const Route = createFileRoute("/admin/clases")({
  component: AdminClassesPage,
});

type ClassStatus = "scheduled" | "auto_cancelled" | "cancelled_by_admin";

function AdminClassesPage() {
  const [reference, setReference] = useState(() => new Date());
  const [selected, setSelected] = useState<ClassWithCount | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ClassWithCount | null>(null);
  const { classes, loading, refresh } = useMonthClasses(reference, "admin");

  // Keep "selected" in sync if the underlying class changes (capacity / status updates).
  useEffect(() => {
    if (!selected) return;
    const fresh = classes.find((c) => c.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [classes, selected]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-label uppercase">Administración</span>
          <h1 className="text-h1 mt-1">Clases del mes</h1>
          <p className="text-body mt-2 text-muted-foreground">
            Crea, edita o bloquea horarios. Los cambios se reflejan en tiempo real.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="lg" className="gap-2">
          <Plus className="h-4 w-4" /> Crear clase
        </Button>
      </div>

      <MonthHeader
        reference={reference}
        onPrev={() => setReference((d) => addMonths(d, -1))}
        onNext={() => setReference((d) => addMonths(d, 1))}
        onToday={() => setReference(new Date())}
      />

      <div className="lg:hidden">
        {loading ? (
          <ListSkeleton />
        ) : (
          <MobileWeekList
            reference={reference}
            classes={classes}
            onSelectClass={setSelected}
          />
        )}
      </div>
      <div className="hidden lg:block">
        {loading ? (
          <GridSkeleton />
        ) : (
          <MonthGrid reference={reference} classes={classes} onSelectClass={setSelected} />
        )}
      </div>

      <ClassFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        defaultDate={toIsoDate(reference)}
        onSaved={() => {
          setCreateOpen(false);
          void refresh();
        }}
      />

      <ClassFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        mode="edit"
        cls={editing}
        onSaved={() => {
          setEditing(null);
          void refresh();
        }}
      />

      <AdminClassDrawer
        cls={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onEdit={() => {
          if (selected) setEditing(selected);
          setSelected(null);
        }}
        onBlocked={() => void refresh()}
      />
    </div>
  );
}

/* --------------------------- Dialog: create/edit --------------------------- */

function ClassFormDialog({
  open,
  onOpenChange,
  mode,
  cls,
  defaultDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  cls?: ClassWithCount | null;
  defaultDate?: string;
  onSaved: () => void;
}) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("18:30");
  const [endTime, setEndTime] = useState("20:30");
  const [capacityIdeal, setCapacityIdeal] = useState(6);
  const [capacityMax, setCapacityMax] = useState(7);
  const [status, setStatus] = useState<ClassStatus>("scheduled");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && cls) {
      setDate(cls.date);
      setStartTime(cls.start_time.slice(0, 5));
      setEndTime(cls.end_time.slice(0, 5));
      setCapacityIdeal(cls.capacity_ideal);
      setCapacityMax(cls.capacity_max);
      setStatus(cls.status);
    } else if (mode === "create") {
      setDate(defaultDate ?? toIsoDate(new Date()));
      setStartTime("18:30");
      setEndTime("20:30");
      setCapacityIdeal(6);
      setCapacityMax(7);
      setStatus("scheduled");
    }
  }, [open, mode, cls, defaultDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (endTime <= startTime) {
      toast.error("La hora de fin debe ser posterior a la de inicio");
      return;
    }
    if (capacityMax < capacityIdeal) {
      toast.error("La capacidad máxima debe ser ≥ a la ideal");
      return;
    }
    setSubmitting(true);
    if (mode === "create") {
      const { error } = await supabase.from("classes").insert({
        date,
        start_time: startTime,
        end_time: endTime,
        capacity_ideal: capacityIdeal,
        capacity_max: capacityMax,
        status,
      });
      setSubmitting(false);
      if (error) {
        toast.error("No se pudo crear la clase", { description: error.message });
        return;
      }
      toast.success("Clase creada");
      onSaved();
    } else if (mode === "edit" && cls) {
      const { error } = await supabase
        .from("classes")
        .update({
          date,
          start_time: startTime,
          end_time: endTime,
          capacity_ideal: capacityIdeal,
          capacity_max: capacityMax,
          status,
        })
        .eq("id", cls.id);
      setSubmitting(false);
      if (error) {
        toast.error("No se pudo actualizar", { description: error.message });
        return;
      }
      toast.success("Clase actualizada");
      onSaved();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Crear clase" : "Editar clase"}</DialogTitle>
          <DialogDescription>
            Define el horario y la capacidad. Los cambios son inmediatos.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="date">Fecha</Label>
            <Input
              id="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start">Inicio</Label>
              <Input
                id="start"
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">Fin</Label>
              <Input
                id="end"
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cap_ideal">Capacidad ideal</Label>
              <Input
                id="cap_ideal"
                type="number"
                min={1}
                required
                value={capacityIdeal}
                onChange={(e) => setCapacityIdeal(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cap_max">Capacidad máxima</Label>
              <Input
                id="cap_max"
                type="number"
                min={1}
                required
                value={capacityMax}
                onChange={(e) => setCapacityMax(Number(e.target.value))}
              />
            </div>
          </div>
          {mode === "edit" && (
            <div className="space-y-1.5">
              <Label htmlFor="status">Estado</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ClassStatus)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Programada</SelectItem>
                  <SelectItem value="cancelled_by_admin">Bloqueada / cancelada</SelectItem>
                  <SelectItem value="auto_cancelled">Auto-cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando…" : mode === "create" ? "Crear" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------- Drawer: detail + booked students ------------------- */

type BookedStudent = {
  id: string;
  status: string;
  source: string;
  profiles: { name: string | null; surname: string | null; email: string | null } | null;
};

function AdminClassDrawer({
  cls,
  onOpenChange,
  onEdit,
  onBlocked,
}: {
  cls: ClassWithCount | null;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onBlocked: () => void;
}) {
  const open = cls !== null;
  const [students, setStudents] = useState<BookedStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    if (!cls) {
      setStudents([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadingStudents(true);
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, status, source, profiles:student_id ( name, surname, email )",
        )
        .eq("class_id", cls.id)
        .in("status", ["reserved", "confirmed", "attended"]);
      if (cancelled) return;
      if (error) {
        toast.error("No se pudieron cargar las alumnas", { description: error.message });
        setStudents([]);
      } else {
        setStudents((data ?? []) as unknown as BookedStudent[]);
      }
      setLoadingStudents(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [cls]);

  const handleBlock = async () => {
    if (!cls) return;
    setBlocking(true);
    const { error } = await supabase
      .from("classes")
      .update({ status: "cancelled_by_admin" })
      .eq("id", cls.id);
    setBlocking(false);
    if (error) {
      toast.error("No se pudo bloquear", { description: error.message });
      return;
    }
    toast.success("Horario bloqueado");
    onBlocked();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="capitalize">
            {cls ? formatLongDate(cls.date) : ""}
          </SheetTitle>
          <SheetDescription>
            {cls ? formatTimeRange(cls.start_time, cls.end_time) : ""}
          </SheetDescription>
        </SheetHeader>
        {cls ? (
          <div className="mt-6 space-y-5 px-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={cls.status === "scheduled" ? "secondary" : "destructive"}>
                {statusLabel(cls.status)}
              </Badge>
              <Badge variant="outline">
                {cls.booked_count}/{cls.capacity_max} reservadas
              </Badge>
            </div>

            <div>
              <h4 className="text-label mb-2 uppercase">Alumnas inscritas</h4>
              {loadingStudents ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : students.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay alumnas inscritas.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {students.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {[s.profiles?.name, s.profiles?.surname].filter(Boolean).join(" ") ||
                            s.profiles?.email ||
                            "Alumna"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {s.profiles?.email}
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {bookingStatusLabel(s.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <Button variant="secondary" className="flex-1" onClick={onEdit}>
                Editar clase
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleBlock}
                disabled={blocking || cls.status === "cancelled_by_admin"}
              >
                {cls.status === "cancelled_by_admin" ? "Ya bloqueada" : "Bloquear horario"}
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function statusLabel(s: ClassStatus): string {
  if (s === "scheduled") return "Programada";
  if (s === "cancelled_by_admin") return "Bloqueada";
  return "Auto-cancelada";
}

function bookingStatusLabel(s: string): string {
  switch (s) {
    case "reserved":
      return "Reservada";
    case "confirmed":
      return "Confirmada";
    case "attended":
      return "Asistió";
    default:
      return s;
  }
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-px rounded-xl border border-border bg-border p-px shadow-card">
      {Array.from({ length: 42 }).map((_, i) => (
        <div key={i} className="h-[110px] animate-pulse bg-surface" />
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-surface" />
      ))}
    </div>
  );
}