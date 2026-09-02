import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Search,
  UserPlus,
  ArrowLeftRight,
  Gift,
  BellRing,
  MessageCircle,
  ChevronUp,
  ChevronDown,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import {
  endOfMonth,
  formatLongDate,
  formatTimeRange,
  startOfMonth,
  toIsoDate,
  weekdayOf,
} from "@/lib/calendar";
import { deleteMember, sendPaymentReminder } from "@/lib/admin-tools";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/auth";
import {
  deriveEstado,
  ESTADO_LABELS,
  formatSlot,
  ROLE_LABELS,
  summarizeMonthClasses,
  type Estado,
  type MembershipStatus,
  type MonthClassDay,
} from "@/lib/members";
import { compareMembers, type MemberSortDir, type MemberSortKey } from "@/lib/members-sort";
import { TagPicker, type Tag } from "@/components/admin/TagPicker";
import { SlotEditor } from "@/components/admin/SlotEditor";

export const Route = createFileRoute("/admin/alumnas")({
  head: () => ({ meta: [{ title: "Miembros — Admin" }] }),
  component: AdminStudentsPage,
});

type StudentRow = {
  id: string;
  role: Role;
  membership_status: MembershipStatus;
  is_regular: boolean;
  is_archived: boolean;
  name: string | null;
  surname: string | null;
  email: string | null;
  whatsapp: string | null;
  plan_name: string | null;
  pending_makeups: number;
  tags: { id: string; name: string }[];
  slots: { id: string; weekday: number; start_time: string }[];
  estado: Estado;
  assigned_instructor: string | null;
  month_classes: MonthClassDay[];
  has_real_payment: boolean;
  payment: PaymentState;
};

/** Cómo está el pago de las clases de una alumna: ya cobrado (tarjeta/Bizum),
 * pendiente (normalmente efectivo en el taller) o sin ningún pago registrado. */
type PaymentState = {
  tone: "paid" | "pending" | "none";
  label: string;
};

function paymentMethodLabel(method: string | null) {
  if (method === "cash") return "Efectivo";
  if (method === "bizum") return "Bizum";
  if (method === "card") return "Tarjeta";
  return "Sin método";
}


function SortableHeader({
  label,
  sortKey: key,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: MemberSortKey;
  activeKey: MemberSortKey;
  dir: MemberSortDir;
  onSort: (key: MemberSortKey) => void;
  className?: string;
}) {
  const active = key === activeKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(key)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    </TableHead>
  );
}

type PlanOption = { id: string; name: string; price_cents: number };

const ESTADO_BADGE: Record<Estado, "default" | "secondary" | "outline" | "destructive"> = {
  activa: "default",
  pausada: "secondary",
  inactiva: "destructive",
  sin_actividad: "outline",
};

function fullName(p: { name: string | null; surname: string | null; email: string | null }) {
  return [p.name, p.surname].filter(Boolean).join(" ").trim() || p.email || "—";
}

