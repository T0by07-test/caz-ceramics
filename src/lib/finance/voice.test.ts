import { describe, it, expect } from "vitest";
import { normalizeVoiceFields, validateVoiceForm } from "./voice";

describe("normalizeVoiceFields", () => {
  it("returns null for non-object input", () => {
    expect(normalizeVoiceFields(null)).toBeNull();
    expect(normalizeVoiceFields("string")).toBeNull();
    expect(normalizeVoiceFields(42)).toBeNull();
  });

  it("normalizes a complete payload", () => {
    const raw = {
      student_name: "Chris",
      amount_cents: 1500,
      method: "e",
      status: "Pagado",
      month: "junio",
      entry_date: "2026-06-22",
      item: "Clase adultos",
      category: "Adulto",
      collector: ["Sofi"],
      notes: null,
    };
    const r = normalizeVoiceFields(raw)!;
    expect(r.student_name).toBe("Chris");
    expect(r.amount_cents).toBe(1500);
    expect(r.method).toBe("E");
    expect(r.month).toBe("JUNIO");
    expect(r.collector).toEqual(["Sofi"]);
    expect(r.notes).toBeNull();
  });

  it("defaults status to Pagado when unknown", () => {
    const r = normalizeVoiceFields({ status: "weirdvalue" })!;
    expect(r.status).toBe("Pagado");
  });

  it("sets Pendiente when specified", () => {
    const r = normalizeVoiceFields({ status: "Pendiente" })!;
    expect(r.status).toBe("Pendiente");
  });

  it("rounds fractional amount_cents", () => {
    const r = normalizeVoiceFields({ amount_cents: 1499.9 })!;
    expect(r.amount_cents).toBe(1500);
  });

  it("filters non-string values from collector array", () => {
    const r = normalizeVoiceFields({ collector: ["Sofi", 42, null, "Martu"] })!;
    expect(r.collector).toEqual(["Sofi", "Martu"]);
  });
});

describe("validateVoiceForm", () => {
  const base = {
    student_name: "Ana",
    amount_cents: 1500,
    method: "E",
    status: "Pagado" as const,
    month: "JUNIO",
    entry_date: "2026-06-22",
    item: null,
    category: null,
    collector: [],
    notes: null,
  };

  it("passes a complete valid Pagado form", () => {
    expect(validateVoiceForm(base)).toHaveLength(0);
  });

  it("requires student_name", () => {
    const errs = validateVoiceForm({ ...base, student_name: null });
    expect(errs).toContain("Nombre del alumno requerido");
  });

  it("requires month", () => {
    const errs = validateVoiceForm({ ...base, month: null });
    expect(errs).toContain("Mes requerido");
  });

  it("requires amount and method when status is Pagado", () => {
    const errs = validateVoiceForm({ ...base, amount_cents: null, method: null });
    expect(errs).toContain("Importe requerido para pagos cobrados");
    expect(errs).toContain("Método de pago requerido");
  });

  it("does not require amount/method when status is Pendiente", () => {
    const errs = validateVoiceForm({
      ...base,
      status: "Pendiente",
      amount_cents: null,
      method: null,
    });
    expect(errs).toHaveLength(0);
  });
});
