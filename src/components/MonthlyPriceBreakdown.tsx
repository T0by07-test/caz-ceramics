import { formatEuros, formatPriceMonth } from "@/lib/pricing";

export function MonthlyPriceBreakdown({ rows }: { rows: { month: string; count: number; cents: number }[] }) {
  return (
    <dl className="flex flex-col gap-1 text-sm" aria-label="Importe por mes">
      {rows.map((row) => (
        <div key={row.month} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <dt className="capitalize text-muted-foreground">{formatPriceMonth(row.month)} · {row.count} {row.count === 1 ? "clase" : "clases"}</dt>
          <dd className="font-medium text-foreground">{formatEuros(row.cents)}</dd>
        </div>
      ))}
    </dl>
  );
}