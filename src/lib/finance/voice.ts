export interface VoiceExtracted {
  student_name: string | null;
  amount_cents: number | null;
  method: string | null;
  status: "Pagado" | "Pendiente";
  month: string | null;
  entry_date: string | null;
  item: string | null;
  category: string | null;
  collector: string[];
  notes: string | null;
}

export function normalizeVoiceFields(raw: unknown): VoiceExtracted | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    student_name: typeof r.student_name === "string" && r.student_name ? r.student_name : null,
    amount_cents: typeof r.amount_cents === "number" ? Math.round(r.amount_cents) : null,
    method: typeof r.method === "string" && r.method ? r.method.toUpperCase() : null,
    status: r.status === "Pendiente" ? "Pendiente" : "Pagado",
    month: typeof r.month === "string" && r.month ? r.month.toUpperCase() : null,
    entry_date: typeof r.entry_date === "string" && r.entry_date ? r.entry_date : null,
    item: typeof r.item === "string" && r.item ? r.item : null,
    category: typeof r.category === "string" && r.category ? r.category : null,
    collector: Array.isArray(r.collector)
      ? (r.collector as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    notes: typeof r.notes === "string" && r.notes ? r.notes : null,
  };
}

export function validateVoiceForm(f: VoiceExtracted): string[] {
  const errors: string[] = [];
  if (!f.student_name) errors.push("Nombre del alumno requerido");
  if (!f.month) errors.push("Mes requerido");
  if (!f.entry_date) errors.push("Fecha requerida");
  if (f.status === "Pagado") {
    if (f.amount_cents === null) errors.push("Importe requerido para pagos cobrados");
    if (!f.method) errors.push("Método de pago requerido");
  }
  return errors;
}
