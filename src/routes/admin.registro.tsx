import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  NotebookPen,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { supabase } from "@/integrations/supabase/client";
import { MultiTeacherSelect } from "@/components/finance/MultiTeacherSelect";
import { RouteGuard } from "@/components/RouteGuard";
import { monthOrder } from "@/lib/finance/dates";
import { ExportDialog } from "@/components/finance/ExportDialog";

export const Route = createFileRoute("/admin/registro")({
  head: () => ({ meta: [{ title: "Registro — Admin" }] }),
  component: AdminLedgerRoute,
});

function AdminLedgerRoute() {
  return (
    <RouteGuard requireAdmin>
      <AdminLedgerPage />
    </RouteGuard>
  );
}

/**
 * `ledger_entries` is admin-only via RLS (is_admin()) and is not yet reflected in
 * the generated Supabase types. We cast the query builder to a permissive shape —
 * same approach as the `mark_attendance` cast in admin.clases.tsx — so the file
 * type-checks while still hitting the real table directly through supabase.from().
 */
type LedgerEntry = {
  id: string;
  entry_date: string | null;
  month: string | null;
  student_name: string | null;
  item: string | null;
  category: string | null;
  amount_cents: number | null;
  method: string | null;
  status: string | null;
  notes: string | null;
  collector: string[] | null;
  commission_pct_override: number | null;
  created_at: string;
};

type Orderable = {
  order: (
    col: string,
    opts: { ascending: boolean; nullsFirst?: boolean },
  ) => Orderable & Promiseable;
};

type Promiseable = {
  then: Promise<{
    data: LedgerEntry[] | null;
    error: { message: string } | null;
  }>["then"];
};

const WEEKDAY_RE = /^(lunes|martes|miércoles|miercoles|miercole|jueves|viernes|sábado|sabado|domingo|niños|ninos)/i;
function itemGroup(item: string | null): number {
  const s = (item ?? "").trim().toLowerCase();
  if (!s) return 5;
  if (WEEKDAY_RE.test(s)) return 0;
  if (s.startsWith("alumnos")) return 0;
  if (s === "clase suelta") return 1;
  if (s.includes("coworker")) return 2;
  if (s.startsWith("taller") || s.includes("workshop")) return 3;
  return 4;
}

const WEEKDAY_ORDER: Record<string, number> = {
  lunes: 0,
  martes: 1,
  miércoles: 2,
  miercoles: 2,
  miercole: 2,
  jueves: 3,
  viernes: 4,
  sábado: 5,
  sabado: 5,
  domingo: 6,
  niños: 7,
  ninos: 7,
};

function weekdayIndex(item: string | null): number {
  const s = (item ?? "").trim().toLowerCase();
  const m = s.match(WEEKDAY_RE);
  if (!m) return 99;
  return WEEKDAY_ORDER[m[1]] ?? 99;
}

function itemMinutes(item: string | null): number {
  const s = (item ?? "").trim();
  const m = s.match(/(\d{1,2})[.:](\d{2})/);
  if (!m) return Number.POSITIVE_INFINITY;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return Number.POSITIVE_INFINITY;
  return h * 60 + min;
}

type LedgerTable = {
  select: (cols: string) => Orderable & Promiseable;
  insert: (
    values: Partial<LedgerEntry>,
  ) => Promise<{ error: { message: string } | null }>;
  update: (values: Partial<LedgerEntry>) => {
    eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
  };
  delete: () => {
    eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
  };
};

function ledger(): LedgerTable {
  return (supabase.from as unknown as (table: "ledger_entries") => LedgerTable)(
    "ledger_entries",
  );
}

const ALL = "all";

function formatEur(cents: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}

const METHOD_LABELS: Record<string, string> = {
  T: "Tarjeta",
  E: "Efectivo",
  B: "Bizum",
  R: "Revolut",
};

function currentMonthLabel() {
  return new Date().toLocaleDateString("es-ES", { month: "long" }).toUpperCase();
}

function formatDateOrMonth(entryDate: string | null, month: string | null): string {
  if (entryDate) {
    const d = new Date(entryDate + "T00:00:00");
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  }
  if (month) return month.slice(0, 3).toLowerCase();
  return "—";
}

