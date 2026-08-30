import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CreditCard, Wallet, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

/** Payments made through the app (card / Bizum / cash-at-studio), grouped per
 * checkout so each row reads like a ledger line: alumna, fecha, nº de clases,
 * importe, método and whether the money is already collected. */

type PaymentRow = {
  id: string;
  student_id: string;
  booking_id: string | null;
  subscription_id: string | null;
  amount_cents: number;
  status: string;
  method: string | null;
  created_at: string;
  stripe_session_id: string | null;
};

type Group = {
  key: string;
  paymentIds: string[];
  studentName: string;
  paidAt: string;
  classCount: number;
  classMonth: string; // YYYY-MM
  amountCents: number;
  method: string | null;
  collected: boolean;
};

function formatEur(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function methodLabel(method: string | null) {
  if (method === "cash") return "Efectivo";
  if (method === "bizum") return "Bizum";
  if (method === "card") return "Tarjeta";
  return "Tarjeta";
}

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

export function AppPaymentsPanel() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: payments } = await supabase
      .from("payments")
      .select(
        "id, student_id, booking_id, subscription_id, amount_cents, status, method, created_at, stripe_session_id",
      )
      .gt("amount_cents", 0)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1000);

    const rows = (payments ?? []) as PaymentRow[];
    const studentIds = Array.from(new Set(rows.map((r) => r.student_id)));
    const bookingIds = rows.map((r) => r.booking_id).filter((v): v is string => Boolean(v));

    // `.in()` with hundreds of ids blows past the request URL limit, so page it.
    const fetchIn = async <T,>(table: string, cols: string, ids: string[]): Promise<T[]> => {
      const out: T[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { data } = await (
          supabase.from as unknown as (t: string) => {
            select: (c: string) => { in: (col: string, v: string[]) => Promise<{ data: T[] | null }> };
          }
        )(table)
          .select(cols)
          .in("id", chunk);
        if (data) out.push(...data);
      }
      return out;
    };

    const [profiles, bookings] = await Promise.all([
      fetchIn<{ id: string; name: string | null; surname: string | null; email: string | null }>(
        "profiles",
        "id, name, surname, email",
        studentIds,
      ),
      fetchIn<{ id: string; class_id: string }>(
        "bookings",
        "id, class_id",
        Array.from(new Set(bookingIds)),
      ),
    ]);

    const classIds = Array.from(new Set(bookings.map((b) => b.class_id)));
    const classes = await fetchIn<{ id: string; date: string }>("classes", "id, date", classIds);

    const nameById = new Map(
      ((profiles ?? []) as { id: string; name: string | null; surname: string | null; email: string | null }[]).map(
        (p) => [p.id, [p.name, p.surname].filter(Boolean).join(" ").trim() || p.email || "—"],
      ),
    );
    const classDateById = new Map(
      ((classes ?? []) as { id: string; date: string }[]).map((c) => [c.id, c.date]),
    );
    const bookingClassDate = new Map(
      ((bookings ?? []) as { id: string; class_id: string }[]).map((b) => [
        b.id,
        classDateById.get(b.class_id) ?? null,
      ]),
    );

    const byKey = new Map<string, Group>();
    for (const p of rows) {
      const key = p.stripe_session_id ?? p.id;
      const classDate = p.booking_id ? bookingClassDate.get(p.booking_id) ?? null : null;
      const existing = byKey.get(key);
      if (existing) {
        existing.amountCents += p.amount_cents;
        existing.classCount += p.booking_id ? 1 : 0;
        existing.paymentIds.push(p.id);
        existing.collected = existing.collected && p.status === "confirmed";
        if (classDate && monthKey(classDate) < existing.classMonth) {
          existing.classMonth = monthKey(classDate);
        }
      } else {
        byKey.set(key, {
          key,
          paymentIds: [p.id],
          studentName: nameById.get(p.student_id) ?? "—",
          paidAt: p.created_at,
          classCount: p.booking_id ? 1 : 0,
          classMonth: monthKey(classDate ?? p.created_at),
          amountCents: p.amount_cents,
          method: p.method,
          collected: p.status === "confirmed",
        });
      }
    }

    const list = Array.from(byKey.values()).sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
    setGroups(list);
    // Default to the month that actually has app bookings (the studio bills the
    // month the classes happen in, which is usually ahead of "today").
    if (!initialized.current) {
      initialized.current = true;
      // Land on the month with most bookings (the studio bills the month the
      // classes happen in, usually ahead of "today").
      const counts = new Map<string, number>();
      for (const g of list) counts.set(g.classMonth, (counts.get(g.classMonth) ?? 0) + 1);
      const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0];
      if (best) setMonth(best[0]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const months = useMemo(() => {
    const set = new Set(groups.map((g) => g.classMonth));
    set.add(month);
    return Array.from(set).sort().reverse();
  }, [groups, month]);

  const visible = useMemo(
    () => groups.filter((g) => g.classMonth === month),
    [groups, month],
  );

  const totals = useMemo(() => {
    let collected = 0;
    let pending = 0;
    for (const g of visible) {
      if (g.collected) collected += g.amountCents;
      else pending += g.amountCents;
    }
    return { collected, pending };
  }, [visible]);

  const markCollected = async (g: Group) => {
    setConfirming(g.key);
    for (const id of g.paymentIds) {
      const { error } = await supabase.rpc("admin_confirm_payment", { p_payment_id: id });
      if (error) {
        setConfirming(null);
        toast.error("No se pudo marcar como cobrado", { description: error.message });
        return;
      }
    }
    setConfirming(null);
    toast.success("Pago cobrado", { description: `${g.studentName} · ${formatEur(g.amountCents)}` });
    await load();
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-label text-muted-foreground">Pagos de la app</p>
            <p className="text-body mt-1 text-muted-foreground">
              Reservas hechas desde la web: quién ya pagó con tarjeta o Bizum (cobrado) y quién paga
              en efectivo en el taller (pendiente).
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="app-payments-month">Mes de las clases</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger id="app-payments-month" className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>
                      {monthLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="icon" aria-label="Actualizar" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border p-3">
            <p className="text-label text-muted-foreground">Cobrado (tarjeta/Bizum)</p>
            <p className="mt-1 text-xl font-normal text-success">{formatEur(totals.collected)}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-label text-muted-foreground">Pendiente (efectivo)</p>
            <p className="mt-1 text-xl font-normal text-warning">{formatEur(totals.pending)}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-label text-muted-foreground">Alumnas</p>
            <p className="mt-1 text-xl font-normal">{visible.length}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title="Sin pagos de la app en este mes"
            description="Cuando una alumna reserve desde la web aparecerá aquí."
          />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {visible.map((g) => (
                <li key={g.key} className="flex flex-col gap-1.5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{g.studentName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(g.paidAt).toLocaleDateString("es-ES")} ·{" "}
                        {g.classCount > 0
                          ? `${g.classCount} ${g.classCount === 1 ? "clase" : "clases"}`
                          : "Plan"}{" "}
                        · {methodLabel(g.method)}
                      </p>
                    </div>
                    <span className="shrink-0 font-normal tabular-nums">
                      {formatEur(g.amountCents)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge collected={g.collected} />
                    {!g.collected && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={confirming === g.key}
                        onClick={() => void markCollected(g)}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" /> Marcar cobrado
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Alumna</TableHead>
                    <TableHead>Clases</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((g) => (
                    <TableRow key={g.key}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(g.paidAt).toLocaleDateString("es-ES")}
                      </TableCell>
                      <TableCell className="font-medium">{g.studentName}</TableCell>
                      <TableCell>{g.classCount > 0 ? g.classCount : "Plan"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          {g.method === "cash" ? (
                            <Wallet className="h-3.5 w-3.5" />
                          ) : (
                            <CreditCard className="h-3.5 w-3.5" />
                          )}
                          {methodLabel(g.method)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge collected={g.collected} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEur(g.amountCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {g.collected ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={confirming === g.key}
                            onClick={() => void markCollected(g)}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" /> Marcar cobrado
                          </Button>
                        )}
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
  );
}

function StatusBadge({ collected }: { collected: boolean }) {
  return collected ? (
    <Badge className="bg-success text-success-foreground">Cobrado</Badge>
  ) : (
    <Badge variant="secondary">Pendiente · efectivo</Badge>
  );
}