function AdminStudentsPage() {
  const { role: viewerRole } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [tagFilter, setTagFilter] = useState<"all" | string>("all");
  const [estadoFilter, setEstadoFilter] = useState<"all" | Estado>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<MemberSortKey>("name");
  const [sortDir, setSortDir] = useState<MemberSortDir>("asc");
  const [deleteTarget, setDeleteTarget] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantStudent, setGrantStudent] = useState<StudentRow | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderStudent, setReminderStudent] = useState<StudentRow | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("plans")
        .select("id, name, price_cents")
        .eq("active", true)
        .order("classes_per_month", { ascending: true });
      setPlans((data ?? []) as PlanOption[]);
    })();
    void (async () => {
      const { data } = await supabase.from("tags").select("id, name, color").order("name");
      setAllTags((data ?? []) as Tag[]);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const now = new Date();
    const monthStart = toIsoDate(startOfMonth(now));
    const monthEndIso = toIsoDate(endOfMonth(now));
    // A fin de mes las reservas ya son del mes siguiente: miramos también ese
    // mes para no mostrar "Sin reservas" cuando en realidad ya han reservado.
    const nextMonthRef = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthEndIso = toIsoDate(endOfMonth(nextMonthRef));
    type ProfileRow = {
      id: string;
      role: string | null;
      name: string | null;
      surname: string | null;
      email: string | null;
      whatsapp: string | null;
      membership_status: string | null;
      is_regular: boolean | null;
      is_archived: boolean | null;
      assigned_instructor: string | null;
      profile_tags: { tags: { id: string; name: string } | null }[];
      recurring_slots: { id: string; weekday: number; start_time: string }[];
    };
    const { data: profiles } = await (supabase
      .from("profiles")
      .select(
        "id, role, name, surname, email, whatsapp, membership_status, is_regular, is_archived, assigned_instructor, profile_tags(tags(id,name)), recurring_slots(id,weekday,start_time)",
      )
      .order("created_at", { ascending: false }) as unknown as Promise<{
      data: ProfileRow[] | null;
    }>);
    const [
      { data: subs },
      { data: makeups },
      { data: plansList },
      { data: monthBookings },
      { data: realPayments },
    ] = await Promise.all([
      supabase.from("subscriptions").select("student_id, plan_id").eq("month", monthStart),
      supabase
        .from("makeups")
        .select("student_id")
        .is("used_booking_id", null)
        .gt("expires_at", new Date().toISOString()),
      supabase.from("plans").select("id, name"),
      supabase
        .from("bookings")
        .select("student_id, classes!inner(date)")
        .gte("classes.date", monthStart)
        .lte("classes.date", nextMonthEndIso)
        .in("status", ["reserved", "confirmed", "attended"]),
      supabase
        .from("payments")
        .select("student_id, status, method, created_at")
        .gt("amount_cents", 0)
        .order("created_at", { ascending: true }),

    ]);
    const planNameById = new Map((plansList ?? []).map((p) => [p.id, p.name]));
    const subByStudent = new Map(
      (subs ?? []).map((s) => [s.student_id, { plan_name: planNameById.get(s.plan_id) ?? null }]),
    );
    const makeupCount = new Map<string, number>();
    for (const m of makeups ?? [])
      makeupCount.set(m.student_id, (makeupCount.get(m.student_id) ?? 0) + 1);
    type BookingRow = { student_id: string; classes: { date: string } };
    const allBookings = (monthBookings ?? []) as BookingRow[];
    // Si el mes en curso aún no tiene reservas, mostramos las del mes siguiente.
    const currentMonthBookings = allBookings.filter((b) => b.classes.date <= monthEndIso);
    const activeBookings =
      currentMonthBookings.length > 0 ? currentMonthBookings : allBookings;
    const bookedThisMonth = new Set(activeBookings.map((b) => b.student_id));
    type PaymentRow = {
      student_id: string;
      status: string;
      method: string | null;
      created_at: string;
    };
    const paymentRows = (realPayments ?? []) as PaymentRow[];
    const studentsWithRealPayment = new Set(paymentRows.map((p) => p.student_id));
    // Un pago confirmado manda sobre cualquier intento pendiente o fallido.
    const paymentByStudent = new Map<string, PaymentState>();
    for (const p of paymentRows) {
      const current = paymentByStudent.get(p.student_id);
      if (p.status === "confirmed") {
        paymentByStudent.set(p.student_id, {
          tone: "paid",
          label: `Pagado · ${paymentMethodLabel(p.method)}`,
        });
      } else if (p.status === "pending" && current?.tone !== "paid") {
        paymentByStudent.set(p.student_id, {
          tone: "pending",
          label: `Pendiente · ${paymentMethodLabel(p.method)}`,
        });
      } else if (!current) {
        paymentByStudent.set(p.student_id, { tone: "none", label: "Pago no completado" });
      }
    }

    const monthClassesByStudent = new Map<string, MonthClassDay[]>();
    for (const b of activeBookings) {
      const list = monthClassesByStudent.get(b.student_id) ?? [];
      list.push({ date: b.classes.date, weekday: weekdayOf(b.classes.date) });
      monthClassesByStudent.set(b.student_id, list);
    }

    const result: StudentRow[] = (profiles ?? []).map((p) => {
      const tags = ((p.profile_tags ?? []) as { tags: { id: string; name: string } | null }[])
        .map((pt) => pt.tags)
        .filter((t): t is { id: string; name: string } => t !== null);
      const slots = ((p.recurring_slots ?? []) as StudentRow["slots"]).slice();
      const membership = (p.membership_status ?? "active") as MembershipStatus;
      const isRegular = Boolean(p.is_regular);
      return {
        id: p.id,
        role: (p.role ?? "user") as Role,
        membership_status: membership,
        is_regular: isRegular,
        is_archived: Boolean(p.is_archived),
        name: p.name,
        surname: p.surname,
        email: p.email,
        whatsapp: p.whatsapp,
        plan_name: subByStudent.get(p.id)?.plan_name ?? null,
        pending_makeups: makeupCount.get(p.id) ?? 0,
        tags,
        slots,
        estado: deriveEstado(membership, bookedThisMonth.has(p.id), isRegular),
        assigned_instructor: p.assigned_instructor ?? null,
        month_classes: monthClassesByStudent.get(p.id) ?? [],
        has_real_payment: studentsWithRealPayment.has(p.id),
        payment:
          paymentByStudent.get(p.id) ?? { tone: "none" as const, label: "Sin pago registrado" },

      };
    });
    setRows(result);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showArchived && r.is_archived) return false;
      if (
        q &&
        ![r.name, r.surname, r.email, r.whatsapp].some((v) => (v ?? "").toLowerCase().includes(q))
      )
        return false;
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (tagFilter !== "all" && !r.tags.some((t) => t.id === tagFilter)) return false;
      if (estadoFilter !== "all" && r.estado !== estadoFilter) return false;
      return true;
    });
  }, [rows, search, roleFilter, tagFilter, estadoFilter, showArchived]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => compareMembers(a, b, sortKey, sortDir)),
    [filtered, sortKey, sortDir],
  );

  const handleSort = (key: MemberSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleArchived = async (r: StudentRow) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_archived: !r.is_archived })
      .eq("id", r.id);
    if (error) {
      toast.error("No se pudo actualizar");
      return;
    }
    toast.success(r.is_archived ? "Miembro desarchivado" : "Miembro archivado");
    void load();
  };

  const canDelete = (r: StudentRow) => r.role === "user" && !r.has_real_payment;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMember(deleteTarget.id);
      toast.success("Miembro eliminado");
      setDeleteTarget(null);
      void load();
    } catch (err) {
      toast.error("No se pudo eliminar el miembro", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <span className="text-label">Personas</span>
            <h1 className="text-h1 mt-1">Miembros</h1>
            <p className="text-body mt-2 text-muted-foreground">
              Busca, filtra por rol, tag o estado y revisa su actividad.
            </p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, email…"
              aria-label="Buscar miembros"
              className="pl-9"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as "all" | Role)}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Filtrar por rol">
              <SelectValue placeholder="Rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los roles</SelectItem>
              <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
              <SelectItem value="instructora">{ROLE_LABELS.instructora}</SelectItem>
              <SelectItem value="user">{ROLE_LABELS.user}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tagFilter} onValueChange={(v) => setTagFilter(v)}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Filtrar por tag">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tags</SelectItem>
              {allTags.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={estadoFilter} onValueChange={(v) => setEstadoFilter(v as "all" | Estado)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="activa">{ESTADO_LABELS.activa}</SelectItem>
              <SelectItem value="pausada">{ESTADO_LABELS.pausada}</SelectItem>
              <SelectItem value="inactiva">{ESTADO_LABELS.inactiva}</SelectItem>
              <SelectItem value="sin_actividad">{ESTADO_LABELS.sin_actividad}</SelectItem>
            </SelectContent>
          </Select>
          {tagFilter !== "all" ? (
            <Button
              variant="secondary"
              className="col-span-2 sm:col-auto"
              onClick={() => navigate({ to: "/admin/mensajes", search: { tag: tagFilter } })}
            >
              <MessageCircle className="mr-1 h-4 w-4" /> Enviar mensaje a este grupo
            </Button>
          ) : null}
          <label className="col-span-2 flex items-center gap-2 sm:col-auto sm:ml-auto">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            <span className="text-body text-muted-foreground">Mostrar archivadas</span>
          </label>
        </div>

        <Card className="">
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="flex flex-col gap-2 p-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<UserPlus className="h-5 w-5" />}
                  title={rows.length === 0 ? "Aún no hay miembros" : "Sin resultados"}
                  description={
                    rows.length === 0
                      ? "Los miembros aparecerán aquí cuando se registren."
                      : "Prueba con otro término de búsqueda o filtro."
                  }
                />
              </div>
            ) : (
              <>
                <ul className="divide-y divide-border md:hidden">
                  {sorted.map((r) => (
                    <li
                      key={`m-${r.id}`}
                      className="flex flex-col cursor-pointer gap-2 p-4"
                      onClick={() => setSelected(r)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{fullName(r)}</p>
                          {r.email ? (
                            <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                          ) : null}
                        </div>
                        <Badge variant={ESTADO_BADGE[r.estado]} className="shrink-0">
                          {ESTADO_LABELS[r.estado]}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge variant="outline">{ROLE_LABELS[r.role]}</Badge>
                        {r.month_classes.length > 0 ? (
                          <Badge className="bg-success text-success-foreground">
                            Reservas · {r.month_classes.length}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Sin reservas
                          </Badge>
                        )}
                        {viewerRole === "admin" ? <PaymentBadge payment={r.payment} /> : null}

                        {viewerRole === "admin" && r.pending_makeups > 0 ? (
                          <span className="text-muted-foreground">{r.pending_makeups} recup.</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {summarizeMonthClasses(r.month_classes).tooltip || "Sin clases este mes"}
                      </p>
                      {viewerRole === "admin" ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReminderStudent(r);
                              setReminderOpen(true);
                            }}
                            aria-label="Enviar recordatorio de pago"
                          >
                            <BellRing className="h-4 w-4" />
                          </Button>
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
                            <Gift className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              void toggleArchived(r);
                            }}
                            aria-label={r.is_archived ? "Desarchivar miembro" : "Archivar miembro"}
                          >
                            {r.is_archived ? (
                              <ArchiveRestore className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                          </Button>
                          {canDelete(r) ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(r);
                              }}
                              aria-label="Eliminar miembro"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHeader
                          label="Miembro"
                          sortKey="name"
                          activeKey={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                        <TableHead className="hidden xl:table-cell">Email</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead className="hidden lg:table-cell">Tags</TableHead>
                        <SortableHeader
                          label="Estado"
                          sortKey="estado"
                          activeKey={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                          className="whitespace-nowrap"
                        />
                        <TableHead className="hidden lg:table-cell">Slot</TableHead>
                        <TableHead>Clases este mes</TableHead>
                        {viewerRole === "admin" && (
                          <>
                            <SortableHeader
                              label="Reservas"
                              sortKey="reservas"
                              activeKey={sortKey}
                              dir={sortDir}
                              onSort={handleSort}
                              className="whitespace-nowrap"
                            />
                            <TableHead className="whitespace-nowrap">Pago</TableHead>

                            <SortableHeader
                              label="Recup."
                              sortKey="recup"
                              activeKey={sortKey}
                              dir={sortDir}
                              onSort={handleSort}
                              className="text-center"
                            />
                          </>
                        )}
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((r) => {
                        const monthSummary = summarizeMonthClasses(r.month_classes);
                        return (
                          <TableRow
                            key={r.id}
                            className="cursor-pointer"
                            onClick={() => setSelected(r)}
                          >
                            <TableCell className="font-medium">
                              {fullName(r)}
                              {r.is_archived ? (
                                <Badge variant="outline" className="ml-2">
                                  Archivada
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell className="hidden truncate text-muted-foreground xl:table-cell">
                              {r.email ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{ROLE_LABELS[r.role]}</Badge>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {r.tags.length === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {r.tags.slice(0, 2).map((t) => (
                                    <Badge key={t.id} variant="secondary">
                                      {t.name}
                                    </Badge>
                                  ))}
                                  {r.tags.length > 2 ? (
                                    <Badge variant="outline">+{r.tags.length - 2}</Badge>
                                  ) : null}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge variant={ESTADO_BADGE[r.estado]}>
                                {ESTADO_LABELS[r.estado]}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground lg:table-cell">
                              {r.slots.length === 0
                                ? "—"
                                : r.slots
                                    .map((s) => formatSlot(s.weekday, s.start_time))
                                    .join(", ")}
                            </TableCell>
                            <TableCell>
                              {monthSummary.count === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex gap-1">
                                      {monthSummary.chips.map((c) => (
                                        <span
                                          key={c.date}
                                          className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] text-muted-foreground"
                                        >
                                          {c.letter}
                                        </span>
                                      ))}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>{monthSummary.tooltip}</TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                            {viewerRole === "admin" && (
                              <>
                                <TableCell className="whitespace-nowrap">
                                  {monthSummary.count > 0 ? (
                                    <Badge className="bg-success text-success-foreground">
                                      Sí · {monthSummary.count}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground">
                                      No
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  <PaymentBadge payment={r.payment} />
                                </TableCell>

                                <TableCell className="text-center">
                                  {r.pending_makeups > 0 ? (
                                    <Badge variant="outline">{r.pending_makeups}</Badge>
                                  ) : (
                                    <span className="text-muted-foreground">0</span>
                                  )}
                                </TableCell>
                              </>
                            )}
                            <TableCell className="text-right">
                              {viewerRole === "admin" ? (
                                <div className="flex justify-end gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setReminderStudent(r);
                                          setReminderOpen(true);
                                        }}
                                        aria-label="Enviar recordatorio de pago"
                                      >
                                        <BellRing className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Recordatorio de pago</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setGrantStudent(r);
                                          setGrantOpen(true);
                                        }}
                                        aria-label="Conceder recuperación"
                                      >
                                        <Gift className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Conceder recuperación</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void toggleArchived(r);
                                        }}
                                        aria-label={
                                          r.is_archived ? "Desarchivar miembro" : "Archivar miembro"
                                        }
                                      >
                                        {r.is_archived ? (
                                          <ArchiveRestore className="h-4 w-4" />
                                        ) : (
                                          <Archive className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {r.is_archived ? "Desarchivar miembro" : "Archivar miembro"}
                                    </TooltipContent>
                                  </Tooltip>
                                  {canDelete(r) ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="text-destructive hover:text-destructive"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteTarget(r);
                                          }}
                                          aria-label="Eliminar miembro"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Eliminar miembro</TooltipContent>
                                    </Tooltip>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <StudentDetailSheet
          student={selected}
          viewerRole={viewerRole}
          allTags={allTags}
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

        <PaymentReminderDialog
          open={reminderOpen}
          onOpenChange={(o) => {
            setReminderOpen(o);
            if (!o) setReminderStudent(null);
          }}
          student={reminderStudent}
          plans={plans}
        />

        <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar miembro</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget
                  ? `${fullName(deleteTarget)} se eliminará permanentemente, junto con todas sus reservas, tags y datos asociados. Esta acción no se puede deshacer.`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleDelete();
                }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Eliminando…" : "Eliminar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
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
  method: string | null;
};

function paymentMethodLabel(method: string | null) {
  if (method === "cash") return "Efectivo";
  if (method === "card") return "Tarjeta";
  if (method === "bizum") return "Bizum";
  return "—";
}

type Notif = {
  id: string;
  type: string;
  channel: string;
  status: string;
  created_at: string;
};

function StudentDetailSheet({
  student,
  viewerRole,
  allTags,
  onOpenChange,
  onChanged,
}: {
  student: StudentRow | null;
  viewerRole: Role | null;
  allTags: Tag[];
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}) {
  const open = student !== null;
  const readOnly = viewerRole !== "admin";
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const [moveBooking, setMoveBooking] = useState<Booking | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [membership, setMembership] = useState<MembershipStatus>("active");
  const [isRegular, setIsRegular] = useState(false);
  const [slots, setSlots] = useState<StudentRow["slots"]>([]);
  const [instructor, setInstructor] = useState<string | null>(null);

  useEffect(() => {
    if (!student) return;
    setTagIds(student.tags.map((t) => t.id));
    setMembership(student.membership_status);
    setIsRegular(student.is_regular);
    setSlots(student.slots);
    setInstructor(student.assigned_instructor);
  }, [student]);

  const toggleTag = async (tagId: string, next: boolean) => {
    if (!student) return;
    setTagIds((prev) => (next ? [...prev, tagId] : prev.filter((id) => id !== tagId)));
    const { error } = next
      ? await supabase.from("profile_tags").insert({ profile_id: student.id, tag_id: tagId })
      : await supabase
          .from("profile_tags")
          .delete()
          .match({ profile_id: student.id, tag_id: tagId });
    if (error) {
      toast.error(`No se pudo actualizar el tag: ${error.message}`);
      setTagIds((prev) => (next ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
      return;
    }
    onChanged();
  };

  const changeMembership = async (value: MembershipStatus) => {
    if (!student) return;
    const prev = membership;
    setMembership(value);
    const { error } = await supabase
      .from("profiles")
      .update({ membership_status: value })
      .eq("id", student.id);
    if (error) {
      toast.error(`No se pudo actualizar el estado: ${error.message}`);
      setMembership(prev);
      return;
    }
    onChanged();
  };

  const changeRegular = async (value: boolean) => {
    if (!student) return;
    setIsRegular(value);
    const { error } = await supabase
      .from("profiles")
      .update({ is_regular: value })
      .eq("id", student.id);
    if (error) {
      toast.error(`No se pudo actualizar: ${error.message}`);
      setIsRegular(!value);
      return;
    }
    onChanged();
  };

  const changeInstructor = async (value: string | null) => {
    if (!student) return;
    const prev = instructor;
    setInstructor(value);
    const { error } = await (supabase
      .from("profiles")
      .update({ assigned_instructor: value } as object)
      .eq("id", student.id) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) {
      toast.error(`No se pudo actualizar la profesora: ${error.message}`);
      setInstructor(prev);
      return;
    }
    onChanged();
  };

  const addSlot = async (weekday: number, startTime: string) => {
    if (!student) return;
    const { data, error } = await supabase
      .from("recurring_slots")
      .insert({ student_id: student.id, weekday, start_time: startTime })
      .select("id, weekday, start_time")
      .single();
    if (error || !data) {
      toast.error(`No se pudo añadir el slot: ${error?.message ?? ""}`);
      return;
    }
    setSlots((prev) => [...prev, data]);
    onChanged();
  };

  const removeSlot = async (slotId: string) => {
    if (!student) return;
    const prev = slots;
    setSlots((s) => s.filter((x) => x.id !== slotId));
    const { error } = await supabase.from("recurring_slots").delete().eq("id", slotId);
    if (error) {
      toast.error(`No se pudo quitar el slot: ${error.message}`);
      setSlots(prev);
      return;
    }
    onChanged();
  };

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
          .select("id, amount_cents, status, created_at, stripe_session_id, method")
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

              <section className="flex flex-col mt-6 gap-4">
                <h3 className="text-h3">Actividad y tags</h3>
                <div className="flex flex-col gap-2">
                  <Label>Tags</Label>
                  <TagPicker
                    allTags={allTags}
                    selectedIds={tagIds}
                    onToggle={(id, next) => void toggleTag(id, next)}
                    disabled={readOnly}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="membership-status">Estado de membresía</Label>
                  <Select
                    value={membership}
                    onValueChange={(v) => void changeMembership(v as MembershipStatus)}
                    disabled={readOnly}
                  >
                    <SelectTrigger id="membership-status" className="w-full sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Activa</SelectItem>
                      <SelectItem value="paused">Pausada</SelectItem>
                      <SelectItem value="inactive">Inactiva</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <Label htmlFor="is-regular" className="cursor-pointer">
                    Habitual (cuenta como activa)
                  </Label>
                  <Switch
                    id="is-regular"
                    checked={isRegular}
                    onCheckedChange={(v) => void changeRegular(v)}
                    disabled={readOnly}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Profesora asignada</Label>
                  <Select
                    value={instructor ?? "none"}
                    onValueChange={(v) => void changeInstructor(v === "none" ? null : v)}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      <SelectItem value="Cande">Cande</SelectItem>
                      <SelectItem value="Sofi">Sofi</SelectItem>
                      <SelectItem value="Martu">Martu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Slot fijo</Label>
                  <SlotEditor
                    slots={slots.map((s) => ({ ...s, active: true, note: null }))}
                    onAdd={(weekday, startTime) => void addSlot(weekday, startTime)}
                    onRemove={(id) => void removeSlot(id)}
                    disabled={readOnly}
                  />
                </div>
              </section>

              <section className="flex flex-col mt-6 gap-2">
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
                            {b.class ? formatTimeRange(b.class.start_time, b.class.end_time) : ""} ·{" "}
                            {bookingStatusLabel(b.status)}
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

              {!readOnly && (
                <>
                  <section className="flex flex-col mt-6 gap-2">
                    <h3 className="text-h3">Pagos</h3>
                    {loading ? (
                      <Skeleton className="h-16 w-full" />
                    ) : payments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin pagos registrados.</p>
                    ) : (
                      <ul className="divide-y divide-border rounded-lg border border-border">
                        {payments.map((p) => (
                          <li
                            key={p.id}
                            className="flex items-center justify-between px-3 py-2 text-sm"
                          >
                            <span>
                              {new Date(p.created_at).toLocaleDateString("es-ES")} ·{" "}
                              <span className="text-muted-foreground">
                                {paymentMethodLabel(p.method)} · {p.status}
                              </span>
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

                  <section className="flex flex-col mt-6 gap-2">
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
              )}
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
            Elige la clase de destino y deja una nota explicando el motivo. Quedará registrado en la
            auditoría.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
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
          <div className="flex flex-col gap-2">
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
        <div className="flex flex-col gap-2">
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

function PaymentReminderDialog({
  open,
  onOpenChange,
  student,
  plans,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: StudentRow | null;
  plans: PlanOption[];
}) {
  const [planId, setPlanId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setPlanId("");
  }, [open]);

  const submit = async () => {
    if (!student || !planId) return;
    setSubmitting(true);
    try {
      await sendPaymentReminder(student.id, planId);
      toast.success("Recordatorio de pago enviado.");
      onOpenChange(false);
    } catch (e) {
      toast.error("No se pudo enviar el recordatorio", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar recordatorio de pago</DialogTitle>
          <DialogDescription>
            {student ? `Para ${fullName(student)}.` : ""} Elige el plan: se generará un enlace de
            pago de Stripe y se enviará el recordatorio.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reminder-plan">Plan</Label>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay planes activos disponibles.</p>
          ) : (
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger id="reminder-plan">
                <SelectValue placeholder="Selecciona un plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ·{" "}
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 0,
                    }).format(p.price_cents / 100)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!planId || submitting}>
            {submitting ? "Enviando…" : "Enviar recordatorio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentBadge({ payment }: { payment: PaymentState }) {
  if (payment.tone === "paid")
    return <Badge className="bg-success text-success-foreground">{payment.label}</Badge>;
  if (payment.tone === "pending")
    return <Badge className="bg-warning text-warning-foreground">{payment.label}</Badge>;
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {payment.label}
    </Badge>
  );
}