function rowBg(status: string | null): string {
  if (status === "Pagado") return "bg-green-50 hover:bg-green-100/60";
  if (status === "Pendiente") return "bg-amber-50 hover:bg-amber-100/60";
  if (status === "ausente") return "bg-muted/40 opacity-70 hover:opacity-100";
  return "";
}

// --- Column visibility ---

type ColumnKey = "fecha" | "alumno" | "item" | "categoria" | "importe" | "metodo" | "estado" | "notas";

const COLUMN_DEFS: { key: ColumnKey; label: string; locked?: boolean }[] = [
  { key: "fecha",     label: "Fecha" },
  { key: "alumno",    label: "Alumno", locked: true },
  { key: "item",      label: "Clase / Producto" },
  { key: "categoria", label: "Categoría" },
  { key: "importe",   label: "Importe", locked: true },
  { key: "metodo",    label: "Método" },
  { key: "estado",    label: "Estado" },
  { key: "notas",     label: "Notas" },
];

const DEFAULT_VISIBLE = new Set<ColumnKey>([
  "fecha", "alumno", "item", "categoria", "importe", "metodo", "notas",
  // "estado" hidden by default — row color used instead
]);

function ColumnPicker({
  visible,
  onChange,
}: {
  visible: Set<ColumnKey>;
  onChange: (v: Set<ColumnKey>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((p) => !p)} className="gap-1.5">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Columnas
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-border bg-popover py-1 shadow-md">
          {COLUMN_DEFS.map(({ key, label, locked }) => (
            <label
              key={key}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent ${locked ? "cursor-default opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                checked={visible.has(key)}
                disabled={locked}
                className="accent-primary"
                onChange={() => {
                  const next = new Set(visible);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  onChange(next);
                }}
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Sortable column header ---

type SortState = { key: string; dir: "asc" | "desc" } | null;

function SortableHead({
  sortKey,
  sort,
  onSort,
  children,
  className = "",
}: {
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/40 ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {children}
        {active ? (
          sort!.dir === "asc"
            ? <ChevronUp className="h-3 w-3 text-primary" />
            : <ChevronDown className="h-3 w-3 text-primary" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground/40" />
        )}
      </div>
    </TableHead>
  );
}

function AdminLedgerPage() {
  const [rows, setRows] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [methodFilter, setMethodFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [monthFilter, setMonthFilter] = useState(currentMonthLabel());
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LedgerEntry | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "fecha", dir: "desc" });
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(new Set(DEFAULT_VISIBLE));
  const [exportOpen, setExportOpen] = useState(false);

  const handleSort = (key: string) => {
    setSort((prev) => {
      if (prev?.key === key) {
        return prev.dir === "asc" ? { key, dir: "desc" } : null;
      }
      return { key, dir: "asc" };
    });
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await ledger()
      .select(
        "id, entry_date, month, student_name, item, category, amount_cents, method, status, notes, collector, commission_pct_override, created_at",
      )
      .order("entry_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("No se pudo cargar el registro", { description: error.message });
      setRows([]);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("ledger:insert", handler);
    return () => window.removeEventListener("ledger:insert", handler);
  }, []);

  const categories = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.category).filter((c): c is string => !!c))).sort(),
    [rows],
  );
  const months = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.month).filter((m): m is string => !!m))).sort(
        (a, b) => {
          const oa = monthOrder(a);
          const ob = monthOrder(b);
          if (oa !== ob) return oa - ob;
          return a.localeCompare(b);
        },
      ),
    [rows],
  );
  const methods = useMemo(
    () => Array.from(new Set(rows.map((r) => r.method).filter((m): m is string => !!m))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = rows.filter((r) => {
      if (statusFilter !== ALL && r.status !== statusFilter) return false;
      if (methodFilter !== ALL && r.method !== methodFilter) return false;
      if (categoryFilter !== ALL && r.category !== categoryFilter) return false;
      if (monthFilter !== ALL && r.month !== monthFilter) return false;
      if (q) {
        const hay = [r.student_name, r.notes].some((v) => (v ?? "").toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });

    if (sort) {
      // User-selected column sort overrides the default grouping sort
      return [...result].sort((a, b) => {
        let av: string | number | null;
        let bv: string | number | null;
        switch (sort.key) {
          case "fecha":      av = a.entry_date ?? a.month ?? ""; bv = b.entry_date ?? b.month ?? ""; break;
          case "alumno":     av = a.student_name; bv = b.student_name; break;
          case "item":       av = a.item;         bv = b.item; break;
          case "categoria":  av = a.category;     bv = b.category; break;
          case "importe":    av = a.amount_cents; bv = b.amount_cents; break;
          case "metodo":     av = a.method;       bv = b.method; break;
          case "estado":     av = a.status;       bv = b.status; break;
          default:           return 0;
        }
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv), "es");
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }

    // Default: group by class type, then weekday + time
    return result
      .map((r, i) => ({
        r,
        i,
        g: itemGroup(r.item),
        k: (r.item ?? "").trim().toLowerCase(),
        wd: weekdayIndex(r.item),
        mn: itemMinutes(r.item),
      }))
      .sort((a, b) => {
        if (a.g !== b.g) return a.g - b.g;
        if (a.g === 0) {
          if (a.wd !== b.wd) return a.wd - b.wd;
          if (a.mn !== b.mn) return a.mn - b.mn;
        }
        if (a.g === 4 && a.k !== b.k) return a.k.localeCompare(b.k);
        return a.i - b.i;
      })
      .map(({ r }) => r);
  }, [rows, search, statusFilter, methodFilter, categoryFilter, monthFilter, sort]);

  const totals = useMemo(() => {
    let cobrado = 0;
    let pendiente = 0;
    for (const r of filtered) {
      const cents = r.amount_cents ?? 0;
      if (r.status === "Pagado") cobrado += cents;
      else if (r.status === "Pendiente") pendiente += cents;
    }
    return { cobrado, pendiente, count: filtered.length };
  }, [filtered]);

  const col = (key: ColumnKey) => visibleCols.has(key);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-label uppercase">Finanzas</span>
          <h1 className="text-h1 mt-1">Registro</h1>
          <p className="text-body mt-2 text-muted-foreground">
            El cuaderno de ingresos y actividad. Filtra, edita y añade entradas manualmente.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setExportOpen(true)} size="lg" variant="outline" className="gap-2">
            <FileDown className="h-4 w-4" /> Exportar
          </Button>
          <Button onClick={() => setCreating(true)} size="lg" className="gap-2">
            <Plus className="h-4 w-4" /> Nueva entrada
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-label uppercase text-muted-foreground">Cobrado</p>
            <p className="mt-1 text-2xl font-semibold text-success">
              {formatEur(totals.cobrado)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-label uppercase text-muted-foreground">Pendiente</p>
            <p className="mt-1 text-2xl font-semibold text-warning">
              {formatEur(totals.pendiente)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-label uppercase text-muted-foreground">Entradas</p>
            <p className="mt-1 text-2xl font-semibold">{totals.count}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardContent className="grid gap-3 p-4 md:grid-cols-3 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="search">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Alumno o notas…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-status">Estado</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="f-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                <SelectItem value="Pagado">Pagado</SelectItem>
                <SelectItem value="Pendiente">Pendiente</SelectItem>
                <SelectItem value="ausente">Ausente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-method">Método</Label>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger id="f-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {methods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m} · {METHOD_LABELS[m] ?? m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-category">Categoría</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id="f-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-month">Mes</Label>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger id="f-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Legend + column picker */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
            Pagado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            Pendiente
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
            Ausente
          </span>
          <span className="hidden sm:inline">· T=Tarjeta · E=Efectivo · B=Bizum · R=Revolut</span>
        </div>
        <ColumnPicker visible={visibleCols} onChange={setVisibleCols} />
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
                icon={<NotebookPen className="h-5 w-5" />}
                title={rows.length === 0 ? "Aún no hay entradas" : "Sin resultados"}
                description={
                  rows.length === 0
                    ? "Añade una entrada para empezar el registro."
                    : "Ajusta los filtros para ver más resultados."
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {col("fecha") && (
                    <SortableHead sortKey="fecha" sort={sort} onSort={handleSort}>
                      Fecha
                    </SortableHead>
                  )}
                  {col("alumno") && (
                    <SortableHead sortKey="alumno" sort={sort} onSort={handleSort}>
                      Alumno
                    </SortableHead>
                  )}
                  {col("item") && (
                    <SortableHead sortKey="item" sort={sort} onSort={handleSort}>
                      Clase / Producto
                    </SortableHead>
                  )}
                  {col("categoria") && (
                    <SortableHead
                      sortKey="categoria"
                      sort={sort}
                      onSort={handleSort}
                      className="hidden lg:table-cell"
                    >
                      Categoría
                    </SortableHead>
                  )}
                  {col("importe") && (
                    <SortableHead
                      sortKey="importe"
                      sort={sort}
                      onSort={handleSort}
                      className="text-right"
                    >
                      Importe
                    </SortableHead>
                  )}
                  {col("metodo") && (
                    <SortableHead sortKey="metodo" sort={sort} onSort={handleSort}>
                      Método
                    </SortableHead>
                  )}
                  {col("estado") && (
                    <SortableHead sortKey="estado" sort={sort} onSort={handleSort}>
                      Estado
                    </SortableHead>
                  )}
                  {col("notas") && (
                    <TableHead className="hidden xl:table-cell">Notas</TableHead>
                  )}
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className={`cursor-pointer ${rowBg(r.status)}`}
                    onClick={() => setEditing(r)}
                  >
                    {col("fecha") && (
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateOrMonth(r.entry_date, r.month)}
                      </TableCell>
                    )}
                    {col("alumno") && (
                      <TableCell className="font-medium">{r.student_name ?? "—"}</TableCell>
                    )}
                    {col("item") && (
                      <TableCell>{r.item ?? "—"}</TableCell>
                    )}
                    {col("categoria") && (
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {r.category ?? "—"}
                      </TableCell>
                    )}
                    {col("importe") && (
                      <TableCell className="text-right font-semibold tabular-nums">
                        {r.amount_cents != null ? formatEur(r.amount_cents) : "—"}
                      </TableCell>
                    )}
                    {col("metodo") && (
                      <TableCell>
                        {r.method ? (
                          <Badge variant="outline" title={METHOD_LABELS[r.method] ?? r.method}>
                            {r.method}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    {col("estado") && (
                      <TableCell>
                        <Badge
                          className={
                            r.status === "Pagado"
                              ? "bg-success text-success-foreground"
                              : r.status === "Pendiente"
                              ? "bg-warning text-warning-foreground"
                              : ""
                          }
                          variant={r.status === "ausente" ? "secondary" : "default"}
                        >
                          {r.status ?? "—"}
                        </Badge>
                      </TableCell>
                    )}
                    {col("notas") && (
                      <TableCell className="hidden max-w-[16rem] truncate text-muted-foreground xl:table-cell">
                        {r.notes ?? "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); setEditing(r); }}
                          aria-label="Editar entrada"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); setDeleting(r); }}
                          aria-label="Eliminar entrada"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} defaultDataset="income" />

      <LedgerFormSheet
        mode="create"
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => { setCreating(false); void load(); }}
      />
      <LedgerFormSheet
        mode="edit"
        entry={editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => { setEditing(null); void load(); }}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta entrada?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `Se eliminará la entrada de ${deleting.student_name ?? "—"} (${deleting.item ?? "—"}). Esta acción no se puede deshacer.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return;
                const { error } = await ledger().delete().eq("id", deleting.id);
                if (error) {
                  toast.error("No se pudo eliminar", { description: error.message });
                  return;
                }
                toast.success("Entrada eliminada");
                setDeleting(null);
                void load();
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ----------------------------- Form: create/edit ---------------------------- */

function centsToInput(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toString().replace(".", ",");
}

function inputToCents(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  const num = Number(trimmed);
  if (Number.isNaN(num)) return null;
  return Math.round(num * 100);
}

function LedgerFormSheet({
  mode,
  entry,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: "create" | "edit";
  entry?: LedgerEntry | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [entryDate, setEntryDate] = useState("");
  const [month, setMonth] = useState("JUNIO");
  const [studentName, setStudentName] = useState("");
  const [item, setItem] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("Pendiente");
  const [notes, setNotes] = useState("");
  const [collector, setCollector] = useState<string[]>([]);
  const [commissionPct, setCommissionPct] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && entry) {
      setEntryDate(entry.entry_date ?? "");
      setMonth(entry.month ?? "");
      setStudentName(entry.student_name ?? "");
      setItem(entry.item ?? "");
      setCategory(entry.category ?? "");
      setAmount(centsToInput(entry.amount_cents));
      setMethod(entry.method ?? "");
      setStatus(entry.status ?? "Pendiente");
      setNotes(entry.notes ?? "");
      setCollector(entry.collector ?? []);
      setCommissionPct(
        entry.commission_pct_override != null ? String(entry.commission_pct_override * 100) : "",
      );
    } else if (mode === "create") {
      setEntryDate(new Date().toISOString().slice(0, 10));
      setMonth(new Date().toLocaleDateString("es-ES", { month: "long" }).toUpperCase());
      setStudentName("");
      setItem("");
      setCategory("");
      setAmount("");
      setMethod("");
      setStatus("Pendiente");
      setNotes("");
      setCollector([]);
      setCommissionPct("");
    }
  }, [open, mode, entry]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount.trim() !== "" && inputToCents(amount) === null) {
      toast.error("El importe no es válido");
      return;
    }
    const payload: Partial<LedgerEntry> = {
      entry_date: entryDate || null,
      month: month.trim() || null,
      student_name: studentName.trim() || null,
      item: item.trim() || null,
      category: category.trim() || null,
      amount_cents: inputToCents(amount),
      method: method || null,
      status: status || null,
      notes: notes.trim() || null,
      collector: collector.length ? collector : null,
      commission_pct_override:
        commissionPct.trim() === "" || Number.isNaN(Number(commissionPct.replace(",", ".")))
          ? null
          : Number(commissionPct.replace(",", ".")) / 100,
    };
    setSubmitting(true);
    if (mode === "create") {
      const { error } = await ledger().insert(payload);
      setSubmitting(false);
      if (error) {
        toast.error("No se pudo crear la entrada", { description: error.message });
        return;
      }
      toast.success("Entrada creada");
      onSaved();
    } else if (mode === "edit" && entry) {
      const { error } = await ledger().update(payload).eq("id", entry.id);
      setSubmitting(false);
      if (error) {
        toast.error("No se pudo actualizar", { description: error.message });
        return;
      }
      toast.success("Entrada actualizada");
      onSaved();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{mode === "create" ? "Nueva entrada" : "Editar entrada"}</SheetTitle>
          <SheetDescription>
            Registra un ingreso o actividad. El importe se guarda en euros.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 px-4 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="entry_date">Fecha</Label>
            <Input
              id="entry_date"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entry_month">Mes</Label>
            <Input
              id="entry_month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="Ej. JUNIO"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="student_name">Alumno</Label>
            <Input
              id="student_name"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Nombre del alumno"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item">Clase / Producto</Label>
            <Input
              id="item"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="Ej. Clase suelta, Bono mensual…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Categoría</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ej. Clases, Material…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Importe (€)</Label>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="80,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="method">Método</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="method">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="T">T · Tarjeta</SelectItem>
                  <SelectItem value="E">E · Efectivo</SelectItem>
                  <SelectItem value="B">B · Bizum</SelectItem>
                  <SelectItem value="R">R · Revolut</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Profesora(s)</Label>
              <MultiTeacherSelect value={collector} onChange={setCollector} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commission_pct">Comisión (%)</Label>
              <Input
                id="commission_pct"
                inputMode="decimal"
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
                placeholder="por defecto"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pagado">Pagado</SelectItem>
                <SelectItem value="Pendiente">Pendiente</SelectItem>
                <SelectItem value="ausente">Ausente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas opcionales…"
              rows={3}
            />
          </div>
          <SheetFooter className="px-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando…" : mode === "create" ? "Crear" : "Guardar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
