import { formatEuros, formatPriceMonth } from "@/lib/pricing";

type BreakdownClass = { id: string; date: string; start_time?: string | null; end_time?: string | null };

function formatClassLine(c: BreakdownClass): string {
  const [y, m, d] = c.date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const start = c.start_time?.slice(0, 5);
  const end = c.end_time?.slice(0, 5);
  return start ? `${day} · ${start}${end ? `–${end}` : ""}` : day;
}

/**
 * Per-month price summary. When `classes` is passed (the same selection used for
 * the quote), each month lists every class date/time before its subtotal, and a
 * grand total is shown when more than one month is involved.
 */
export function MonthlyPriceBreakdown({
  rows,
  classes,
}: {
  rows: { month: string; count: number; cents: number }[];
  classes?: BreakdownClass[];
}) {
  const total = rows.reduce((sum, row) => sum + row.cents, 0);
  return (
    <dl className="flex flex-col gap-2 text-sm" aria-label="Importe por mes">
      {rows.map((row) => {
        const items = (classes ?? [])
          .filter((c) => c.date.slice(0, 7) === row.month)
          .sort((a, b) => `${a.date}${a.start_time ?? ""}`.localeCompare(`${b.date}${b.start_time ?? ""}`));
        return (
          <div key={row.month} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <dt className="capitalize text-muted-foreground">
                {formatPriceMonth(row.month)} · {row.count} {row.count === 1 ? "clase" : "clases"}
              </dt>
              <dd className="font-medium text-foreground">{formatEuros(row.cents)}</dd>
            </div>
            {items.length > 0 ? (
              <ul className="pl-3 text-xs text-muted-foreground" aria-label={`Clases de ${formatPriceMonth(row.month)}`}>
                {items.map((c) => (
                  <li key={c.id} className="capitalize">{formatClassLine(c)}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
      {classes && rows.length > 1 ? (
        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-1">
          <dt className="font-medium text-foreground">Total</dt>
          <dd className="font-semibold text-foreground">{formatEuros(total)}</dd>
        </div>
      ) : null}
    </dl>
  );
}
