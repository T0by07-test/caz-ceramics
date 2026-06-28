import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Pencil, Trash2, Receipt, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { tbl, type ExpenseEntryRow } from "@/lib/finance/db";
import { formatEur } from "@/lib/finance/format";
import { ExportDialog } from "@/components/finance/ExportDialog";

export const Route = createFileRoute("/admin/gastos")({
  head: () => ({ meta: [{ title: "Gastos — Admin" }] }),
  component: AdminExpensesPage,
});

const ALL = "all";

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

function AdminExpensesPage() {
  const [rows, setRows] = useState<ExpenseEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [monthFilter, setMonthFilter] = useState(ALL);
  const [editing, setEditing] = useState<ExpenseEntryRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ExpenseEntryRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await tbl("expense_entries")
      .select(
        "id, entry_date, month, category, provider, concept, amount_cents, method, notes, vat_cents, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("No se pudieron cargar los gastos", { description: error.message });
      setRows([]);
    } else {
      setRows((data ?? []) as ExpenseEntryRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("expense:insert", handler);
    return () => window.removeEventListener("expense:insert", handler);
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter((c): c is string => !!c))).sort(),
    [rows],
  );
  const months = useMemo(
    () => Array.from(new Set(rows.map((r) => r.month).filter((m): m is string => !!m))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (categoryFilter !== ALL && r.category !== categoryFilter) return false;
      if (monthFilter !== ALL && r.month !== monthFilter) return false;
      if (q) {
        const hay = [r.provider, r.concept, r.notes].some((v) => (v ?? "").toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [rows, search, categoryFilter, monthFilter]);

  const totals = useMemo(() => {
    let gastos = 0;
    let iva = 0;
    for (const r of filtered) {
      gastos += r.amount_cents ?? 0;
      iva += r.vat_cents ?? 0;
    }
    return { gastos, iva, count: filtered.length };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="text-label uppercase">Finanzas</span>
          <h1 className="text-h1 mt-1">Gastos</h1>
          <p className="text-body mt-2 text-muted-foreground">
            Costes fijos y variables. El IVA soportado reduce el IVA a pagar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Button
            onClick={() => setExportOpen(true)}
            size="lg"
            variant="outline"
            className="flex-1 gap-2 sm:flex-none"
          >
            <FileDown className="h-4 w-4" /> Exportar
          </Button>
          <Button onClick={() => setCreating(true)} size="lg" className="flex-1 gap-2 sm:flex-none">
            <Plus className="h-4 w-4" /> Nuevo gasto
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-label uppercase text-muted-foreground">Gastos</p>
            <p className="mt-1 text-2xl font-semibold text-destructive">{formatEur(totals.gastos)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-label uppercase text-muted-foreground">IVA soportado</p>
            <p className="mt-1 text-2xl font-semibold">{formatEur(totals.iva)}</p>
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
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="search">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Proveedor, concepto o notas…"
                className="pl-9"
              />
            </div>
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

      <Card className="shadow-card">
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Receipt className="h-5 w-5" />}
                title={rows.length === 0 ? "Aún no hay gastos" : "Sin resultados"}
                description={
                  rows.length === 0
                    ? "Añade un gasto para empezar."
                    : "Ajusta los filtros para ver más resultados."
                }
              />
            </div>
          ) : (
            <>
            <ul className="divide-y divide-border md:hidden">
              {filtered.map((r) => (
                <li
                  key={`m-${r.id}`}
                  className="cursor-pointer space-y-1 p-4"
                  onClick={() => setEditing(r)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.concept ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.entry_date ? new Date(r.entry_date).toLocaleDateString("es-ES") : (r.month ?? "—")}
                        {r.category ? ` · ${r.category}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {r.amount_cents != null ? formatEur(r.amount_cents) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{r.method ?? "—"}{r.provider ? ` · ${r.provider}` : ""}</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(r);
                        }}
                        aria-label="Editar gasto"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(r);
                        }}
                        aria-label="Eliminar gasto"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="hidden lg:table-cell">Proveedor</TableHead>
                  <TableHead className="text-right">Importe (€)</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">IVA sop.</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setEditing(r)}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {r.entry_date ? new Date(r.entry_date).toLocaleDateString("es-ES") : (r.month ?? "—")}
                    </TableCell>
                    <TableCell>{r.category ?? "—"}</TableCell>
                    <TableCell className="font-medium">{r.concept ?? "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {r.provider ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.amount_cents != null ? formatEur(r.amount_cents) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                      {r.vat_cents != null ? formatEur(r.vat_cents) : "—"}
                    </TableCell>
                    <TableCell>{r.method ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(r);
                          }}
                          aria-label="Editar gasto"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleting(r);
                          }}
                          aria-label="Eliminar gasto"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} defaultDataset="expense" />

      <ExpenseFormSheet
        mode="create"
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => {
          setCreating(false);
          void load();
        }}
      />
      <ExpenseFormSheet
        mode="edit"
        entry={editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este gasto?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `Se eliminará "${deleting.concept ?? "—"}" (${formatEur(deleting.amount_cents ?? 0)}). Esta acción no se puede deshacer.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return;
                const { error } = await tbl("expense_entries").delete().eq("id", deleting.id);
                if (error) {
                  toast.error("No se pudo eliminar", { description: error.message });
                  return;
                }
                toast.success("Gasto eliminado");
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

function ExpenseFormSheet({
  mode,
  entry,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: "create" | "edit";
  entry?: ExpenseEntryRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [entryDate, setEntryDate] = useState("");
  const [month, setMonth] = useState("");
  const [category, setCategory] = useState("");
  const [provider, setProvider] = useState("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [vat, setVat] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && entry) {
      setEntryDate(entry.entry_date ?? "");
      setMonth(entry.month ?? "");
      setCategory(entry.category ?? "");
      setProvider(entry.provider ?? "");
      setConcept(entry.concept ?? "");
      setAmount(centsToInput(entry.amount_cents));
      setMethod(entry.method ?? "");
      setVat(centsToInput(entry.vat_cents));
      setNotes(entry.notes ?? "");
    } else if (mode === "create") {
      const now = new Date();
      setEntryDate(now.toISOString().slice(0, 10));
      setMonth(now.toLocaleDateString("es-ES", { month: "long" }).toUpperCase());
      setCategory("");
      setProvider("");
      setConcept("");
      setAmount("");
      setMethod("");
      setVat("");
      setNotes("");
    }
  }, [open, mode, entry]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount.trim() !== "" && inputToCents(amount) === null) {
      toast.error("El importe no es válido");
      return;
    }
    const payload: Partial<ExpenseEntryRow> = {
      entry_date: entryDate || null,
      month: month.trim() || null,
      category: category.trim() || null,
      provider: provider.trim() || null,
      concept: concept.trim() || null,
      amount_cents: inputToCents(amount),
      method: method || null,
      vat_cents: inputToCents(vat),
      notes: notes.trim() || null,
    };
    setSubmitting(true);
    if (mode === "create") {
      const { error } = await tbl("expense_entries").insert(payload);
      setSubmitting(false);
      if (error) {
        toast.error("No se pudo crear el gasto", { description: error.message });
        return;
      }
      toast.success("Gasto creado");
      onSaved();
    } else if (mode === "edit" && entry) {
      const { error } = await tbl("expense_entries").update(payload).eq("id", entry.id);
      setSubmitting(false);
      if (error) {
        toast.error("No se pudo actualizar", { description: error.message });
        return;
      }
      toast.success("Gasto actualizado");
      onSaved();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{mode === "create" ? "Nuevo gasto" : "Editar gasto"}</SheetTitle>
          <SheetDescription>Registra un coste. Los importes se guardan en euros.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="g_date">Fecha</Label>
              <Input id="g_date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g_month">Mes</Label>
              <Input id="g_month" value={month} onChange={(e) => setMonth(e.target.value)} placeholder="Ej. JUNIO" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g_category">Categoría</Label>
            <Input id="g_category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ej. Materiales, Alquiler, Horno / Cocción…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g_concept">Concepto</Label>
            <Input id="g_concept" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej. Arcilla, Cocción tanda 1…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g_provider">Proveedor</Label>
            <Input id="g_provider" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="g_amount">Importe (€)</Label>
              <Input id="g_amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="30,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g_vat">IVA soportado (€)</Label>
              <Input id="g_vat" inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="6,30" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g_method">Método</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="g_method">
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
          <div className="space-y-1.5">
            <Label htmlFor="g_notes">Notas</Label>
            <Textarea id="g_notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas opcionales…" rows={3} />
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
