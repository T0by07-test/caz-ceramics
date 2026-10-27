import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import type { Voucher } from "@/components/admin/Vouchers";

const eur = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

/** Vouchers count as income in the month they were bought (purchase_date). */
export function useVoucherIncome(isoMonth: string | null) {
  const [all, setAll] = useState<Voucher[]>([]);
  useEffect(() => {
    void supabase
      .from("vouchers")
      .select("*")
      .order("purchase_date", { ascending: false })
      .then(({ data }) => setAll((data ?? []) as Voucher[]));
  }, []);
  return useMemo(() => {
    const vouchers = isoMonth ? all.filter((v) => v.purchase_date.startsWith(isoMonth)) : all;
    let paid = 0;
    let pending = 0;
    for (const v of vouchers) {
      if (v.is_paid) paid += v.price_cents ?? 0;
      else pending += v.price_cents ?? 0;
    }
    return { vouchers, paid, pending };
  }, [all, isoMonth]);
}

export function VoucherIncomePanel({ vouchers }: { vouchers: Voucher[] }) {
  if (vouchers.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="text-h2 mb-1">Vouchers</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Se cuentan en el mes en que se compraron. Para editarlos ve a Clases → Vouchers.
        </p>
        <ul className="flex flex-col divide-y divide-border">
          {vouchers.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                Para <strong className="font-medium">{v.recipients}</strong>
                {v.buyer_name ? ` · encargado por ${v.buyer_name}` : ""}
              </span>
              <span className="flex items-center gap-2">
                <span>{eur(v.price_cents ?? 0)}</span>
                <span
                  className={
                    v.is_paid
                      ? "rounded-sm bg-success/10 px-1.5 py-0.5 text-xs text-success"
                      : "rounded-sm bg-warning/10 px-1.5 py-0.5 text-xs text-warning"
                  }
                >
                  {v.is_paid ? `Cobrado${v.payment_method ? " · " + v.payment_method : ""}` : "Pendiente"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
