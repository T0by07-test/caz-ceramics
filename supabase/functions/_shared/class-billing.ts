/** Browser/Worker/Deno-safe billing helpers; dates keep their actual calendar day. */
export type BillingClass = { date: string; billing_month?: string | null };

export function billingMonthKey(c: BillingClass): string {
  return (c.billing_month ?? c.date).slice(0, 7);
}

/** Group authoritative per-booking amounts, never split or re-price a total. */
export function groupPricedClassesByMonth(
  classes: (BillingClass & { start_time: string; amount_cents: number })[],
) {
  const groups = new Map<string, { month: string; cents: number; dates: string[] }>();
  for (const c of classes) {
    const month = billingMonthKey(c);
    const group = groups.get(month) ?? { month, cents: 0, dates: [] };
    group.cents += c.amount_cents;
    group.dates.push(`${c.date.slice(8, 10)}/${c.date.slice(5, 7)} ${c.start_time.slice(0, 5)}`);
    groups.set(month, group);
  }
  return [...groups.values()].sort((a, b) => a.month.localeCompare(b.month));
}